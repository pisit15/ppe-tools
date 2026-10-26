// Isolated local PostgreSQL + a minimal PostgREST transport. Production routes,
// cookies, password hashes and SQL functions are exercised without production data.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const bcrypt = require('bcryptjs');
const root = path.join(__dirname,'..');
const product = '11111111-1111-4111-8111-111111111111';
const otherProduct = '22222222-2222-4222-8222-222222222222';
const secondProduct = '33333333-3333-4333-8333-333333333333';
const ident = x => { if(!/^[a-z_][a-z0-9_]*$/.test(x)) throw new Error('Invalid identifier'); return `"${x}"`; };
async function createDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table company_settings(company_id text primary key,company_name text);
    create table company_users(id serial primary key,username text,password text,company_id text,display_name text,allowed_modules text[],is_active boolean default true,created_at timestamptz default now());
    create table tools_users(id uuid primary key default gen_random_uuid(),username text,password text,company_id text,display_name text,is_active boolean default true,created_at timestamptz default now());
    create table admin_accounts(id serial primary key,username text,password text,display_name text,is_active boolean default true,created_at timestamptz default now());
    create table ppe_departments(id serial primary key,company_id text,name text,is_active boolean default true);
    create table ppe_order_settings(company_id text); create table ppe_order_remarks(id integer);
    insert into company_settings values('amt','AMT'),('aab','AAB');`);
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/001_ppe_tables.sql'),'utf8'));
  for(const file of ['20261023110422_ppe_product_reorder_policy.sql','20261026020248_ppe_request_workflow.sql','20261026020729_ppe_private_stock_view.sql','20261026024306_ppe_request_batch.sql','20261026030118_ppe_optional_request_reason.sql']) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  const hash = await bcrypt.hash('local-test-password',4);
  await db.query(`insert into company_users(username,password,company_id,display_name) values('manager-amt',$1,'amt','ผู้ดูแล AMT'),('manager-aab',$1,'aab','ผู้ดูแล AAB')`,[hash]);
  await db.query(`insert into ppe_products(id,company_id,name,type,unit) values($1,'amt','ถุงมือป้องกันการบาด ขนาด L','gloves','pair'),($2,'aab','สินค้าเฉพาะ AAB','gloves','pair')`,[product,otherProduct]);
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit) values('amt',$1,'stock_in',100,'pair')`,[product]);
  await db.query(`insert into ppe_products(id,company_id,name,type,unit,image_url) values($1,'amt','แว่นตานิรภัย สีใส','glasses','piece','https://images.example.test/safety-glasses.png')`,[secondProduct]);
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit) values('amt',$1,'stock_in',10,'piece')`,[secondProduct]);
  await db.exec(`grant select on company_users,tools_users,admin_accounts,company_settings to service_role; grant usage on schema public to service_role;`);
  return db;
}
async function startFixture(port=4328) {
  const db=await createDb();
  const server=http.createServer(async(req,res)=>{
    const json=(status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(data));};
    try {
      if(req.url==='/health')return json(200,{ok:true});
      const url=new URL(req.url,'http://127.0.0.1');
      let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;
      const result=await db.transaction(async tx=>{
        await tx.exec(req.headers.apikey==='local-ppe-service'?'set local role service_role':'set local role anon');
        if(url.pathname==='/rest/v1/rpc/ppe_request_action') {
          const keys=['p_actor_table','p_actor_id','p_company','p_action','p_request_id','p_product_id','p_quantity','p_note','p_key'];
          return {data:(await tx.query(`select ppe_request_action(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as result`,keys.map(k=>body[k]))).rows[0].result};
        }
        if(url.pathname==='/rest/v1/rpc/ppe_request_batch') {
          return {data:(await tx.query('select ppe_request_batch($1,$2,$3,$4::jsonb,$5) as result',[body.p_actor_table,body.p_actor_id,body.p_company,JSON.stringify(body.p_items),body.p_note])).rows[0].result};
        }
        const tableName=url.pathname.split('/')[3]; const table=ident(tableName);
        const params=[], predicates=[];
        for(const [key,value] of url.searchParams) {
          if(['select','order','limit','offset','columns'].includes(key))continue;
          const column=ident(key); const at=value.indexOf('.'); const op=value.slice(0,at), val=value.slice(at+1);
          params.push(val==='true'?true:val==='false'?false:val);
          if(op==='eq')predicates.push(`${column}=$${params.length}`);
          else if(op==='ilike')predicates.push(`${column} ilike $${params.length}`);
          else if(op==='gte')predicates.push(`${column}>=$${params.length}`);
          else if(op==='lte')predicates.push(`${column}<=$${params.length}`);
          else throw new Error('Unsupported filter '+op);
        }
        const where=predicates.length?' where '+predicates.join(' and '):'';
        let rows,count;
        if(req.method==='GET') {
          count=Number((await tx.query('select count(*) as n from '+table+where,params)).rows[0].n);
          const spec=url.searchParams.get('order'); const order=spec?' order by '+spec.split(',').map(s=>{const [c,d]=s.split('.');return ident(c)+(d==='desc'?' desc':' asc');}).join(','):'';
          const range=String(req.headers.range||'').split('-').map(Number);
          const offset=Number(url.searchParams.get('offset')||range[0]||0), limit=Number(url.searchParams.get('limit')||(range[1]?range[1]-offset+1:1000));
          rows=(await tx.query('select * from '+table+where+order+` limit ${limit} offset ${offset}`,params)).rows;
        } else if(req.method==='POST') {
          const row=Array.isArray(body)?body[0]:body, keys=Object.keys(row);
          rows=(await tx.query(`insert into ${table}(${keys.map(ident).join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row))).rows;
        } else if(req.method==='PATCH') {
          const assignments=Object.entries(body).map(([k,v])=>{params.push(v);return `${ident(k)}=$${params.length}`;});
          rows=(await tx.query(`update ${table} set ${assignments.join(',')}${where} returning *`,params)).rows;
        } else throw new Error('Unsupported method');
        const selection=url.searchParams.get('select')||'*';
        // PostgREST serializes PostgreSQL DATE as YYYY-MM-DD, unlike PGlite's Date object.
        for(const row of rows) if(row.transaction_date instanceof Date) row.transaction_date=row.transaction_date.toISOString().slice(0,10);
        if(selection.includes('ppe_products(')) for(const row of rows) row.ppe_products=(await tx.query('select name,unit from ppe_products where id=$1',[row.product_id])).rows[0];
        if(selection.includes('ppe_requesters(')) for(const row of rows) row.ppe_requesters=(await tx.query('select display_name,employee_code,department from ppe_requesters where id=$1',[row.requester_id])).rows[0];
        if(selection.includes('ppe_request_events(')) for(const row of rows) row.ppe_request_events=(await tx.query('select id,action,actor_name,quantity,note,created_at from ppe_request_events where request_id=$1',[row.id])).rows;
        if(!selection.startsWith('*')) rows=rows.map(row=>Object.fromEntries(selection.split(',').map(key=>[key,row[key]])));
        if(String(req.headers.accept).includes('vnd.pgrst.object')) {
          if(rows.length!==1)return {error:{code:'PGRST116',message:'Expected one row',details:`The result contains ${rows.length} rows`},status:406};
          return {data:rows[0],count};
        }
        return {data:rows,count};
      });
      return json(result.status||200,result.error||result.data,result.count!=null?{'content-range':`0-${Math.max(0,result.count-1)}/${result.count}`} : {});
    } catch(e) { return json(400,{code:e.code,message:e.message}); }
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  console.log('PPE local PostgreSQL fixture ready');
  return {db,server};
}
module.exports={createDb,startFixture,product,otherProduct,secondProduct};
if(require.main===module)startFixture().catch(e=>{console.error(e);process.exit(1);});
