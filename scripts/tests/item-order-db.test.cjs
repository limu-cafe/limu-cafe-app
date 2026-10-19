// PGLITE_MODULE points to a temporary @electric-sql/pglite installation.
// Nothing here connects to a Supabase project or the network.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

test('display-order migration and atomic save on isolated Postgres', { skip: !process.env.PGLITE_MODULE }, async (t) => {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.items (id uuid PRIMARY KEY, stock integer NOT NULL DEFAULT 7);
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.admin_audit_logs (id uuid DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
      action_type text, target_type text, summary text, metadata jsonb);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    INSERT INTO users VALUES ('${ids[0]}');
    INSERT INTO items(id) VALUES ('${ids[0]}'), ('${ids[1]}'), ('${ids[2]}');
  `);
  const migrations = path.resolve(__dirname, '../../supabase/migrations');
  const filename = fs.readdirSync(migrations).find((name) => name.endsWith('_item_display_order.sql'));
  assert.ok(filename, 'generate migration using supabase migration new item_display_order');
  await db.exec(fs.readFileSync(path.join(migrations, filename), 'utf8'));
  const save = (ordered, revision, actor = ids[0]) => db.query(
    'SELECT public.save_item_display_order($1::uuid[], $2::integer, $3::uuid) AS revision',
    [ordered, revision, actor]
  );
  const snapshot = async () => (await db.query(`SELECT revision, item_ids,
    (SELECT count(*)::integer FROM admin_audit_logs) AS logs FROM item_display_order`)).rows[0];

  await t.test('service role saves one revision and audit entry without touching stock', async () => {
    await db.exec('SET ROLE service_role');
    assert.equal((await save([ids[2], ids[0], ids[1]], 0)).rows[0].revision, 1);
    await db.exec('RESET ROLE');
    assert.deepEqual(await snapshot(), { revision: 1, item_ids: [ids[2], ids[0], ids[1]], logs: 1 });
    assert.ok((await db.query('SELECT stock FROM items')).rows.every((item) => item.stock === 7));
  });
  await t.test('stale revision cannot overwrite another administrator', async () => {
    await assert.rejects(() => save(ids.slice(0, 3), 0), (error) => error.code === '40001');
    assert.equal((await snapshot()).revision, 1);
  });
  await t.test('missing, duplicate, unknown and newly added products cannot produce partial orders', async () => {
    await assert.rejects(() => save([ids[0], ids[1]], 1), (e) => e.code === '40001');
    await assert.rejects(() => save([ids[0], ids[0], ids[2]], 1), (e) => e.code === '22023');
    await assert.rejects(() => save([ids[0], ids[1], ids[3]], 1), (e) => e.code === '40001');
    await db.query('INSERT INTO items(id) VALUES ($1)', [ids[3]]);
    await assert.rejects(() => save(ids.slice(0, 3), 1), (e) => e.code === '40001');
    await db.query('DELETE FROM items WHERE id=$1', [ids[3]]);
    assert.equal((await snapshot()).logs, 1);
  });
  await t.test('audit failure rolls back order and revision together', async () => {
    const before = await snapshot();
    await assert.rejects(() => save(ids.slice(0, 3), 1, ids[3]), (e) => e.code === '23503');
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('anonymous and authenticated roles cannot read or mutate management settings', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => save(ids.slice(0, 3), 1), (e) => e.code === '42501');
      await assert.rejects(() => db.query('SELECT * FROM item_display_order'), (e) => e.code === '42501');
      await db.exec('RESET ROLE');
    }
  });
});
