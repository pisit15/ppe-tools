// Local-only PostgREST subset backed by real PostgreSQL (PGlite). No production credentials.
const {PGlite} = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const root = path.join(__dirname,'..');
async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create table company_settings(company_id text primary key,company_name text);
    create table admin_accounts(id uuid primary key default gen_random_uuid(),username text,password text,role text,display_name text,is_active boolean default true,created_at timestamptz default now());
    create table company_users(id uuid primary key default gen_random_uuid(),username text,password text,company_id text,company_name text,role text default 'user',is_active boolean default true,created_at timestamptz default now());
    create table tools_users(like company_users including all);
    insert into company_settings values ('amt','AMT'),('aab','AAB');
  `);
  for(const f of ['007_chemical_management.sql','008_chem_company_settings.sql','20261009053527_chemical_integrity.sql']) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
  const hash = bcrypt.hashSync('local-test-only',4);
  await db.query("insert into admin_accounts(username,password,role,display_name) values ('audit-admin',$1,'super_admin','Local test admin')",[hash]);
  await db.query("insert into company_users(username,password,company_id,company_name) values ('audit-amt',$1,'amt','AMT')",[hash]);
  await db.exec(`
    insert into chem_storage_areas(id,company_id,name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amt','คลัง AMT'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aab','คลัง AAB');
    insert into chem_substances(id,company_id,name,storage_class,sds_url,sds_revision_date) values
      ('11111111-1111-4111-8111-111111111111','amt','Test Acetone','3A','https://example.com/sds.pdf','2025-01-01'),
      ('22222222-2222-4222-8222-222222222222','amt','Test Missing SDS','8B',null,null),
      ('33333333-3333-4333-8333-333333333333','amt','Test Missing Date','5.1B','https://example.com/sds.pdf',null),
      ('44444444-4444-4444-8444-444444444444','aab','Test AAB Only','8B',null,null);
    insert into chem_substances(company_id,name,is_demo) values ('amt','Demo only',true);
    insert into chem_company_settings(company_id,sds_review_years,sds_review_policy) values ('amt',2,'Test company policy');
  `);
  return db;
}
function ident(v) { if(!/^[a-z_][a-z0-9_]*$/.test(v)) throw new Error('Unsupported identifier'); return '"' + v + '"'; }
async function startFixture(port=4311) {
  let db = await createDb();
  const server = http.createServer(async(req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      if(url.pathname === '/__test/reset' && req.method === 'POST') { await db.close(); db = await createDb(); return json(200,{ok:true}); }
      if(url.pathname === '/__test/state') return json(200,(await db.query('select * from chem_substances order by name')).rows);
      if(url.pathname === '/health') return json(200,{ok:true});
      if(!url.pathname.startsWith('/rest/v1/')) return json(404,{message:'Not found'});
      if(req.headers.authorization !== 'Bearer local-test-service-secret') return json(403,{message:'Test fixture requires server key'});
      const table = ident(url.pathname.split('/').pop()); const params=[]; const predicates=[];
      for(const [key,value] of url.searchParams) {
        if(['select','order','limit','on_conflict','offset','columns'].includes(key))continue;
        const [op,...parts]=value.split('.'); const val=parts.join('.');
        if(op === 'eq'||op === 'ilike') {params.push(val);predicates.push(ident(key)+(op === 'eq'?' = ':' ilike ')+'$'+params.length);}
        else if(op === 'in') {const values=val.slice(1,-1).split(',');predicates.push(ident(key)+' in ('+values.map(v=>{params.push(v);return '$'+params.length;}).join(',')+')');}
        else throw new Error('Unsupported filter '+value);
      }
      let rows;
      const where=predicates.length?' where '+predicates.join(' and '):'';
      if(req.method === 'GET') {
        let order=''; const spec=url.searchParams.get('order'); if(spec)order=' order by '+spec.split(',').map(x=>{const [k,d]=x.split('.');return ident(k)+(d==='desc'?' desc':' asc');}).join(',');
        rows=(await db.query('select * from '+table+where+order,params)).rows;
      } else {
        let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);const entries=Object.entries(Array.isArray(body)?body[0]:body);
        const value=(k,v)=>['first_aid','emergency_contacts'].includes(k)?JSON.stringify(v):v;
        if(req.method==='POST'){
          const cols=entries.map(([k])=>ident(k)).join(',');const values=entries.map(([k,v])=>{params.push(value(k,v));return '$'+params.length;}).join(',');
          const conflict=url.searchParams.get('on_conflict');const upsert=conflict?' on conflict ('+ident(conflict)+') do update set '+entries.filter(([k])=>k!==conflict).map(([k])=>ident(k)+'=excluded.'+ident(k)).join(','):'';
          rows=(await db.query('insert into '+table+'('+cols+') values ('+values+')'+upsert+' returning *',params)).rows;
        }else if(req.method==='PATCH'){
          const set=entries.map(([k,v])=>{params.push(value(k,v));return ident(k)+'=$'+params.length;}).join(',');
          rows=(await db.query('update '+table+' set '+set+where+' returning *',params)).rows;
        }else return json(405,{message:'Unsupported method'});
      }
      for(const row of rows) if(row.sds_revision_date instanceof Date) row.sds_revision_date = row.sds_revision_date.toISOString().slice(0,10);
      if((url.searchParams.get('select')||'').includes('chem_storage_areas')){
        for(const row of rows) row.chem_storage_areas=row.storage_area_id?(await db.query('select id,name from chem_storage_areas where id=$1',[row.storage_area_id])).rows[0]||null:null;
      }
      if((req.headers.accept||'').includes('application/vnd.pgrst.object+json')){
        if(rows.length!==1)return json(406,{code:'PGRST116',message:'Expected one row',details:rows.length+' rows'});
        return json(req.method==='POST'?201:200,rows[0]);
      }
      return json(req.method==='POST'?201:200,rows);
    }catch(e){console.error('fixture:',e.message);return json(400,{message:e.message,code:e.code});}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {get db(){return db;},server};
}
module.exports={createDb,startFixture};
