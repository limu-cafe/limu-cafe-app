// Isolated PostgreSQL only (PGlite); nothing here connects to Supabase or the network.
// PGlite uses one connection: two requests with the same ID arriving at the same moment
// cannot be reproduced here and still need a multi-connection check on staging.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const dir = path.resolve(__dirname, '../../supabase/migrations');
const ids = Array.from({ length: 20 }, (_, i) => `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [user, other, item, unlimited] = ids;
const rid = (n) => ids[9 + n];

test('checkout enforces the deferred ceiling and registers each request ID once', async (t) => {
  const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  `);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    // PGlite uses Postgres' built-in UUID generator instead of uuid-ossp.
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
    try { await db.exec(sql); } catch (e) { e.message = file + ': ' + e.message; throw e; }
  }
  await db.exec(`
    insert into auth.users values ('${user}'),('${other}');
    insert into users(id,name,balance,points_balance,role,is_approved) values
      ('${user}','利用者',1000,80,'member',true),('${other}','別の利用者',1000,0,'member',true);
    insert into items(id,name,price,stock,is_unlimited_stock) values ('${item}','お茶',130,10,false),('${unlimited}','コーヒー',200,0,true);
  `);
  const snapshot = async () => (await db.query(`select jsonb_build_object(
    'users',(select jsonb_agg(to_jsonb(t) order by id) from users t),
    'items',(select jsonb_agg(to_jsonb(t) order by id) from items t),
    'orders',(select jsonb_agg(to_jsonb(t) order by id) from orders t),
    'lines',(select jsonb_agg(to_jsonb(t) order by id) from order_items t),
    'stock',(select jsonb_agg(to_jsonb(t) order by id) from stock_history t),
    'points',(select jsonb_agg(to_jsonb(t) order by id) from point_transactions t),
    'operations',(select jsonb_agg(to_jsonb(t) order by request_id) from checkout_operations t)) as state`)).rows[0].state;
  // Default order: two teas, 260 yen.
  const checkout = async (patch = {}) => {
    const p = { user, items: [{ item_id: item, quantity: 2 }], total: 260, method: 'balance', deferred: null, points: 0, request: null, ...patch };
    return (await db.query('select public.checkout_order($1,$2,$3,$4,$5,$6,$7) as r', [p.user, JSON.stringify(p.items), p.total, p.method, p.deferred, p.points, p.request])).rows[0].r;
  };
  const later = (patch = {}) => checkout({ method: 'deferred', deferred: 'cash', ...patch });
  const owe = (amount) => db.query('update users set deferred_balance=$2 where id=$1', [user, amount]);
  const wallet = async () => (await db.query('select balance,deferred_balance,points_balance from users where id=$1', [user])).rows[0];
  const count = async (table) => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
  const stock = async () => (await db.query('select stock from items where id=$1', [item])).rows[0].stock;
  const isolated = (name, run) => t.test(name, async () => { await db.exec('begin'); try { await db.exec('set local role service_role'); await run(); } finally { await db.exec('rollback'); } });
  // Asserts the rejection and that stock, wallet, points and request IDs are all unchanged.
  const rejects = async (run, code) => {
    const before = await snapshot(); await db.exec('savepoint denied');
    let error; try { await run(); } catch (e) { error = e; }
    await db.exec('rollback to savepoint denied');
    assert.ok(error, 'expected a rejection'); assert.equal(error.code, code, error.message);
    assert.deepEqual(await snapshot(), before);
    return error;
  };

  await isolated('a deferred order that lands exactly on 10,000 yen passes; one yen more is rejected', async () => {
    await owe(9741);
    const error = await rejects(() => later({ request: rid(0) }), 'LM001');
    assert.equal(error.message, '後払いの上限（10,000円）を超えるため受け付けできません');
    assert.deepEqual(JSON.parse(error.detail), { limit: 10000, current: 9741, requested: 260, remaining: 259 });
    await owe(9740);
    const r = await later({ request: rid(0) });
    assert.equal(r.payment_method, 'deferred');
    assert.deepEqual(await wallet(), { balance: 1000, deferred_balance: 10000, points_balance: 80 });
    assert.equal(await stock(), 8);
    await rejects(() => later({ items: [{ item_id: item, quantity: 1 }], total: 130 }), 'LM001');
  });
  await isolated('the ceiling applies to the amount left after points', async () => {
    await owe(9800);
    await rejects(() => later({ points: 59 }), 'LM001'); // 201 yen would be added
    const r = await later({ points: 60 }); // 200 yen is added
    assert.equal(r.points_used, 60);
    assert.deepEqual(await wallet(), { balance: 1000, deferred_balance: 10000, points_balance: 20 });
  });
  await isolated('balance, cash and points-only orders pass regardless of the ceiling', async () => {
    await owe(12000);
    await checkout();
    assert.deepEqual(await wallet(), { balance: 740, deferred_balance: 12000, points_balance: 80 });
    const cash = await checkout({ method: 'cash', items: [{ item_id: unlimited, quantity: 1 }], total: 200 });
    assert.equal(cash.payment_method, 'cash');
    await db.exec(`update items set price=40 where id='${item}'`);
    const free = await later({ total: 80, points: 80 }); // nothing is left to defer
    assert.equal(free.payment_method, 'balance');
    assert.deepEqual(await wallet(), { balance: 740, deferred_balance: 12000, points_balance: 0 });
    assert.equal(await count('orders'), 3);
  });
  await isolated('the same request ID sent twice registers one order and reduces stock once', async () => {
    const first = await later({ points: 50, request: rid(1) });
    assert.equal(first.replayed, undefined);
    const after = await snapshot();
    const second = await later({ points: 50, request: rid(1) });
    assert.deepEqual(second, { ...first, replayed: true });
    assert.deepEqual(await snapshot(), after);
    assert.equal(await count('orders'), 1); assert.equal(await count('order_items'), 1);
    assert.equal(await count('stock_history'), 1); assert.equal(await count('point_transactions'), 1);
    assert.equal(await stock(), 8);
    assert.deepEqual(await wallet(), { balance: 1000, deferred_balance: 210, points_balance: 30 });
    // A replay returns the first result even when the order could no longer be placed.
    await db.exec(`update items set stock=0 where id='${item}'`);
    assert.equal((await later({ points: 50, request: rid(1) })).order_id, first.order_id);
    // A new ID is a new order.
    await db.exec(`update items set stock=5 where id='${item}'`);
    assert.notEqual((await later({ points: 0, request: rid(2) })).order_id, first.order_id);
    assert.equal(await count('orders'), 2);
  });
  await isolated('a replay ignores the order of cart lines and browser-supplied extras', async () => {
    const lines = [{ item_id: item, quantity: 1 }, { item_id: unlimited, quantity: 1 }];
    const first = await checkout({ items: lines, total: 330, request: rid(3) });
    const second = await checkout({ items: [{ ...lines[1], item_name: '偽名', item_price: 1 }, lines[0]], total: 330, request: rid(3) });
    assert.equal(second.order_id, first.order_id); assert.equal(second.replayed, true);
    assert.equal(await count('orders'), 1);
  });
  await isolated('reusing a request ID for a different order or a different user is rejected', async () => {
    await checkout({ request: rid(4) });
    for (const patch of [{ items: [{ item_id: item, quantity: 1 }], total: 130 }, { points: 10 }, { method: 'cash' },
      { method: 'deferred', deferred: 'cash' }, { user: other }]) {
      await rejects(() => checkout({ request: rid(4), ...patch }), '22023');
    }
    assert.equal(await count('orders'), 1);
  });
  await isolated('a rejected order does not keep its request ID, so the corrected order can reuse it', async () => {
    await rejects(() => checkout({ items: [{ item_id: item, quantity: 11 }], total: 1430, request: rid(5) }), 'P0001');
    await owe(10000);
    await rejects(() => later({ request: rid(5) }), 'LM001');
    assert.equal(await count('checkout_operations'), 0);
    assert.equal((await checkout({ request: rid(5) })).ok, true);
    assert.equal(await count('checkout_operations'), 1); assert.equal(await count('orders'), 1);
  });
  await isolated('a late ledger failure rolls back order, stock, points, wallet and the request ID together', async () => {
    await db.exec(`reset role; create function public.fixture_failure() returns trigger language plpgsql as $$ begin raise exception 'injected ledger failure'; end $$;
      create trigger fixture_failure before update of deferred_balance on users for each row execute function public.fixture_failure(); set local role service_role;`);
    await rejects(() => later({ points: 20, request: rid(6) }), 'P0001');
  });
  await isolated('without a request ID each call is a separate order, as before the migration', async () => {
    const a = await checkout(), b = await checkout();
    assert.notEqual(a.order_id, b.order_id);
    assert.equal(await count('orders'), 2); assert.equal(await count('checkout_operations'), 0);
    assert.equal(await stock(), 6);
    const legacy = (await db.query('select public.checkout_order($1,$2,$3,$4,$5,$6) as r', [user, JSON.stringify([{ item_id: item, quantity: 1 }]), 130, 'balance', null, 0])).rows[0].r;
    assert.equal(legacy.ok, true);
  });
  await isolated('the six-argument function is gone and only the server role reaches the new one', async () => {
    const signatures = (await db.query("select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='checkout_order'")).rows;
    assert.equal(signatures.length, 1); assert.match(signatures[0].args, /p_request_id uuid$/);
    const fn = 'public.checkout_order(uuid,jsonb,integer,text,text,integer,uuid)';
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, fn])).rows[0].allowed, false);
      assert.equal((await db.query("select has_table_privilege($1,'public.checkout_operations','SELECT,INSERT,UPDATE,DELETE') as allowed", [role])).rows[0].allowed, false);
    }
    assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [fn])).rows[0].allowed, true);
    await checkout({ request: rid(7) });
    await db.exec(`reset role; set local request.jwt.claim.sub='${user}'; set local role authenticated;`);
    await assert.rejects(db.query('select * from checkout_operations'), (e) => e.code === '42501');
  });
});
