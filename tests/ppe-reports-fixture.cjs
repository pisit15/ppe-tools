const {startFixture,product,secondProduct}=require('./ppe-requests-fixture.cjs');
async function start() {
  const {db}=await startFixture();
  await db.query(`update ppe_transactions set quantity=10000 where product_id=$1 and transaction_type='stock_in'`,[product]);
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,department,employee_name,employee_code)
    select 'amt',$1,'stock_out',1,'pair','2026-10-01','ฝ่ายผลิตและประกอบอุปกรณ์ป้องกันอันตราย ชื่อแผนกฉบับเต็ม','สมชาย','001' from generate_series(1,2105)`,[product]);
  for(const [kind,qty,unit,date] of [['borrow',7,'pair','2026-10-31'],['stock_out',13,'pair','2026-09-01'],['stock_out',1001,'pair','2026-11-01'],['return',5,'pair','2026-10-10'],['stock_out',3,'box','2026-10-10']])
    await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,department,employee_name,employee_code) values('amt',$1,$2,$3,$4,$5,'ฝ่ายผลิตและประกอบอุปกรณ์ป้องกันอันตราย ชื่อแผนกฉบับเต็ม','สมชาย','001')`,[product,kind,qty,unit,date]);
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,department) values('amt',$1,'borrow',2,'piece','2026-10-15','ฝ่ายผลิตและประกอบอุปกรณ์ป้องกันอันตราย ชื่อแผนกฉบับเต็ม')`,[secondProduct]);
  await db.query(`update ppe_products set is_active=false where id=$1`,[secondProduct]);
  await db.exec(`insert into ppe_products(company_id,name,type,unit) select 'amt','อุปกรณ์เพิ่มเติม ชื่อสินค้าแบบเต็มที่มีรายละเอียดและขนาด รุ่น '||lpad(i::text,2,'0'),'others','piece' from generate_series(1,12) i;
    insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date)
    select 'amt',id,'stock_in',10,'piece','2026-09-01' from ppe_products where name like 'อุปกรณ์เพิ่มเติม%';
    insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,department)
    select 'amt',id,'stock_out',2,'piece','2026-10-20','ฝ่ายผลิตและประกอบอุปกรณ์ป้องกันอันตราย ชื่อแผนกฉบับเต็ม' from ppe_products where name like 'อุปกรณ์เพิ่มเติม%';`);
  console.log('Report fixture seeded: more than 2,000 movements and 10 products');
}
start().catch(e=>{console.error(e);process.exit(1);});
