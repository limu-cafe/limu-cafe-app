const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const cache = new Map();
  function compile(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name === 'react') return { cache: (fn) => fn };
      if (name.startsWith('node:')) return require(name);
      if (name.startsWith('@/')) return compile(path.join(root, name.slice(2)) + '.ts');
      throw new Error(`Unexpected import ${name}`);
    };
    vm.runInNewContext(source, { exports: module.exports, module, require: localRequire, Buffer, Date, URL, console, crypto: require('node:crypto').webcrypto, TextEncoder, process: { env: {} }, ...globals }, { filename });
    return module.exports;
  }
  return compile(path.join(root, file));
}
const ordering = load('lib/item-order.ts');

test('saved order survives new items and filters without moving hidden items into view', () => {
  const items = ids.map((id, i) => ({ id, created_at: `2026-10-0${i + 1}`, is_available: i !== 1 }));
  const result = ordering.sortItemsByDisplayOrder(items, [ids[1], ids[0], 'deleted-id']);
  assert.deepEqual(plain(result.map((i) => i.id)), [ids[1], ids[0], ids[2]]);
  assert.deepEqual(plain(result.filter((i) => i.is_available).map((i) => i.id)), [ids[0], ids[2]]);
  assert.deepEqual(items.map((i) => i.id), ids);
  assert.deepEqual(plain(ordering.sortItemsByDisplayOrder(items, []).map((i) => i.id)), [...ids].reverse());
});
test('up/down and jump moves preserve every ID exactly once', () => {
  assert.deepEqual(plain(ordering.moveItemId(ids, ids[0], 2)), [ids[1], ids[2], ids[0]]);
  assert.deepEqual(plain(ordering.moveItemId(ids, ids[2], 0)), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(plain(ordering.moveItemId(ids, ids[0], -1)), ids);
});
test('reject invalid IDs, duplicates (including mixed case), and invalid revisions', () => {
  for (const body of [null, {}, { itemIds: ['bad'], expectedRevision: 0 },
    { itemIds: [ids[0], ids[0]], expectedRevision: 0 },
    { itemIds: ids, expectedRevision: -1 }, { itemIds: ids, expectedRevision: 1.5 },
    { itemIds: ids, expectedRevision: '0' }]) assert.equal(ordering.parseItemOrderInput(body), null);
  assert.deepEqual(plain(ordering.parseItemOrderInput({ itemIds: ids, expectedRevision: 0 })), { itemIds: ids, expectedRevision: 0 });
});
test('password proof rejects a fabricated expiry, wrong user, expiry, tampering and rotated password', async () => {
  const { createAdminProof, verifyAdminProof } = load('lib/admin-proof.ts');
  const now = 1792020000000; const expiry = now + 3600000;
  const proof = await createAdminProof('user-a', expiry, 'test-only-secret');
  assert.equal(await verifyAdminProof(proof, 'user-a', 'test-only-secret', now), true);
  for (const [token, user, secret, time] of [
    [String(expiry), 'user-a', 'test-only-secret', now],
    [proof, 'user-b', 'test-only-secret', now], [proof, 'user-a', 'changed-secret', now],
    [proof, 'user-a', 'test-only-secret', expiry], [proof + '.extra', 'user-a', 'test-only-secret', now],
    [proof.replace(String(expiry), String(expiry + 1)), 'user-a', 'test-only-secret', now],
  ]) assert.equal(await verifyAdminProof(token, user, secret, time), false);
});
function route(session, rpcResult = { data: 1, error: null }) {
  const calls = []; const invalidated = [];
  const api = load('app/api/admin/items/order/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    'next/cache': { revalidatePath: (value) => invalidated.push(value) },
    '@/lib/admin-session': { requireVerifiedAdminSession: async () => session },
    '@/lib/supabase/server': { createAdminClient: () => ({ rpc: async (...args) => { calls.push(args); return rpcResult; } }) },
  });
  const request = (body, origin = 'https://cafe.test') => ({ url: 'https://cafe.test/api/admin/items/order', headers: new Headers({ origin }), json: async () => body });
  return { ...api, calls, invalidated, request };
}
test('save API rejects unauthenticated, unverified and cross-origin calls before accessing DB', async () => {
  for (const status of [401, 403]) {
    const r = route({ user: null, error: 'denied', status });
    assert.equal((await r.PUT(r.request({ itemIds: ids, expectedRevision: 0 }))).status, status);
    assert.equal(r.calls.length, 0);
  }
  const r = route({ user: { id: 'actor' }, error: null, status: 200 });
  assert.equal((await r.PUT(r.request({ itemIds: ids, expectedRevision: 0 }, 'https://elsewhere.test'))).status, 403);
  assert.equal(r.calls.length, 0);
});
test('save API calls one atomic RPC with the authenticated actor and invalidates both views', async () => {
  const r = route({ user: { id: 'actor' }, error: null, status: 200 });
  assert.equal((await r.PUT(r.request({ itemIds: ids, expectedRevision: 0, actor: 'forged' }))).status, 200);
  assert.deepEqual(plain(r.calls), [['save_item_display_order', { p_item_ids: ids, p_expected_revision: 0, p_actor_id: 'actor' }]]);
  assert.deepEqual(r.invalidated, ['/', '/api/items', '/admin/items', '/admin/audit']);
});
test('conflicts and unavailable schema do not invalidate views or report success', async () => {
  for (const [code, status] of [['40001', 409], ['PGRST202', 503], ['42P01', 503]]) {
    const r = route({ user: { id: 'actor' }, error: null, status: 200 }, { data: null, error: { code } });
    assert.equal((await r.PUT(r.request({ itemIds: ids, expectedRevision: 0 }))).status, status);
    assert.equal(r.invalidated.length, 0);
  }
});
test('legacy schema keeps the old order; network errors are not mistaken for missing schema', async () => {
  const { loadItemDisplayOrder } = load('lib/item-order-server.ts');
  const db = (error) => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error }) }) }) }) });
  assert.deepEqual(plain(await loadItemDisplayOrder(db({ code: '42P01' }))), { itemIds: [], revision: 0, available: false });
  await assert.rejects(() => loadItemDisplayOrder(db(new Error('offline'))), /offline/);
});

test('management login issues an HttpOnly user-bound proof, and logout removes it', async () => {
  const settings = [];
  const module = load('app/api/admin/auth/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, cookies: { set: (...args) => settings.push(args) } }) } },
    '@/lib/member-session': { requireMemberSession: async () => ({user:{id:'user-a'},error:null,status:200}) },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) } }) },
  }, { process: { env: { ADMIN_PASSWORD: 'test-only-password' } } });
  assert.equal((await module.POST({ json: async () => ({ password: 'wrong' }) })).status, 401);
  assert.equal(settings.length, 0);
  assert.equal((await module.POST({ json: async () => ({ password: 'test-only-password' }) })).status, 200);
  const [name, proof, flags] = settings.find(([name]) => name === 'limu_admin_proof');
  assert.equal(name, 'limu_admin_proof'); assert.equal(flags.httpOnly, true);
  assert.equal(await load('lib/admin-proof.ts').verifyAdminProof(proof, 'user-a', 'test-only-password'), true);
  settings.length = 0;
  assert.equal((await module.DELETE({ url: 'https://cafe.test/api/admin/auth', headers: new Headers({ origin: 'https://cafe.test' }) })).status, 200);
  assert.ok(settings.some(([name, value, flags]) => name === 'limu_admin_proof' && value === '' && flags.maxAge === 0));
});

test('signed management session rejects the legacy timestamp without a valid password proof', async () => {
  const future = Date.now() + 3600000;
  const { createAdminProof } = load('lib/admin-proof.ts');
  let proof;
  const module = load('lib/admin-session.ts', {
    'next/headers': { cookies: async () => ({ get: (name) => ({ value: name === 'limu_admin_auth' ? String(future) : proof }) }) },
    '@/lib/member-session': { requireMemberSession: async () => ({user:{id:'user-a'},error:null,status:200}) },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) } }) },
  }, { process: { env: { ADMIN_PASSWORD: 'test-secret' } } });
  assert.equal((await module.requireVerifiedAdminSession()).status, 403);
  proof = await createAdminProof('another-user', future, 'test-secret');
  assert.equal((await module.requireVerifiedAdminSession()).status, 403);
  proof = await createAdminProof('user-a', future, 'test-secret');
  assert.equal((await module.requireVerifiedAdminSession()).status, 200);
});

function editor(fetchImpl) {
  let cursor = 0; const hooks = []; let refreshed = 0;
  const react = {
    useState: (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef: (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useMemo: (fn) => fn(), useEffect: () => {},
  };
  const jsx = (type, props) => ({ type, props });
  const component = load('app/admin/items/ItemOrderEditor.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'link' },
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshed++; } }) },
    'lucide-react': { ArrowDown: 'down', ArrowUp: 'up' },
    'react-hot-toast': { default: { success: () => {} } },
  }, { fetch: fetchImpl, window: { confirm: () => true } }).default;
  const props = { items: ids.map((id, i) => ({ id, name: `item-${i}`, created_at: '', is_available: true })), revision: 3, available: true, verified: true };
  const render = () => { cursor = 0; return component(props); };
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const click = (label) => nodes(render()).find((node) => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label)).props.onClick();
  return { render, nodes, click, props, refreshed: () => refreshed };
}

test('editor previews moves, submits once, and retains the draft after a conflict', async () => {
  let calls = 0; let body;
  const e = editor(async (_, options) => { calls++; body = JSON.parse(options.body); return { ok: false, json: async () => ({ error: 'another administrator changed it' }) }; });
  e.click('表示順を編集'); e.click('item-0 を下へ');
  assert.equal(e.nodes(e.render()).find((node) => node.type === 'select').props.value, 0);
  const firstSave = e.click('この順序で保存');
  const secondSave = e.click('保存中...');
  await Promise.all([firstSave, secondSave]);
  assert.equal(calls, 1);
  assert.deepEqual(body, { itemIds: [ids[1], ids[0], ids[2]], expectedRevision: 3 });
  assert.ok(e.nodes(e.render()).some((node) => node.props?.role === 'alert' && node.props.children.includes('another administrator')));
  assert.ok(e.nodes(e.render()).some((node) => node.type === 'ol'));
  assert.equal(e.refreshed(), 0);
});

test('editor refuses to save a stale product catalog', async () => {
  let calls = 0;
  const e = editor(async () => { calls++; return { ok: true, json: async () => ({ revision: 4 }) }; });
  e.click('表示順を編集'); e.click('item-0 を下へ');
  e.props.items = e.props.items.slice(1);
  assert.equal(e.nodes(e.render()).find((node) => node.type === 'button' && node.props.children === 'この順序で保存').props.disabled, true);
  await e.click('この順序で保存'); assert.equal(calls, 0);
});
