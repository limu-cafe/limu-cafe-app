// Isolated PostgreSQL only: no Supabase credentials, production connection or network.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('read-only overview migration preserves all existing data and accounting semantics', { skip: !process.env.PGLITE_MODULE }, async (t) => {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, avatar_url text, balance int DEFAULT 1250, deferred_balance int DEFAULT 900, points_balance int DEFAULT 80, is_active boolean DEFAULT true, is_approved boolean DEFAULT false, role text DEFAULT 'admin', slack_user_id text, slack_workspace_id text, bot_intro_sent_at timestamptz);
    CREATE TABLE items(id int, stock int, stock_alert_threshold int, is_available boolean, is_unlimited_stock boolean);
    CREATE TABLE orders(id int, user_id uuid, total_amount int, payment_method text, payment_status text, deferred_settlement_method text, settled_at timestamptz);
    CREATE TABLE charge_requests(id int, method text, status text, settled_at timestamptz);
    CREATE TABLE subscription_payments(id int, user_id uuid, payment_status text, cash_due_amount int);
    CREATE TABLE purchase_runs(id int, reimbursement_status text);
    CREATE TABLE item_requests(id int, status text);
    CREATE TABLE legacy_transfer_requests(id int, status text);
    CREATE TABLE user_subscriptions(id int, status text);
    INSERT INTO users(id,name,slack_user_id,slack_workspace_id) VALUES ('00000000-0000-4000-8000-000000000001','Member','slack','workspace');
    INSERT INTO items SELECT n,0,3,true,false FROM generate_series(1,1025) n;
    INSERT INTO items VALUES (1026,0,3,true,true),(1027,0,3,false,false);
    INSERT INTO orders SELECT n,'00000000-0000-4000-8000-000000000001',130,'deferred','completed',NULL,NULL FROM generate_series(1,4) n;
    INSERT INTO orders VALUES (5,'00000000-0000-4000-8000-000000000001',100,'cash','pending',NULL,NULL),(6,'00000000-0000-4000-8000-000000000001',130,'deferred','completed','cash','2026-10-01'),(7,'00000000-0000-4000-8000-000000000001',130,'deferred','completed','stripe',NULL);
    INSERT INTO charge_requests VALUES (1,'cash','approved',NULL),(2,'stripe','pending',NULL),(3,'cash','approved','2026-10-01');
    INSERT INTO subscription_payments VALUES (1,'00000000-0000-4000-8000-000000000001','pending_cash_settlement',200);
    INSERT INTO purchase_runs VALUES (1,'pending_reimbursement'),(2,'pending_reimbursement');
    INSERT INTO user_subscriptions VALUES (1,'active'),(2,'cancel_at_period_end'),(3,'cancelled');
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  const snapshot = async () => {
    const tables = ['users','items','orders','charge_requests','subscription_payments','purchase_runs','item_requests','legacy_transfer_requests','user_subscriptions'];
    return Promise.all(tables.map(async (table) => (await db.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) AS hash FROM ${table} t`)).rows[0].hash));
  };
  const before = await snapshot();
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const migration = fs.readdirSync(dir).find((name) => name.endsWith('_read_admin_overview.sql'));
  await db.exec(fs.readFileSync(path.join(dir, migration), 'utf8'));
  await db.exec('SET ROLE service_role');
  const data = (await db.query("SELECT public.read_admin_overview('workspace') AS data")).rows[0].data;
  await db.exec('RESET ROLE');
  await t.test('counts include unpaid records only and preserve legacy/cash-charge debt', () => {
    assert.equal(data.deferredOrders, 4); assert.equal(data.cashOrders, 1);
    assert.equal(data.pendingCharges, 1); assert.equal(data.cashCharges, 1);
    assert.equal(data.subscriptionPayments, 1); assert.equal(data.reimbursements, 2);
    assert.equal(data.users, 1); assert.equal(data.activeSubscriptions, 2);
    assert.equal(data.deferredUsers[0].deferred_balance, 900);
    assert.equal(data.pendingCashOrders[0].user.name, 'Member');
    assert.equal(data.pendingSubscriptions[0].cash_due_amount, 200);
    assert.equal(data.inventory.filter((item) => !item.is_unlimited_stock).length, 1025);
  });
  await t.test('migration and repeated reads do not change any existing row, role, balance or stock', async () => {
    await db.query('SELECT public.read_admin_overview(NULL)');
    assert.deepEqual(await snapshot(), before);
    const filtered = (await db.query("SELECT public.read_admin_overview('other') AS data")).rows[0].data;
    assert.equal(filtered.botIntroUsers.length, 0);
  });
  await t.test('anonymous and ordinary authenticated sessions cannot execute the management summary', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => db.query('SELECT public.read_admin_overview(NULL)'), (error) => error.code === '42501');
      await db.exec('RESET ROLE');
    }
  });
});
