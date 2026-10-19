// Real isolated PostgreSQL, no network or production credentials. PGlite queues one connection;
// the ordering tests cover both purchase/restock orders, not multi-connection load testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ids = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

test('atomic restock preserves stock, purchases, cash and audit together', { skip: !process.env.PGLITE_MODULE }, async (t) => {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE users(id uuid PRIMARY KEY, balance int DEFAULT 500, deferred_balance int DEFAULT 130, points_balance int DEFAULT 30);
    CREATE TABLE items(id uuid PRIMARY KEY, name text NOT NULL, stock int NOT NULL, is_unlimited_stock boolean DEFAULT false, updated_at timestamptz DEFAULT now());
    CREATE TABLE stock_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid REFERENCES items(id), change_amount int NOT NULL, reason text, note text, created_by uuid REFERENCES users(id));
    CREATE TABLE purchase_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), total_amount int CHECK(total_amount>0), payment_source text, reimbursement_status text, vendor text, note text, purchased_by uuid REFERENCES users(id), created_by uuid REFERENCES users(id));
    CREATE TABLE purchase_run_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_run_id uuid REFERENCES purchase_runs(id), item_id uuid REFERENCES items(id), item_name text, quantity int CHECK(quantity>0), unit_price int CHECK(unit_price>=0), subtotal int CHECK(subtotal>=0));
    CREATE TABLE cashbox_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_type text, direction text, amount int CHECK(amount>0), purchase_run_id uuid REFERENCES purchase_runs(id), note text, created_by uuid REFERENCES users(id));
    CREATE UNIQUE INDEX cashbox_purchase_unique ON cashbox_entries(purchase_run_id,entry_type);
    CREATE TABLE admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action_type text, target_type text, target_id text, summary text, metadata jsonb);
    INSERT INTO users(id) VALUES ('${ids[0]}'),('${ids[1]}');
    INSERT INTO items(id,name,stock) VALUES ('${ids[0]}','fixture',14);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const beforeUsers = (await db.query('SELECT * FROM users ORDER BY id')).rows;
  await db.exec(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((name) => name.endsWith('_atomic_restock.sql'))), 'utf8'));
  // The exact decrement function from the repository's deployed migration.
  await db.exec(fs.readFileSync(path.join(dir, '023_unlimited_stock_items.sql'), 'utf8').split('create or replace function public.refund_order')[0].split('create or replace function public.cancel_non_card_order')[0]);
  const restock = async (request, quantity = 6, purchase = null, actor = ids[0], item = ids[0]) => (await db.query('SELECT public.record_stock_restock($1,$2,$3,$4,$5::jsonb,$6) AS result', [request,item,quantity,'fixture only',purchase == null ? null : JSON.stringify(purchase),actor])).rows[0].result;
  const stock = async () => (await db.query('SELECT stock FROM items WHERE id=$1',[ids[0]])).rows[0].stock;
  const snapshot = async () => Promise.all(['items','users','stock_history','purchase_runs','purchase_run_items','cashbox_entries','admin_audit_logs','stock_restock_operations'].map(async (table) => (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`)).rows[0].rows));

  await t.test('retrying the same operation is applied once; a later intentional restock can use a new ID', async () => {
    await db.exec('SET ROLE service_role');
    const result = await restock(ids[2]); assert.equal(result.stock,20);
    const before = await snapshot(); assert.deepEqual(await restock(ids[2]), result); assert.deepEqual(await snapshot(),before);
    await assert.rejects(() => restock(ids[2],7), (e) => e.code === '22023');
    await assert.rejects(() => restock(ids[2],6,null,ids[1]), (e) => e.code === '22023');
    assert.equal((await restock(ids[3],2)).stock,22);
    await db.exec('RESET ROLE');
  });
  await t.test('purchases before and after a restock both leave the correct stock', async () => {
    await db.query('UPDATE items SET stock=14 WHERE id=$1',[ids[0]]);
    await db.query('SELECT public.decrement_stock($1,2)',[ids[0]]);
    await restock(ids[4],6); assert.equal(await stock(),18);
    await db.query('UPDATE items SET stock=14 WHERE id=$1',[ids[0]]);
    await restock(ids[5],6);
    await db.query('SELECT public.decrement_stock($1,2)',[ids[0]]); assert.equal(await stock(),18);
  });
  await t.test('cashbox purchase and personal advance each commit their complete set of records', async () => {
    const cash = await restock(ids[6],6,{payment_source:'cashbox',total_amount:780,vendor:null,note:null});
    assert.equal(cash.purchase.total_amount,780); assert.equal(cash.purchase.unit_price,130);
    assert.equal((await db.query('SELECT sum(amount)::int AS amount FROM cashbox_entries')).rows[0].amount,780);
    const personal = await restock(ids[7],6,{payment_source:'personal_advance',total_amount:780,vendor:'fixture',note:null});
    assert.equal(personal.purchase.reimbursement_status,'pending_reimbursement');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cashbox_entries')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM purchase_run_items')).rows[0].n,2);
    assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows,beforeUsers);
  });
  await t.test('failure at the final audit insert rolls back stock, history, purchases, cash and the operation ID', async () => {
    await db.exec(`CREATE FUNCTION fail_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END; $$; CREATE TRIGGER reject_fixture BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit_fixture();`);
    const before = await snapshot();
    await assert.rejects(() => restock(ids[8],6,{payment_source:'cashbox',total_amount:780}), /fixture audit failure/);
    assert.deepEqual(await snapshot(),before);
    await db.exec('DROP TRIGGER reject_fixture ON admin_audit_logs; DROP FUNCTION fail_audit_fixture();');
    assert.equal((await restock(ids[8],6)).ok,true); // Same ID can succeed after a rolled-back attempt.
  });
  await t.test('invalid amounts, missing or unlimited items, and integer overflow leave no partial operation', async () => {
    let before = await snapshot();
    for (const qty of [0,-1,null]) await assert.rejects(() => restock(ids[9],qty), (e) => e.code === '22023');
    await assert.rejects(() => restock(ids[9],6,{payment_source:'cashbox',total_amount:0}), (e) => e.code === '22023');
    await assert.rejects(() => restock(ids[9],6,{payment_source:'other',total_amount:100}), (e) => e.code === '22023');
    await assert.rejects(() => restock(ids[9],6,null,ids[0],ids[20]), (e) => e.code === 'P0002');
    assert.deepEqual(await snapshot(),before);
    await db.query('UPDATE items SET is_unlimited_stock=true WHERE id=$1',[ids[0]]); before=await snapshot();
    await assert.rejects(() => restock(ids[9]), (e) => e.code === '22023'); assert.deepEqual(await snapshot(),before);
    await db.query('UPDATE items SET is_unlimited_stock=false,stock=2147483647 WHERE id=$1',[ids[0]]); before=await snapshot();
    await assert.rejects(() => restock(ids[9],1), (e) => e.code === '22003'); assert.deepEqual(await snapshot(),before);
  });
  await t.test('ordinary users cannot read idempotency records or execute the privileged stock function', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => restock(ids[10]), (e) => e.code === '42501');
      await assert.rejects(() => db.query('SELECT * FROM stock_restock_operations'), (e) => e.code === '42501');
      await db.exec('RESET ROLE');
    }
  });
});
