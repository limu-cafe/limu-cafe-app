const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const [actor,payer,a,b,unlimited]=[1,2,10,11,12].map(id),dir=path.resolve(__dirname,'../../supabase/migrations');
// Isolated PostgreSQL, no network. PGlite serializes one connection; the ordered
// scenarios below are not a multi-connection load/deadlock benchmark.
test('one delivery preserves inventory, one receipt, the actual payer and the whole financial ledger',{skip:!process.env.PGLITE_MODULE},async t=>{
 const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE users(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true,is_approved boolean DEFAULT true,balance int DEFAULT 1000,deferred_balance int DEFAULT 0,points_balance int DEFAULT 30);
 CREATE TABLE items(id uuid PRIMARY KEY,name text,stock int NOT NULL,is_available boolean DEFAULT true,is_unlimited_stock boolean DEFAULT false,updated_at timestamptz DEFAULT now());
 CREATE TABLE stock_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid REFERENCES items(id),change_amount int,reason text,note text,created_by uuid REFERENCES users(id));
 CREATE TABLE purchase_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),total_amount int NOT NULL CHECK(total_amount>0),payment_source text,reimbursement_status text,vendor text,note text,purchased_by uuid REFERENCES users(id),created_by uuid REFERENCES users(id),reimbursed_by uuid REFERENCES users(id),reimbursed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE purchase_run_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_run_id uuid REFERENCES purchase_runs(id),item_id uuid REFERENCES items(id),item_name text,quantity int,unit_price int NOT NULL CHECK(unit_price>=0),subtotal int NOT NULL CHECK(subtotal>=0));
 CREATE TABLE cashbox_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_type text,direction text,amount int CHECK(amount>0),purchase_run_id uuid REFERENCES purchase_runs(id),note text,created_by uuid REFERENCES users(id));
 CREATE UNIQUE INDEX cash_unique ON cashbox_entries(purchase_run_id,entry_type);
 CREATE TABLE admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action_type text,target_type text,target_id text,summary text,metadata jsonb);
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_method text,payment_status text,total_amount int);
 CREATE TABLE subscription_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_status text,cash_due_amount int);
 INSERT INTO users(id,name,deferred_balance) VALUES('${actor}','入力者',130),('${payer}','立替者',1000);
 INSERT INTO items(id,name,stock,is_unlimited_stock) VALUES('${a}','水',12,false),('${b}','緑茶',15,false),('${unlimited}','在庫なし',0,true);
 INSERT INTO purchase_runs(id,total_amount,payment_source,reimbursement_status,purchased_by) VALUES('${id(90)}',500,'cashbox','not_needed','${actor}');
 INSERT INTO purchase_run_items(purchase_run_id,item_id,item_name,quantity,unit_price,subtotal) VALUES('${id(90)}','${a}','水',5,100,500);
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
 const legacy=(await db.query('SELECT * FROM purchase_run_items')).rows;
 for(const file of ['20261016095407_atomic_restock.sql','20261120062027_batch_advance_reimbursements.sql','20261120075341_batch_stock_receipts.sql'])await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const rows=[{item_id:b,quantity:3,subtotal:null},{item_id:a,quantity:2,subtotal:null}],input={rows,note:'買い出し',purchase:null};
 const call=async(n,payload=input,who=actor)=>(await q('SELECT record_stock_receipt($1,$2::jsonb,$3) result',[id(n),JSON.stringify(payload),who]))[0].result;
 const tables=['users','items','purchase_runs','purchase_run_items','stock_history','cashbox_entries','stock_receipts','stock_adjustments','admin_audit_logs'];
 const snap=async()=>JSON.stringify(await Promise.all(tables.map(async table=>(await q(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM ${table} t`))[0].rows)));
 await t.test('migration leaves every historical amount and identity intact; unknown per-line cost is not zero',async()=>{assert.deepEqual((await db.query('SELECT * FROM purchase_run_items')).rows,legacy);assert.equal((await q('SELECT count(*) n FROM stock_receipts'))[0].n,0);});
 await t.test('inventory-only is one receipt and two additions; retry order does not matter',async()=>{
  const wallets=await q('SELECT * FROM users ORDER BY id');await db.exec('SET ROLE service_role');const r=await call(100);await db.exec('RESET ROLE');assert.equal(r.rows.length,2);assert.equal(r.purchase,null);assert.deepEqual(r.rows.map(r=>[r.item_name,r.stock_before,r.stock_after]),[['水',12,14],['緑茶',15,18]]);
  const before=await snap();assert.deepEqual(await call(100,{...input,rows:[...rows].reverse()}),r);assert.equal(await snap(),before);await assert.rejects(()=>call(100,{...input,note:'changed'}));assert.equal(await snap(),before);assert.deepEqual(await q('SELECT * FROM users ORDER BY id'),wallets);assert.equal((await q('SELECT count(*) n FROM purchase_runs'))[0].n,1);
 });
 await t.test('one cashbox purchase and one outflow cover all products without invented cost allocations',async()=>{
  const r=await call(101,{...input,purchase:{payment_source:'cashbox',total_amount:1000,vendor:'売店'}});assert.equal(r.purchase.total_amount,1000);
  assert.deepEqual(await q('SELECT unit_price,subtotal FROM purchase_run_items WHERE purchase_run_id=$1',[r.purchase.id]),[{unit_price:null,subtotal:null},{unit_price:null,subtotal:null}]);
  const out=await q('SELECT amount,purchase_run_id FROM cashbox_entries');assert.deepEqual(out,[{amount:1000,purchase_run_id:r.purchase.id}]);
 });
 await t.test('proxy entry belongs to the actual payer; settling the receipt never changes stock again',async()=>{
  const r=await call(102,{...input,rows:rows.map((r,i)=>({...r,subtotal:i?200:400})),purchase:{payment_source:'personal_advance',purchased_by:payer,total_amount:600}});
  assert.equal(r.purchase.purchased_by,payer);assert.equal((await q('SELECT created_by FROM purchase_runs WHERE id=$1',[r.purchase.id]))[0].created_by,actor);assert.equal((await q('SELECT count(*) n FROM cashbox_entries'))[0].n,1);
  const before=await q('SELECT stock FROM items ORDER BY id');const paid=(await q('SELECT admin_reimburse_advances($1,$2,$3::jsonb,$4) result',[id(300),payer,JSON.stringify([{id:r.purchase.id,expected_amount:600}]),actor]))[0].result;assert.equal(paid.amount,600);assert.deepEqual(await q('SELECT stock FROM items ORDER BY id'),before);assert.equal((await q('SELECT count(*) n FROM cashbox_entries'))[0].n,2);
 });
 await t.test('bad quantity, duplicate, missing/unlimited product, mismatched costs, inactive payer and overflow roll back every row',async()=>{
  const invalid=[{...input,rows:[rows[0],rows[0]]},{...input,rows:[rows[0],{item_id:id(999),quantity:1}]},{...input,rows:[rows[0],{item_id:unlimited,quantity:1}]},{...input,rows:[{item_id:a,quantity:-1}]},{...input,rows:[{item_id:a,quantity:1,subtotal:10},{item_id:b,quantity:1,subtotal:null}],purchase:{payment_source:'cashbox',total_amount:10}},{...input,purchase:{payment_source:'personal_advance',purchased_by:id(999),total_amount:20}},{...input,rows:[rows[0],{item_id:a,quantity:2147483647}]}];
  for(const payload of invalid){const before=await snap();await assert.rejects(()=>call(103,payload));assert.equal(await snap(),before);}
  await db.exec(`UPDATE users SET is_active=false WHERE id='${payer}'`);const before=await snap();await assert.rejects(()=>call(103,{...input,purchase:{payment_source:'personal_advance',purchased_by:payer,total_amount:20}}));assert.equal(await snap(),before);await db.exec(`UPDATE users SET is_active=true WHERE id='${payer}'`);
 });
 await t.test('failure on the final audit reverses items, history, purchase, cash and operation receipt together',async()=>{
  await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced failure';END$$;CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();`);const before=await snap();await assert.rejects(()=>call(104,{...input,purchase:{payment_source:'cashbox',total_amount:700}}),/forced failure/);assert.equal(await snap(),before);await db.exec('DROP TRIGGER fail ON admin_audit_logs');assert.equal((await call(104)).ok,true);
 });
 await t.test('purchase order before/after a multi-product restock and old single restock keep relative stock',async()=>{
  await db.exec(`UPDATE items SET stock=12 WHERE id='${a}';UPDATE items SET stock=stock-2 WHERE id='${a}';`);await call(105);assert.equal((await q('SELECT stock FROM items WHERE id=$1',[a]))[0].stock,12);
  await call(106);await db.exec(`UPDATE items SET stock=stock-2 WHERE id='${a}'`);assert.equal((await q('SELECT stock FROM items WHERE id=$1',[a]))[0].stock,12);
  await q('SELECT record_stock_restock($1,$2,2,\'legacy\',null,$3)',[id(107),a,actor]);assert.equal((await q('SELECT stock FROM items WHERE id=$1',[a]))[0].stock,14);
 });
 await t.test('cashbox totals include more than ten pending advances and every ledger row in one snapshot',async()=>{
  await db.exec(`INSERT INTO purchase_runs(total_amount,payment_source,reimbursement_status,purchased_by) SELECT 10,'personal_advance','pending_reimbursement','${payer}'::uuid FROM generate_series(1,45);INSERT INTO cashbox_entries(entry_type,direction,amount) SELECT 'manual_in','in',1 FROM generate_series(1,1100);INSERT INTO orders(payment_method,payment_status,total_amount) VALUES('cash','pending',130);INSERT INTO subscription_payments(payment_status,cash_due_amount) VALUES('pending_cash_settlement',300);`);
  const totals=(await q('SELECT read_cashbox_totals() result'))[0].result;assert.equal(totals.expectedAmount,-500);assert.equal(totals.unreimbursedAdvanceAmount,450);assert.deepEqual(totals.advancePeople,[{id:payer,name:'立替者',count:45,total:450}]);assert.equal(totals.totalCashCollectionAmount,1560);assert.equal(totals.pendingCashOrdersCount,1);
 });
 await t.test('count, discard and supplier return have reasoned idempotent histories; a stale count cannot overwrite a purchase',async()=>{
  await db.exec(`UPDATE items SET stock=10 WHERE id='${a}'`);
  const wallets=await q('SELECT * FROM users ORDER BY id'),purchases=await q('SELECT * FROM purchase_runs ORDER BY id');
  const adjust=async(op,kind,value,expected,note='test reason')=>(await q('SELECT record_stock_adjustment($1,$2,$3,$4,$5,$6,$7) result',[id(op),a,kind,value,expected,note,actor]))[0].result;
  const result=await adjust(500,'count',8,10);assert.equal(result.change_amount,-2);const before=await snap();assert.deepEqual(await adjust(500,'count',8,10),result);assert.equal(await snap(),before);
  await assert.rejects(()=>adjust(501,'count',0,10));assert.equal(await snap(),before);assert.equal((await adjust(502,'discard',3,8)).stock_after,5);assert.equal((await adjust(503,'return',1,5)).stock_after,4);
  const stable=await snap();await assert.rejects(()=>adjust(504,'count',0,4,''));await assert.rejects(()=>adjust(504,'discard',5,4));assert.equal(await snap(),stable);
  await db.exec(`CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();`);await assert.rejects(()=>adjust(505,'count',0,4),/forced failure/);assert.equal(await snap(),stable);await db.exec('DROP TRIGGER fail ON admin_audit_logs');
  assert.equal((await adjust(505,'count',0,4)).stock_after,0);assert.deepEqual(await q('SELECT * FROM users ORDER BY id'),wallets);assert.deepEqual(await q('SELECT * FROM purchase_runs ORDER BY id'),purchases);
 });
 await t.test('only service_role may execute/read receipts; it cannot update or delete a receipt',async()=>{
  for(const role of ['anon','authenticated']){for(const fn of ['record_stock_receipt(uuid,jsonb,uuid)','read_cashbox_totals()','record_stock_adjustment(uuid,uuid,text,integer,integer,text,uuid)'])assert.equal((await q('SELECT has_function_privilege($1,$2,\'execute\') allowed',[role,'public.'+fn]))[0].allowed,false);assert.equal((await q('SELECT has_table_privilege($1,\'public.stock_receipts\',\'SELECT\') allowed',[role]))[0].allowed,false);}
  for(const verb of ['UPDATE','DELETE'])assert.equal((await q('SELECT has_table_privilege(\'service_role\',\'public.stock_receipts\',$1) allowed',[verb]))[0].allowed,false);
 });
 await t.test('upgrade preserves old receipt replays, prices and dates; multiple dated purchases are one atomic submission',async()=>{
  const old=(await q('SELECT result FROM stock_receipts WHERE request_id=$1',[id(100)]))[0].result;
  const prices=await q('SELECT id,unit_price,subtotal FROM purchase_run_items ORDER BY id');
  await db.exec(fs.readFileSync(path.join(dir,'20261120085213_multi_purchase_intake.sql'),'utf8'));
  assert.deepEqual(await call(100),old);assert.deepEqual(await q('SELECT id,unit_price,subtotal FROM purchase_run_items ORDER BY id'),prices);tables.push('stock_intakes');
  const group=(n,rows,purchase,extra={})=>({receipt_id:id(n),rows,note:'multi fixture',add_stock:true,purchased_on:null,received_on:null,purchase,...extra});
  const mixed={receipts:[
   group(901,[{item_id:a,quantity:2,subtotal:120},{item_id:b,quantity:1,subtotal:80}],{payment_source:'cashbox',total_amount:180,adjustment_amount:-20,vendor:'A店'},{purchased_on:'2026-10-01',received_on:'2026-10-02'}),
   group(902,[{item_id:a,quantity:3,subtotal:210}],{payment_source:'personal_advance',purchased_by:payer,total_amount:210,vendor:'B店'},{purchased_on:'2026-10-04',received_on:'2026-10-05'}),
   group(903,[{item_id:a,quantity:7,subtotal:700}],{payment_source:'personal_advance',purchased_by:payer,total_amount:700,vendor:'C店'},{purchased_on:'2026-07-01',add_stock:false}),
   group(904,[{item_id:b,quantity:2,subtotal:null}],null)
  ]};
  const intake=async(op,input=mixed)=>(await q('SELECT record_stock_intake($1,$2::jsonb,$3) result',[id(op),JSON.stringify(input),actor]))[0].result;
  const before=Object.fromEntries((await q('SELECT id,stock FROM items')).map(r=>[r.id,r.stock]));const cashBefore=(await q('SELECT coalesce(sum(amount),0)::integer n FROM cashbox_entries'))[0].n;
  await db.exec('SET ROLE service_role');const result=await intake(900);await db.exec('RESET ROLE');
  assert.equal(result.receipts.length,4);assert.equal(result.total_amount,1090);assert.deepEqual(result.stock_totals.map(r=>[r.item_id,r.quantity,r.stock_after]),[[a,5,before[a]+5],[b,3,before[b]+3]]);
  const first=result.receipts.find(r=>r.request_id===id(901)),second=result.receipts.find(r=>r.request_id===id(902)),posted=result.receipts.find(r=>r.request_id===id(903));
  assert.equal(first.purchase.adjustment_amount,-20);assert.equal(second.purchase.purchased_by,payer);assert.equal(posted.rows[0].stock_before,posted.rows[0].stock_after);assert.equal(posted.add_stock,false);
  assert.equal((await q('SELECT coalesce(sum(amount),0)::integer n FROM cashbox_entries'))[0].n-cashBefore,180);
  assert.deepEqual((await q('SELECT purchased_on::text d FROM purchase_runs WHERE id=$1',[first.purchase.id]))[0],{d:'2026-10-01'});
  assert.deepEqual((await q('SELECT occurred_on::text d,stock_receipt_id r FROM cashbox_entries WHERE id=$1',[first.purchase.cashbox_entry_id]))[0],{d:'2026-10-01',r:id(901)});
  assert.equal((await q('SELECT count(*) n FROM stock_history WHERE restock_batch_id=$1',[posted.request_id]))[0].n,0);
  assert.deepEqual((await q('SELECT distinct received_on::text d FROM stock_history WHERE restock_batch_id=$1',[second.request_id]))[0],{d:'2026-10-05'});
  const stable=await snap();const reordered={receipts:[...mixed.receipts].reverse().map(r=>({...r,rows:[...r.rows].reverse()}))};assert.deepEqual(await intake(900,reordered),result);assert.equal(await snap(),stable);
  await assert.rejects(()=>intake(910));assert.equal(await snap(),stable);
  const fresh=JSON.parse(JSON.stringify(mixed));fresh.receipts=fresh.receipts.map((r,i)=>({...r,receipt_id:id(920+i)}));fresh.receipts[3].rows[0].item_id=id(999);await assert.rejects(()=>intake(919,fresh));assert.equal(await snap(),stable);
  fresh.receipts[3].rows[0].item_id=b;fresh.receipts[1].purchased_on='2026-02-30';await assert.rejects(()=>intake(919,fresh));assert.equal(await snap(),stable);
  fresh.receipts[1].purchased_on='2026-10-04';
  await db.exec(`CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW WHEN(NEW.action_type='stock_intake_recorded') EXECUTE FUNCTION fail_audit()`);await assert.rejects(()=>intake(919,fresh),/forced failure/);assert.equal(await snap(),stable);await db.exec('DROP TRIGGER fail ON admin_audit_logs');
  const onlyMoney={receipts:[group(940,[{item_id:unlimited,quantity:2,subtotal:null}],{payment_source:'cashbox',total_amount:100,vendor:'旧店'},{add_stock:false,purchased_on:'2026-01-01'})]};const financed=await intake(939,onlyMoney);assert.equal(financed.stock_totals.length,0);assert.equal(financed.receipts[0].add_stock,false);
  for(const role of ['anon','authenticated'])assert.equal((await q("SELECT has_function_privilege($1,'record_stock_intake(uuid,jsonb,uuid)','execute') allowed",[role]))[0].allowed,false);
  for(const verb of ['UPDATE','DELETE'])assert.equal((await q("SELECT has_table_privilege('service_role','stock_intakes',$1) allowed",[verb]))[0].allowed,false);
 });

 await t.test('mixed product and supplies purchases preserve legacy records and atomically create one advance',async()=>{
  const stable=await snap(),old=(await q('SELECT result FROM stock_intakes WHERE request_id=$1',[id(900)]))[0].result;
  await db.exec(fs.readFileSync(path.join(dir,'20261120103726_unified_purchase_expenses.sql'),'utf8'));assert.equal(await snap(),stable);assert.deepEqual(await call(100), (await q('SELECT result FROM stock_receipts WHERE request_id=$1',[id(100)]))[0].result);
  const oldInput=(await q('SELECT payload FROM stock_intakes WHERE request_id=$1',[id(900)]))[0].payload;assert.deepEqual((await q('SELECT record_purchase($1,$2::jsonb,$3) result',[id(900),JSON.stringify(oldInput),actor]))[0].result,old);assert.equal(await snap(),stable);
  const expense=(n,label,quantity,subtotal)=>({line_id:id(n),label,quantity,subtotal});
  const receipt=(n,rows,expenses,total,source='personal_advance')=>({receipt_id:id(n),rows,expenses,purchased_on:'2026-11-01',received_on:'2026-11-02',add_stock:true,note:'混在した買い物',purchase:{payment_source:source,total_amount:total,purchased_by:payer,vendor:'同じ店'}});
  const input={receipts:[receipt(1001,[{item_id:a,quantity:2,subtotal:200}],[expense(1010,'ペーパータオル',3,450)],650)]};
  const intake=async(op,input)=>(await q('SELECT record_purchase($1,$2::jsonb,$3) result',[id(op),JSON.stringify(input),actor]))[0].result;
  const stocks=await q('SELECT id,stock FROM items ORDER BY id'),wallets=await q('SELECT * FROM users ORDER BY id'),cash=await q('SELECT * FROM cashbox_entries ORDER BY id');
  await db.exec('SET ROLE service_role');const result=await intake(1000,input);await db.exec('RESET ROLE');const purchase=result.receipts[0].purchase.id;
  assert.equal(result.total_amount,650);assert.deepEqual(result.stock_totals.map(r=>[r.item_id,r.quantity]),[[a,2]]);assert.equal(result.receipts[0].expenses[0].label,'ペーパータオル');
  assert.deepEqual(await q('SELECT item_id,item_name,quantity,subtotal FROM purchase_run_items WHERE purchase_run_id=$1 ORDER BY item_id NULLS LAST',[purchase]),[{item_id:a,item_name:'水',quantity:2,subtotal:200},{item_id:null,item_name:'ペーパータオル',quantity:3,subtotal:450}]);
  assert.deepEqual(await q('SELECT * FROM users ORDER BY id'),wallets);assert.deepEqual(await q('SELECT * FROM cashbox_entries ORDER BY id'),cash);const saved=await snap();assert.deepEqual(await intake(1000,input),result);assert.equal(await snap(),saved);
  const supplies={receipts:[receipt(1021,[],[expense(1022,'洗剤',2,300),expense(1023,'紙コップ',1,100)],400,'cashbox')]};const beforeSupplies=await q('SELECT id,stock FROM items ORDER BY id');const only=await intake(1020,supplies);assert.deepEqual(only.stock_totals,[]);assert.deepEqual(await q('SELECT id,stock FROM items ORDER BY id'),beforeSupplies);assert.equal((await q('SELECT entry_type,amount FROM cashbox_entries WHERE purchase_run_id=$1',[only.receipts[0].purchase.id]))[0].amount,400);
  const afterSupplies=await snap();const reverse={receipts:[{...supplies.receipts[0],expenses:[...supplies.receipts[0].expenses].reverse()}]};assert.deepEqual(await intake(1020,reverse),only);assert.equal(await snap(),afterSupplies);
  const settled=(await q('SELECT admin_reimburse_advances($1,$2,$3::jsonb,$4) result',[id(1030),payer,JSON.stringify([{id:purchase,expected_amount:650}]),actor]))[0].result;assert.equal(settled.amount,650);assert.deepEqual(await q('SELECT id,stock FROM items ORDER BY id'),beforeSupplies);
  const invalid=[{...input.receipts[0],receipt_id:id(1041),expenses:[expense(1042,'',1,450)]},{...input.receipts[0],receipt_id:id(1041),expenses:[expense(1042,'紙',0,450)]},{...input.receipts[0],receipt_id:id(1041),expenses:[expense(1042,'紙',1,451)]},{...input.receipts[0],receipt_id:id(1041),expenses:[expense(1042,'紙',1,null)]},{...input.receipts[0],receipt_id:id(1041),purchase:null},{...input.receipts[0],receipt_id:id(1041),expenses:[expense(1042,'紙',1,225),expense(1042,'紙',1,225)]}];
  for(const r of invalid){const before=await snap();await assert.rejects(()=>intake(1040,{receipts:[r]}));assert.equal(await snap(),before);}
  const pending={receipts:[{...input.receipts[0],receipt_id:id(1051)},{...supplies.receipts[0],receipt_id:id(1052)}]};await db.exec(`CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW WHEN(NEW.action_type='stock_intake_recorded') EXECUTE FUNCTION fail_audit()`);const beforeFailure=await snap();await assert.rejects(()=>intake(1050,pending),/forced failure/);assert.equal(await snap(),beforeFailure);await db.exec('DROP TRIGGER fail ON admin_audit_logs');assert.equal((await intake(1050,pending)).total_amount,1050);
  for(const role of ['anon','authenticated'])for(const fn of ['record_stock_receipt(uuid,jsonb,uuid)','record_stock_intake(uuid,jsonb,uuid)','record_purchase(uuid,jsonb,uuid)'])assert.equal((await q('SELECT has_function_privilege($1,$2,\'execute\') allowed',[role,fn]))[0].allowed,false);
 });

 await t.test('purchase-unit snapshots keep box quotes, physical stock and receipt totals independent without changing legacy replays',async()=>{
  const beforeUpgrade=await snap();await db.exec(fs.readFileSync(path.join(dir,'20261120111208_purchase_line_units_and_prices.sql'),'utf8'));assert.equal(await snap(),beforeUpgrade);assert.deepEqual(await call(100),(await q('SELECT result FROM stock_receipts WHERE request_id=$1',[id(100)]))[0].result);
  const entry=(n,patch={})=>({line_id:id(n),item_id:a,label:null,quantity:2,package_unit:'box',units_per_package:6,price_mode:'total',price:1800,add_stock:true,...patch});
  const normalize=async entries=>(await q('SELECT resolve_purchase_lines($1::jsonb) r',[JSON.stringify(entries)]))[0].r;
  const entries=[entry(1110),entry(1111,{quantity:3,package_unit:'piece',units_per_package:1,price_mode:'unit',price:130,add_stock:false}),entry(1112,{item_id:null,label:'ペーパータオル',quantity:2,package_unit:'pack',units_per_package:10,price_mode:'unit',price:350,add_stock:false})];
  const resolved=await normalize(entries);assert.equal(resolved.known_amount,2890);assert.deepEqual(resolved.rows,[{item_id:a,quantity:15,stock_quantity:12,subtotal:2190}]);assert.equal(resolved.expenses[0].quantity,20);
  const group={receipt_id:id(1101),rows:resolved.rows,expenses:resolved.expenses,purchase_lines:entries,add_stock:true,purchased_on:'2026-11-19',received_on:'2026-11-20',note:'model fixture',purchase:{payment_source:'personal_advance',purchased_by:payer,total_amount:2800,adjustment_amount:-90}};
  const intake=async(op,g=group)=>(await q('SELECT record_purchase_v2($1,$2::jsonb,$3) r',[id(op),JSON.stringify({receipts:[g]}),actor]))[0].r;
  const beforeStocks=await q('SELECT id,stock FROM items ORDER BY id'),wallets=await q('SELECT * FROM users ORDER BY id');await db.exec('SET ROLE service_role');const saved=await intake(1100);await db.exec('RESET ROLE');assert.equal(saved.total_amount,2800);assert.deepEqual(saved.stock_totals.map(r=>[r.item_id,r.quantity]),[[a,12]]);assert.equal(saved.receipts[0].rows[0].quantity,15);assert.equal(saved.receipts[0].rows[0].stock_after-saved.receipts[0].rows[0].stock_before,12);assert.equal(saved.receipts[0].purchase_lines.length,3);assert.equal(saved.receipts[0].purchase_lines[0].price,1800);assert.deepEqual(await q('SELECT * FROM users ORDER BY id'),wallets);
  const stable=await snap();assert.deepEqual(await intake(1100,{...group,purchase_lines:[...entries].reverse()}),saved);assert.equal(await snap(),stable);
  for(const bad of [{...group,receipt_id:id(1121),rows:[{...resolved.rows[0],quantity:2}]},{...group,receipt_id:id(1121),purchase:{...group.purchase,total_amount:2810}},{...group,receipt_id:id(1121),purchase_lines:[{...entries[0],units_per_package:0},...entries.slice(1)]}]){await assert.rejects(()=>intake(1120,bad));assert.equal(await snap(),stable);}
  const partial=[entry(1131,{quantity:1,package_unit:'piece',units_per_package:1,price:200}),entry(1132,{quantity:1,package_unit:'piece',units_per_package:1,price_mode:'unknown',price:null,add_stock:false})];const part=await normalize(partial);const unknown=await intake(1130,{...group,receipt_id:id(1133),rows:part.rows,expenses:part.expenses,purchase_lines:partial,purchase:{...group.purchase,total_amount:500,adjustment_amount:0}});assert.equal(unknown.receipts[0].rows[0].subtotal,null);assert.equal(unknown.receipts[0].purchase_lines[0].price,200);assert.equal(unknown.total_amount,500);
  const box=[entry(1141,{quantity:1,price:1000})],fraction=await normalize(box);const exact=await intake(1140,{...group,receipt_id:id(1142),rows:fraction.rows,expenses:[],purchase_lines:box,purchase:{...group.purchase,total_amount:1000,adjustment_amount:0}});assert.equal((await q('SELECT unit_price FROM purchase_run_items WHERE purchase_run_id=$1',[exact.receipts[0].purchase.id]))[0].unit_price,null);
  const skip=await normalize([entry(1151,{add_stock:false,price_mode:'unknown',price:null})]);const current=await snap();await assert.rejects(()=>intake(1150,{...group,receipt_id:id(1152),rows:skip.rows,expenses:[],purchase_lines:skip.purchase_lines,purchase:null}));assert.equal(await snap(),current);
  await db.exec(`CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW WHEN(NEW.action_type='stock_intake_recorded') EXECUTE FUNCTION fail_audit()`);await assert.rejects(()=>intake(1160,{...group,receipt_id:id(1161)}),/forced failure/);assert.equal(await snap(),current);await db.exec('DROP TRIGGER fail ON admin_audit_logs');
  for(const role of ['anon','authenticated'])for(const fn of ['record_purchase_v2(uuid,jsonb,uuid)','resolve_purchase_lines(jsonb)'])assert.equal((await q('SELECT has_function_privilege($1,$2,\'execute\') allowed',[role,fn]))[0].allowed,false);
 });

 await t.test('a stocktake records actual counts, including zero and matches, without creating financial records', async () => {
  const beforeUpgrade = await snap();
  await db.exec(fs.readFileSync(path.join(dir, '20261124100158_inventory_stocktakes.sql'), 'utf8'));
  assert.equal(await snap(), beforeUpgrade);
  tables.push('stocktakes');
  await q('UPDATE items SET stock=16 WHERE id=$1', [a]);
  await q('UPDATE items SET stock=15 WHERE id=$1', [b]);
  const entries = [
   { item_id: a, expected_stock: 16, actual_count: 0 },
   { item_id: b, expected_stock: 15, actual_count: 15 },
  ];
  const input = { entries, note: '棚と保管場所を確認' };
  const record = async (n, body = input) => (await q(
   'SELECT record_stocktake($1,$2::jsonb,$3) result', [id(n), JSON.stringify(body), actor]
  ))[0].result;
  const accounts = ['users', 'purchase_runs', 'purchase_run_items', 'cashbox_entries', 'stock_receipts', 'stock_intakes'];
  const financialSnapshot = () => Promise.all(accounts.map(table => q(`SELECT to_jsonb(t) data FROM ${table} t ORDER BY to_jsonb(t)::text`)));
  const finances = await financialSnapshot();
  const history = await q('SELECT count(*)::integer n FROM stock_history');
  await db.exec('SET ROLE service_role');
  const result = await record(1250);
  await db.exec('RESET ROLE');
  assert.equal(result.item_count,2);
  assert.equal(result.changed_count,1);
  assert.equal(result.actor_name,'入力者');
  assert.deepEqual(result.entries.map(row => [row.item_id,row.stock_before,row.stock_after]), [[a,16,0],[b,15,15]]);
  assert.deepEqual(await q('SELECT stock FROM items WHERE id IN ($1,$2) ORDER BY id',[a,b]), [{stock:0},{stock:15}]);
  assert.deepEqual(await q('SELECT result FROM stocktakes WHERE request_id=$1',[id(1250)]), [{result}]);
  assert.deepEqual(await financialSnapshot(), finances);
  assert.equal((await q('SELECT count(*)::integer n FROM stock_history'))[0].n,history[0].n+1);
  assert.deepEqual(await q("SELECT created_by, note, change_amount FROM stock_history WHERE note='棚卸: 棚と保管場所を確認'"), [
   {created_by:actor,note:'棚卸: 棚と保管場所を確認',change_amount:-16},
  ]);
  assert.deepEqual(await q("SELECT target_type, actor_id FROM admin_audit_logs WHERE target_id=$1",[id(1250)]), [{target_type:'stocktake',actor_id:actor}]);

  const stable = await snap();
  assert.deepEqual(await record(1250, { ...input, entries: [...entries].reverse() }), result);
  await assert.rejects(() => record(1250,{...input,note:'差し替え'}),/同じ登録番号/);
  assert.equal(await snap(),stable);

  const fresh = [{...entries[0],expected_stock:0,actual_count:5}, {...entries[1],expected_stock:14,actual_count:2}];
  await assert.rejects(() => record(1251,{ ...input, entries:fresh }),/緑茶の在庫が変わりました/);
  assert.equal(await snap(),stable);
  await assert.rejects(() => record(1252,{...input,entries:[{...fresh[0],item_id:unlimited}]}),/在庫を管理/);
  await assert.rejects(() => record(1253,{...input,entries:[{...fresh[0],actual_count:2147483648}]}),/大きすぎます/);
  assert.equal(await snap(),stable);
  await db.exec("CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW WHEN(NEW.action_type='stocktake_recorded') EXECUTE FUNCTION fail_audit()");
  await assert.rejects(() => record(1254,{...input,entries:[fresh[0]]}),/forced failure/);
  assert.equal(await snap(),stable);
  await db.exec('DROP TRIGGER fail ON admin_audit_logs');
  for (const role of ['anon','authenticated']) {
   assert.equal((await q("SELECT has_function_privilege($1,'record_stocktake(uuid,jsonb,uuid)','execute') allowed",[role]))[0].allowed,false);
   assert.equal((await q("SELECT has_table_privilege($1,'stocktakes','select') allowed",[role]))[0].allowed,false);
  }
 });

});
