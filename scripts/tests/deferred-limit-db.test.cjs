// Isolated PostgreSQL only (PGlite); nothing here connects to Supabase or the network.
// PGlite uses one connection, so the row locks are exercised but real concurrency is not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const dir = path.resolve(__dirname, '../../supabase/migrations');
const [user, missing] = [1, 2].map((n) => `30000000-0000-4000-8000-00000000000${n}`);

test('deferred balance ceiling check on the full schema', async (t) => {
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
    insert into auth.users values ('${user}');
    insert into users(id,name,balance,points_balance,role,is_approved) values ('${user}','利用者',1000,80,'member',true);
  `);
  const snapshot = async () => (await db.query(`select jsonb_build_object(
    'users',(select jsonb_agg(to_jsonb(t) order by id) from users t),
    'orders',(select count(*) from orders),'charges',(select count(*) from charge_requests)) as state`)).rows[0].state;
  const owe = (amount) => db.query('update users set deferred_balance=$2 where id=$1', [user, amount]);
  const check = async (amount, id = user) => (await db.query('select public.check_deferred_limit($1,$2) as r', [id, amount])).rows[0].r;
  const isolated = (name, run) => t.test(name, async () => { await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); } });
  // Asserts the rejection and that the surrounding transaction holds no partial write.
  const rejects = async (run, code) => {
    const before = await snapshot(); await db.exec('savepoint denied');
    let error; try { await run(); } catch (e) { error = e; }
    await db.exec('rollback to savepoint denied');
    assert.ok(error, 'expected a rejection'); assert.equal(error.code, code);
    assert.deepEqual(await snapshot(), before);
    return error;
  };

  await isolated('the ceiling is 10,000 yen and is defined in one function', async () => {
    assert.equal((await db.query('select public.deferred_balance_limit() as r')).rows[0].r, 10000);
  });
  await isolated('an amount that lands exactly on the ceiling passes and reports no allowance left', async () => {
    await db.exec('set local role service_role');
    assert.equal(await check(10000), 0);
    await owe(9000); assert.equal(await check(1000), 0);
    assert.equal(await check(1), 999);
  });
  await isolated('one yen over the ceiling is rejected with LM001 and a machine-readable detail', async () => {
    await db.exec('set local role service_role');
    const fresh = await rejects(() => check(10001), 'LM001');
    assert.deepEqual(JSON.parse(fresh.detail), { limit: 10000, current: 0, requested: 10001, remaining: 10000 });
    await owe(9000);
    const error = await rejects(() => check(1001), 'LM001');
    assert.equal(error.message, '後払いの上限（10,000円）を超えるため受け付けできません');
    assert.deepEqual(JSON.parse(error.detail), { limit: 10000, current: 9000, requested: 1001, remaining: 1000 });
    await owe(10000); await rejects(() => check(1), 'LM001');
  });
  await isolated('a passing check changes nothing either', async () => {
    await db.exec('set local role service_role');
    await owe(4000); const before = await snapshot();
    await check(6000); await check(1);
    assert.deepEqual(await snapshot(), before);
  });
  await isolated('a user already above the ceiling cannot add any amount', async () => {
    await db.exec('set local role service_role');
    await owe(12000);
    const error = await rejects(() => check(1), 'LM001');
    assert.equal(JSON.parse(error.detail).remaining, 0);
  });
  await isolated('invalid amounts and unknown users are rejected before the ceiling is consulted', async () => {
    await db.exec('set local role service_role');
    for (const amount of [null, 0, -1]) await rejects(() => check(amount), '22023');
    await rejects(() => check(100, null), '22023');
    await rejects(() => check(100, missing), 'P0002');
    await rejects(() => check(2147483647), 'LM001'); // no integer overflow at the edge
  });
  await isolated('replacing the limit function changes both the decision and the message', async () => {
    await db.exec(`create or replace function public.deferred_balance_limit() returns integer language sql stable security invoker set search_path = '' as $$ select 5000 $$;
      set local role service_role;`);
    assert.equal(await check(5000), 0);
    const error = await rejects(() => check(5001), 'LM001');
    assert.equal(error.message, '後払いの上限（5,000円）を超えるため受け付けできません');
    assert.equal(JSON.parse(error.detail).limit, 5000);
  });
  await isolated('only the server role may run the check', async () => {
    for (const fn of ['public.check_deferred_limit(uuid,integer)', 'public.deferred_balance_limit()']) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, fn])).rows[0].allowed, false);
      }
      assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [fn])).rows[0].allowed, true);
    }
    await db.exec(`set local request.jwt.claim.sub='${user}'; set local role authenticated;`);
    await assert.rejects(() => check(100), (e) => e.code === '42501');
  });
});
