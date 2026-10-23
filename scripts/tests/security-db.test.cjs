const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const dir = path.resolve(__dirname, '../../supabase/migrations');
const [user, other, admin, item, unlimited] = Array.from({ length: 5 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

test('full schema security migration and checkout on isolated PostgreSQL', async t => {
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
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    // PGlite uses Postgres' built-in UUID generator instead of uuid-ossp.
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, '').replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
    try { await db.exec(sql); } catch (e) { e.message = file + ': ' + e.message; throw e; }
  }
  await db.exec(`
    insert into auth.users values ('${user}'),('${other}'),('${admin}');
    insert into auth.identities select id,'slack_oidc',jsonb_build_object('provider_id','U_'||id::text,'custom_claims',jsonb_build_object('https://slack.com/team_id','T_FIXTURE')) from auth.users;
    insert into users(id,name,balance,points_balance,role,is_approved) values
      ('${user}','利用者',1000,80,'member',true),('${other}','別の利用者',1000,0,'member',true),('${admin}','管理者',0,0,'admin',true);
    update users set slack_user_id='U_'||id::text;
    insert into items(id,name,price,stock,is_unlimited_stock) values ('${item}','お茶',130,10,false),('${unlimited}','コーヒー',200,0,true);
  `);
  const snapshot = async () => (await db.query(`select jsonb_build_object(
    'users',(select jsonb_agg(to_jsonb(t) order by id) from users t),
    'items',(select jsonb_agg(to_jsonb(t) order by id) from items t),
    'orders',(select jsonb_agg(to_jsonb(t) order by id) from orders t),
    'lines',(select jsonb_agg(to_jsonb(t) order by id) from order_items t),
    'stock',(select jsonb_agg(to_jsonb(t) order by id) from stock_history t),
    'points',(select jsonb_agg(to_jsonb(t) order by id) from point_transactions t)) as state`)).rows[0].state;
  const checkout = async (patch = {}) => {
    const p = { items: [{ item_id: item, quantity: 2 }], total: 260, method: 'balance', deferred: null, points: 0, ...patch };
    return (await db.query('select public.checkout_order($1,$2,$3,$4,$5,$6) as r', [user, JSON.stringify(p.items), p.total, p.method, p.deferred, p.points])).rows[0].r;
  };
  const isolated = (name, run) => t.test(name, async () => { await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); } });
  const rejectsWithoutWrites = async (run, code) => {
    const before = await snapshot(); await db.exec('savepoint denied');
    await assert.rejects(run, e => !code || e.code === code);
    await db.exec('rollback to savepoint denied'); assert.deepEqual(await snapshot(), before);
  };
  await isolated('migration removes every financial column update and public financial RPC', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const column of ['balance','deferred_balance','points_balance','role','is_approved','is_active']) {
        assert.equal((await db.query("select has_column_privilege($1,'public.users',$2,'UPDATE') as allowed", [role,column])).rows[0].allowed, false);
      }
      for (const table of ['settlements','price_watches','settlement_reminder_settings']) {
        assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') as allowed', [role,'public.'+table])).rows[0].allowed, false);
      }
      assert.equal((await db.query("select has_function_privilege($1,'public.checkout_order(uuid,jsonb,integer,text,text,integer)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
      assert.equal((await db.query("select has_function_privilege($1,'public.decrement_user_balance_if_available(uuid,integer)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
    }
  });
  await isolated('ordinary users can read only their own profile and cannot elevate role or wallet', async () => {
    await db.exec(`set local request.jwt.claim.sub='${user}'; set local role authenticated;`);
    assert.deepEqual((await db.query('select id from users')).rows,[{id:user}]);
    await assert.rejects(db.exec(`update users set role='admin',balance=999999 where id='${user}'`), e=>e.code==='42501');
  });
  await isolated('anonymous product browsing remains available; private tables and role lookup are denied', async () => {
    await db.exec('set local role anon');
    assert.equal((await db.query('select * from items')).rows.length,2);
    await assert.rejects(db.exec('select * from settlements'), e=>e.code==='42501');
  });
  await isolated('request board, comments and own favorites keep their normal client writes', async () => {
    await db.exec(`set local request.jwt.claim.sub='${user}'; set local role authenticated;`);
    const req = (await db.query("insert into item_requests(user_id,item_name) values ($1,'紅茶') returning id",[user])).rows[0].id;
    await db.query('insert into item_request_comments(request_id,user_id,body) values ($1,$2,$3)',[req,user,'賛成']);
    await db.query('insert into item_request_votes(request_id,user_id) values ($1,$2)',[req,user]);
    await db.query('insert into favorite_items(user_id,item_id) values ($1,$2)',[user,item]);
    assert.equal((await db.query('select * from favorite_items')).rows.length,1);
  });
  await isolated('balance order snapshots DB names/prices and updates stock and wallet once', async () => {
    await db.exec('set local role service_role');
    const r = await checkout({ items: [{ item_id:item,quantity:2,item_name:'偽名',item_price:1,subtotal:2 }] });
    assert.equal(r.total_amount,260); assert.equal(r.items[0].item_price,130); assert.equal(r.items[0].item_name,'お茶');
    assert.deepEqual((await db.query('select balance,deferred_balance,points_balance from users where id=$1',[user])).rows[0],{balance:740,deferred_balance:0,points_balance:80});
    assert.equal((await db.query('select stock from items where id=$1',[item])).rows[0].stock,8);
    assert.equal((await db.query('select accounting_ready from orders where id=$1',[r.order_id])).rows[0].accounting_ready,true);
  });
  await isolated('points plus deferred payment, unlimited stock and cash pending retain their semantics', async () => {
    await db.exec('set local role service_role');
    const r=await checkout({method:'deferred',deferred:'cash',points:50});
    assert.equal(r.points_used,50);
    assert.deepEqual((await db.query('select balance,deferred_balance,points_balance from users where id=$1',[user])).rows[0],{balance:1000,deferred_balance:210,points_balance:30});
    const c=await checkout({items:[{item_id:unlimited,quantity:1}],total:200,method:'cash'});
    assert.equal((await db.query('select payment_status from orders where id=$1',[c.order_id])).rows[0].payment_status,'pending');
    assert.equal((await db.query('select stock from items where id=$1',[unlimited])).rows[0].stock,0);
  });
  await isolated('points-only and free items do not charge the wallet', async () => {
    await db.exec(`update items set price=40 where id='${item}'; set local role service_role;`);
    const r=await checkout({total:80,points:999,method:'deferred',deferred:'cash'});
    assert.equal(r.points_used,80);assert.equal(r.payment_method,'balance');
    assert.equal((await db.query('select balance from users where id=$1',[user])).rows[0].balance,1000);
    await db.exec(`update items set price=0 where id='${item}'`); assert.equal((await checkout({total:0})).total_amount,0);
  });
  await isolated('forged/stale totals, bad quantities, duplicates, invalid payment and stock shortage leave no writes', async () => {
    await db.exec('set local role service_role');
    for (const patch of [{total:1},{total:-1},{items:[]},{items:[{item_id:item,quantity:0}]},{items:[{item_id:item,quantity:-1}]},{items:[{item_id:item,quantity:1.5}]},{items:[{item_id:item,quantity:'2'}]},{items:[{item_id:item,quantity:2},{item_id:item,quantity:2}]},{items:[{item_id:item,quantity:11}],total:1430},{method:'stripe'},{method:'bad'},{method:'deferred',deferred:null}]) {
      await rejectsWithoutWrites(()=>checkout(patch));
    }
  });
  await isolated('insufficient balance, inactive and unapproved accounts cannot order', async () => {
    await db.exec('set local role service_role');
    await db.exec(`update users set balance=1 where id='${user}'`); await rejectsWithoutWrites(()=>checkout(),'P0001');
    await db.exec(`update users set balance=1000,is_active=false where id='${user}'`); await rejectsWithoutWrites(()=>checkout(),'42501');
    await db.exec(`update users set is_active=true,is_approved=false where id='${user}'`); await rejectsWithoutWrites(()=>checkout(),'42501');
  });
  await isolated('late ledger failure rolls back order, inventory, point use and wallet together', async () => {
    await db.exec(`create function public.fixture_failure() returns trigger language plpgsql as $$ begin raise exception 'injected ledger failure'; end $$;
      create trigger fixture_failure before update on users for each row execute function public.fixture_failure(); set local role service_role;`);
    await rejectsWithoutWrites(()=>checkout({points:20}));
  });
  await isolated('management service keeps charge, refund, restock and settlement RPC privileges', async () => {
    const functions=['apply_immediate_charge_to_deferred(uuid,integer)','refund_order(uuid,uuid)','record_stock_restock(uuid,uuid,integer,text,jsonb,uuid)','admin_pay_orders_from_balance(uuid,uuid,jsonb,integer,uuid,text)'];
    for(const fn of functions) assert.equal((await db.query('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') as allowed',['public.'+fn])).rows[0].allowed,true);
  });
  await isolated('balance, deferred and pending-cash orders still refund inventory, wallet and points correctly', async () => {
    await db.exec('set local role service_role');
    for (const method of ['balance','deferred','cash']) {
      const r=await checkout({method,deferred:method==='deferred'?'cash':null,points:50});
      await db.query('select public.refund_order($1,$2)',[r.order_id,admin]);
      assert.deepEqual((await db.query('select balance,deferred_balance,points_balance from users where id=$1',[user])).rows[0],{balance:1000,deferred_balance:0,points_balance:80});
      assert.equal((await db.query('select stock from items where id=$1',[item])).rows[0].stock,10);
      assert.equal((await db.query('select payment_status from orders where id=$1',[r.order_id])).rows[0].payment_status,'refunded');
    }
  });
  await isolated('the established immediate top-up still adds the same amount to wallet and unpaid debt', async () => {
    await db.exec('set local role service_role');
    await db.query('select public.apply_immediate_charge_to_deferred($1,1000)',[user]);
    assert.deepEqual((await db.query('select balance,deferred_balance from users where id=$1',[user])).rows[0],{balance:2000,deferred_balance:1000});
  });
});
