// Isolated PostgreSQL only. PGlite uses one connection: operation-order tests are
// not a substitute for multi-connection load/deadlock testing on staging.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ids = Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12,'0')}`);
const [user, admin, order, charge, item, other] = ids;
const dir = path.resolve(__dirname,'../../supabase/migrations');

test('order wallet payment and cash collection preserve the financial ledger', { skip: !process.env.PGLITE_MODULE }, async (t) => {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE users(id uuid PRIMARY KEY,balance int NOT NULL DEFAULT 1000,deferred_balance int NOT NULL DEFAULT 1130,points_balance int NOT NULL DEFAULT 30,is_active boolean DEFAULT true,is_approved boolean DEFAULT true);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),total_amount int NOT NULL DEFAULT 130,points_used int DEFAULT 0,payment_method text DEFAULT 'deferred',payment_status text DEFAULT 'completed',deferred_settlement_method text DEFAULT 'cash',settled_at timestamptz,settlement_source text,settlement_id uuid,cash_confirmed_at timestamptz,cash_confirmed_by uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE charge_requests(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),amount int NOT NULL DEFAULT 1000,method text DEFAULT 'cash',status text DEFAULT 'approved',settled_at timestamptz,settlement_source text,settlement_id uuid,approved_at timestamptz,approved_by uuid,note text);
    CREATE TABLE items(id uuid PRIMARY KEY,name text,stock int,is_unlimited_stock boolean DEFAULT false);
    CREATE TABLE order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),item_id uuid REFERENCES items(id),quantity int,item_name text,item_price int,subtotal int);
    CREATE TABLE stock_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid REFERENCES items(id),change_amount int,reason text,order_id uuid REFERENCES orders(id),note text,created_by uuid);
    CREATE TABLE settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),amount int NOT NULL,method text,period_start date,period_end date,status text,settled_at timestamptz,settled_by uuid,note text);
    CREATE TABLE cashbox_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_type text,direction text,amount int CHECK(amount>0),note text,order_id uuid REFERENCES orders(id),charge_request_id uuid REFERENCES charge_requests(id),settlement_id uuid REFERENCES settlements(id),created_by uuid);
    CREATE UNIQUE INDEX fixture_order_receipt ON cashbox_entries(order_id,entry_type);
    CREATE UNIQUE INDEX fixture_charge_receipt ON cashbox_entries(charge_request_id,entry_type);
    CREATE TABLE admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action_type text,target_type text,target_id text,summary text,metadata jsonb);
    CREATE TABLE point_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),delta int,balance_after int,reason_type text,charge_request_id uuid REFERENCES charge_requests(id),order_id uuid REFERENCES orders(id),subscription_payment_id uuid,note text,created_by uuid);
    INSERT INTO users(id) VALUES ('${user}'),('${admin}'),('${other}');
    INSERT INTO orders(id,user_id) VALUES ('${order}','${user}');
    INSERT INTO charge_requests(id,user_id) VALUES ('${charge}','${user}');
    INSERT INTO items VALUES ('${item}','current name',12,false);
    INSERT INTO order_items(order_id,item_id,quantity,item_name,item_price,subtotal) VALUES ('${order}','${item}',1,'historical name',130,130);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    -- Existing Supabase projects may still grant ALL on every new table by default.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
  `);
  const snapshot = async (tables = ['users','orders','charge_requests','items','order_items','stock_history','settlements','cashbox_entries','point_transactions','admin_audit_logs','order_balance_payments']) => Promise.all(tables.map(async table => (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`)).rows[0].rows));
  const historical = await snapshot(['users','orders','charge_requests','items','order_items']);
  await db.exec(fs.readFileSync(path.join(dir,'20261019070015_admin_order_balance_payment.sql'),'utf8'));
  const after = await snapshot(['users','orders','charge_requests','items','order_items']);
  for (const index of [1,2]) for (const row of after[index]) { assert.equal(row.accounting_ready,true); delete row.accounting_ready; }
  assert.deepEqual(after,historical);
  const pointSql = fs.readFileSync(path.join(dir,'022_subscriptions.sql'),'utf8');
  await db.exec(pointSql.slice(pointSql.indexOf('create or replace function public.record_point_transaction(')).split('$$ language plpgsql;')[0]+'$$ language plpgsql;');
  await db.exec(fs.readFileSync(path.join(dir,'023_unlimited_stock_items.sql'),'utf8'));
  const pay = async (amount=130,balance=1000) => (await db.query("SELECT public.admin_pay_order_from_balance($1,$3,$4,$2,'本人に確認済み') AS r",[order,admin,amount,balance])).rows[0].r;
  const cash = async (kind='deferred_order',reverse=false) => (await db.query('SELECT public.record_cash_collection($1,$2,$3,$4) AS r',[kind,kind==='cash_charge'?charge:order,reverse,admin])).rows[0].r;
  const collect = async (amount=1130,method='cash') => (await db.query("SELECT public.complete_deferred_collection($1,$2,$3,'2026-01-01','2026-10-17',$4) AS r",[user,amount,method,admin])).rows[0].r;
  const profile = async () => (await db.query('SELECT balance,deferred_balance,points_balance FROM users WHERE id=$1',[user])).rows[0];
  // Each case rolls back, including its setup, to the same migrated historical ledger.
  const isolated = (name, fn) => t.test(name, async () => { await db.exec('BEGIN'); try { await fn(); } finally { await db.exec('ROLLBACK'); } });
  // Expected business failures use a savepoint so the enclosing fixture stays readable.
  const fails = async (fn,code='P0001') => { const before=await snapshot(); await db.exec('SAVEPOINT expected_failure'); await assert.rejects(fn,e=>e.code===code); await db.exec('ROLLBACK TO SAVEPOINT expected_failure'); assert.deepEqual(await snapshot(),before); };

  await isolated('1000 top-up pays a 130 unpaid order; the 1000 unpaid top-up remains due', async () => {
    await db.exec('SET LOCAL ROLE service_role');
    const unchanged = await snapshot(['items','order_items','stock_history','point_transactions','charge_requests']);
    assert.deepEqual(await pay(),{ok:true,already_paid:false,amount:130,balance:870,deferred_balance:1000});
    assert.deepEqual(await profile(),{balance:870,deferred_balance:1000,points_balance:30});
    assert.deepEqual(await snapshot(['items','order_items','stock_history','point_transactions','charge_requests']),unchanged);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cashbox_entries')).rows[0].n,0);
    const event=(await db.query('SELECT * FROM order_balance_payments')).rows[0];
    assert.equal(event.original_payment_method,'deferred'); assert.equal(event.amount,130); assert.equal(event.actor_id,admin); assert.equal(event.user_id,user); assert.equal(event.reason,'本人に確認済み');
    const once=await snapshot(); assert.equal((await pay()).already_paid,true); assert.deepEqual(await snapshot(),once);
    assert.equal((await db.query('SELECT action_type FROM admin_audit_logs')).rows[0].action_type,'admin_order_paid_from_balance');
  });
  await isolated('cash pending and previously used points debit only the net price, without reducing unrelated debt', async () => {
    await db.exec("UPDATE orders SET payment_method='cash',payment_status='pending',points_used=30");
    const result=await pay(100); assert.equal(result.balance,900); assert.equal(result.deferred_balance,1130);
    assert.equal((await profile()).points_balance,30);
  });
  await isolated('stale amount/wallet quotes, insufficient funds, another owner and inactive users fail without writes', async () => {
    await fails(()=>pay(129)); await fails(()=>pay(130,999)); await fails(()=>db.query("SELECT public.admin_pay_order_from_balance($1,130,1000,$2,'確認')",[other,admin]),'P0002');
    await db.exec('UPDATE users SET balance=100 WHERE id=\''+user+'\''); await fails(()=>pay(130,100),'22023');
    await db.exec('UPDATE users SET balance=1000,is_approved=false WHERE id=\''+user+'\''); await fails(()=>pay(),'42501');
  });
  await isolated('cash receipt first excludes subsequent wallet payment; undo restores eligibility', async () => {
    await cash(); await fails(()=>pay()); assert.equal((await profile()).balance,1000);
    await cash('deferred_order',true); assert.equal((await pay()).balance,870);
    await fails(()=>cash());
  });
  await isolated('cash-order receipt and wallet payment cannot both succeed in either operation order', async () => {
    await db.exec("UPDATE orders SET payment_method='cash',payment_status='pending'");
    await cash('cash_order'); await fails(()=>pay()); await cash('cash_order',true);
    await pay(); await fails(()=>cash('cash_order')); await fails(()=>cash('cash_order',true));
  });
  await isolated('aggregate receipt first excludes wallet payment; wallet payment invalidates the old aggregate quote', async () => {
    const settlement=await collect(); await fails(()=>pay());
    await db.query('SELECT public.revert_deferred_collection($1,$2)',[settlement.settlement_id,admin]);
    await pay(); await fails(()=>collect());
    const remaining=await collect(1000); assert.equal((await profile()).deferred_balance,0);
    await db.query('SELECT public.revert_deferred_collection($1,$2)',[remaining.settlement_id,admin]);
    assert.deepEqual(await profile(),{balance:870,deferred_balance:1000,points_balance:30});
    assert.equal((await db.query('SELECT settled_at FROM charge_requests')).rows[0].settled_at,null);
    assert.equal((await db.query('SELECT payment_method FROM orders')).rows[0].payment_method,'balance');
  });
  await isolated('individual cash receipt cannot also be undone through the aggregate endpoint', async () => {
    await cash(); const sid=(await db.query('SELECT settlement_id FROM orders')).rows[0].settlement_id;
    await fails(()=>db.query('SELECT public.revert_deferred_collection($1,$2)',[sid,admin]));
    await cash('deferred_order',true); await fails(()=>cash('deferred_order',true));
  });
  await isolated('approved top-up cash receipt changes debt only and reverses exactly once', async () => {
    await cash('cash_charge'); assert.deepEqual(await profile(),{balance:1000,deferred_balance:130,points_balance:30});
    const once=await snapshot(); await cash('cash_charge'); assert.deepEqual(await snapshot(),once);
    await pay(); await cash('cash_charge',true); assert.deepEqual(await profile(),{balance:870,deferred_balance:1000,points_balance:30});
    await fails(()=>cash('cash_charge',true));
  });
  for (const [name,patch] of Object.entries({
    received:"payment_method='cash',payment_status='completed'", refunded:"payment_status='refunded'", cancelled:"payment_status='cancelled'", card:"payment_method='stripe'", cardDeferred:"deferred_settlement_method='stripe'", unfinished:'accounting_ready=false', tracked:"settlement_source='deferred_settlement'", zero:'points_used=130', negativePoints:'points_used=-1', cashReceipt:'cash_confirmed_at=now()',
  })) await isolated(`${name} orders cannot be converted`,async()=>{ await db.exec(`UPDATE orders SET ${patch}`); await fails(()=>pay()); });
  await isolated('new orders default to unfinished and cannot be settled/refunded until accounting completes',async()=>{
    await db.exec('UPDATE orders SET accounting_ready=false');
    await fails(()=>cash()); await fails(()=>collect());
    await fails(()=>db.query('SELECT public.refund_order($1,$2)',[order,admin]));
    assert.equal((await db.query('SELECT stock FROM items')).rows[0].stock,12);
    await db.query('INSERT INTO orders(id,user_id) VALUES($1,$2)',[ids[7],other]);
    assert.equal((await db.query('SELECT accounting_ready FROM orders WHERE id=$1',[ids[7]])).rows[0].accounting_ready,false);
  });
  await isolated('pending/rejected charges do not block aggregate receipt; an approved unfinished charge does',async()=>{
    await db.exec("UPDATE charge_requests SET accounting_ready=false,status='pending'");
    const s=await collect(); await db.query('SELECT public.revert_deferred_collection($1,$2)',[s.settlement_id,admin]);
    await db.exec("UPDATE charge_requests SET status='approved'"); await fails(()=>collect());
  });
  await isolated('a failure in mandatory audit rolls back wallet, order and payment record together',async()=>{
    await db.exec("CREATE FUNCTION fail_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END; $$; CREATE TRIGGER fail_fixture BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_fixture_audit();");
    await fails(()=>pay()); await fails(()=>cash()); await fails(()=>collect());
  });
  for (const operation of ['refund_order','cancel_non_card_order']) await isolated(`existing ${operation} refunds converted orders with points and stock exactly once`,async()=>{
    await db.exec('UPDATE orders SET points_used=30; UPDATE users SET deferred_balance=1100 WHERE id=\''+user+'\'');
    await pay(100); await db.query(`SELECT public.${operation}($1,$2)`,[order,admin]);
    assert.deepEqual(await profile(),{balance:1000,deferred_balance:1000,points_balance:60});
    assert.equal((await db.query('SELECT stock FROM items')).rows[0].stock,13);
    await fails(()=>db.query(`SELECT public.${operation}($1,$2)`,[order,admin])); await fails(()=>pay(100));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cashbox_entries')).rows[0].n,0);
  });
  await isolated('compatibility wallet additions/subtractions preserve the order payment instead of overwriting snapshots',async()=>{
    await pay(); await db.query('SELECT public.add_user_wallet_balance($1,100)',[user]);
    await db.query('SELECT public.adjust_wallet_balances($1,50,50)',[user]);
    assert.deepEqual(await profile(),{balance:1020,deferred_balance:1050,points_balance:30});
    await fails(()=>db.query('SELECT public.adjust_wallet_balances($1,-1021,0)',[user]),'22023');
  });
  await isolated('legacy pending charge approval credits once and becomes collectible in the same transaction',async()=>{
    await db.exec("UPDATE charge_requests SET status='pending',accounting_ready=false");
    await db.query('SELECT public.approve_pending_wallet_charge($1,$2)',[charge,admin]);
    assert.deepEqual(await profile(),{balance:2000,deferred_balance:2130,points_balance:30});
    await fails(()=>db.query('SELECT public.approve_pending_wallet_charge($1,$2)',[charge,admin]));
    assert.equal((await db.query('SELECT accounting_ready FROM charge_requests')).rows[0].accounting_ready,true);
  });
  await isolated('top-up refund cannot erase a wallet payment or be applied twice',async()=>{
    await pay();
    await fails(()=>db.query('SELECT public.refund_wallet_charge($1,$2)',[charge,admin]),'22023');
    await db.query('SELECT public.add_user_wallet_balance($1,200)',[user]);
    await db.query('SELECT public.refund_wallet_charge($1,$2)',[charge,admin]);
    assert.deepEqual(await profile(),{balance:70,deferred_balance:0,points_balance:30});
    await fails(()=>db.query('SELECT public.refund_wallet_charge($1,$2)',[charge,admin]));
    await fails(()=>cash('cash_charge'));
  });
  await isolated('a received top-up refund returns cash without removing another order debt',async()=>{
    await cash('cash_charge');
    await db.query('SELECT public.refund_wallet_charge($1,$2)',[charge,admin]);
    assert.deepEqual(await profile(),{balance:0,deferred_balance:130,points_balance:30});
    assert.equal((await db.query("SELECT sum(case when direction='in' then amount else -amount end)::int AS n FROM cashbox_entries")).rows[0].n,0);
  });
  await isolated('missing actor or reason cannot debit any wallet',async()=>{
    for(const [actor,reason] of [[null,'確認'],[admin,''],[admin,' '.repeat(5)],[admin,'a'.repeat(301)]]) await fails(()=>db.query('SELECT public.admin_pay_order_from_balance($1,130,1000,$2,$3)',[order,actor,reason]),'22023');
  });
  await isolated('browser roles cannot execute collection functions or alter immutable payment evidence',async()=>{
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET LOCAL ROLE ${role}`);
      await db.exec('SAVEPOINT permissions'); await assert.rejects(()=>pay(),e=>e.code==='42501'); await db.exec('ROLLBACK TO SAVEPOINT permissions');
      await db.exec('SAVEPOINT permissions'); await assert.rejects(()=>db.query('SELECT * FROM order_balance_payments'),e=>e.code==='42501'); await db.exec('ROLLBACK TO SAVEPOINT permissions');
      await db.exec('RESET ROLE');
    }
    await db.exec('SET LOCAL ROLE service_role'); await pay();
    await db.exec('SAVEPOINT immutable'); await assert.rejects(()=>db.query('DELETE FROM order_balance_payments'),e=>e.code==='42501'); await db.exec('ROLLBACK TO SAVEPOINT immutable');
    await db.exec('RESET ROLE');
    const functions=(await db.query("SELECT prosecdef,proconfig FROM pg_proc WHERE proname IN ('admin_pay_order_from_balance','record_cash_collection','complete_deferred_collection','revert_deferred_collection')")).rows;
    assert.equal(functions.length,4); assert.ok(functions.every(f=>!f.prosecdef && f.proconfig.includes('search_path=\"\"')));
  });
});
