const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const modules = new Map();
  function compile(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return compile(path.join(root, name.slice(2)) + '.ts');
      if (name === 'react') return { cache: (fn) => { let result; return () => result ??= fn(); } };
      throw new Error(`Unexpected import: ${name}`);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: localRequire, console, URL, TextEncoder, crypto: require('node:crypto').webcrypto, process: { env: {} }, ...globals }, { filename });
    return module.exports;
  }
  return compile(path.join(root, file));
}

test('metadata edits discard stale stock, IDs, timestamps and financial fields', () => {
  const { ProductDetailsChange, ProductCreation, Product } = load('lib/domain/product.ts');
  assert.equal(new ProductCreation({ name: 'Tea', price: 130, stock: 7 }).initialStock, 7);
  assert.throws(() => new ProductCreation({ name: 'Tea', price: 130, stock: '7' }));
  const change = new ProductDetailsChange({ name: ' New name ', stock: 90, id: 'forged', balance: 10000, created_at: 'fake', price: 130, expected_updated_at: '2026-10-15T00:00:00Z' });
  assert.deepEqual(plain(change.patch), { name: 'New name', price: 130 });
  for (const price of [-1, 1.5, '100', NaN, Infinity]) assert.throws(() => new ProductDetailsChange({ price }));
  assert.throws(() => new ProductDetailsChange({ stock: 100 }));
  assert.equal(new Product({ stock: 0, stock_alert_threshold: 3, is_available: true }).needsRestock, true);
  assert.equal(new Product({ stock: 0, stock_alert_threshold: 3, is_available: true, is_unlimited_stock: true }).needsRestock, false);
});

function profileDb(existing, error = null) {
  const writes = [];
  const db = { from() { return {
    select() { return { eq() { return { maybeSingle: async () => ({ data: existing, error }) }; } }; },
    insert(value) { writes.push(['insert', value]); return Promise.resolve({ error: null }); },
    update(value) { writes.push(['update', value]); return { eq: async () => ({ error: null }) }; },
  }; } };
  return { db, writes };
}
const auth = { id: 'user', email: 'member@example.test', user_metadata: { full_name: 'Member', team_id: 'team', provider_id: 'slack', avatar_url: 'avatar' } };
const existing = { id: 'user', email: auth.email, name: 'Member', slack_user_id: 'slack', slack_workspace_id: 'team', avatar_url: 'avatar', role: 'admin', is_approved: false, balance: 1250, deferred_balance: 520, points_balance: 80 };
test('viewing an unchanged profile performs no write and preserves approval, role and every balance', async () => {
  const r = profileDb(existing);
  await load('lib/supabase/sync-user.ts', { '@/lib/supabase/server': { createAdminClient: () => r.db } }).syncUserProfile(auth);
  assert.deepEqual(r.writes, []);
});
test('changed profile updates metadata only; read failure never falls back to an overwriting upsert', async () => {
  const r = profileDb({ ...existing, name: 'Old name' });
  await load('lib/supabase/sync-user.ts', { '@/lib/supabase/server': { createAdminClient: () => r.db } }).syncUserProfile(auth);
  assert.deepEqual(plain(r.writes), [['update', { name: 'Member' }]]);
  const failed = profileDb(null, { message: 'unavailable' });
  await load('lib/supabase/sync-user.ts', { '@/lib/supabase/server': { createAdminClient: () => failed.db } }, { console: { error() {} } }).syncUserProfile(auth);
  assert.deepEqual(failed.writes, []);
});
test('new users retain the existing account creation policy without writing balances', async () => {
  const r = profileDb(null);
  await load('lib/supabase/sync-user.ts', { '@/lib/supabase/server': { createAdminClient: () => r.db } }).syncUserProfile(auth);
  assert.equal(r.writes[0][0], 'insert');
  assert.equal(r.writes[0][1].role, 'member');
  assert.equal(r.writes[0][1].is_approved, true);
  assert.equal('balance' in r.writes[0][1], false);
});

const overview = { deferredOrders: 4, cashOrders: 1, pendingCharges: 0, cashCharges: 1, subscriptionPayments: 0, reimbursements: 2, users: 0, requests: 0, legacy: 0, activeSubscriptions: 1, inventory: [{ stock: 0, stock_alert_threshold: 3, is_available: true }], deferredUsers: [{ id: 'user', name: 'Member', deferred_balance: 900 }], pendingCashOrders: [], pendingSubscriptions: [], botIntroUsers: [] };
test('sidebar and dashboard share one overview call per render; independent renders reload balances', async () => {
  let calls = 0;
  const db = { rpc: async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 20)); return { data: overview, error: null }; } };
  const mocks = { '@/lib/supabase/server': { createAdminClient: () => db } };
  const module = load('lib/admin-queries.ts', mocks);
  const [a, b] = await Promise.all([module.getAdminOverview(), module.getAdminOverview()]);
  assert.equal(a, b); assert.equal(calls, 1);
  assert.equal(a.notifications.transactions, 6);
  assert.equal(a.collections[0].totalAmount, 900); // Includes legacy/cash-charge debt; never reconstructed from four orders.
  await load('lib/admin-queries.ts', mocks).getAdminOverview();
  assert.equal(calls, 2);
});
test('overview transport errors are not shown as empty or mistaken for a missing migration', async () => {
  const failure = { code: '08006', message: 'unavailable' };
  const db = { rpc: async () => ({ error: failure }), from() { throw new Error('should not fallback on a network error'); } };
  const { AdminReadRepository } = load('lib/admin-queries.ts', { '@/lib/supabase/server': {} });
  await assert.rejects(() => new AdminReadRepository(db, null).readOverview(), (error) => error.code === failure.code);
});

test('server page authorization redirects an unverified session before reading management data', async () => {
  const { requireAdminPage } = load('lib/admin-page-session.ts', {
    '@/lib/admin-session': { requireAdminSession: async () => ({ user: null }) },
    'next/navigation': { redirect: (location) => { throw new Error(`redirect:${location}`); } },
  });
  await assert.rejects(() => requireAdminPage(), /redirect:\/admin\/login/);
});

test('product PUT sends only metadata and detects concurrent edits without overwriting stock', async () => {
  const writes = [], filters = [];
  const query = { update(value) { writes.push(value); return query; }, eq(...args) { filters.push(args); return query; }, select() { return query; }, maybeSingle: async () => ({ data: null, error: null }) };
  const { PUT } = load('app/api/items/[id]/route.ts', {
    '@/lib/admin-session': { requireAdminSession: async () => ({ user: { id: 'admin' } }) },
    '@/lib/supabase/server': { createAdminClient: () => ({ from: () => query }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    'next/cache': { revalidatePath() { throw new Error('conflict must not invalidate'); } },
  });
  const result = await PUT({ json: async () => ({ name: 'Tea', stock: 99, expected_updated_at: '2026-10-15T00:00:00Z' }) }, { params: { id: 'item' } });
  assert.equal(result.status, 409);
  assert.equal('stock' in writes[0], false);
  assert.deepEqual(plain(filters), [['id', 'item'], ['updated_at', '2026-10-15T00:00:00Z']]);
});

test('middleware leaves public Slack/cron endpoints alone and rejects forged management access', async () => {
  let authReads = 0;
  let proof;
  const mod = load('middleware.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => { authReads++; return { data: { user: { id: 'member' } } }; } } }) },
    'next/server': { NextResponse: { next: () => ({ next: true, cookies: { set() {} } }), json: (body, options) => ({ body, status: options.status }), redirect: () => ({ redirect: true }) } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public', ADMIN_PASSWORD: 'test-only' } } });
  const request = (pathname, method = 'POST') => ({ method, headers: new Headers(), nextUrl: { pathname, search: '' }, cookies: { get: (name) => ({ value: name === 'limu_admin_proof' ? proof : String(Date.now() + 1000000) }) } });
  assert.equal((await mod.middleware(request('/api/slack/interactions'))).next, true);
  assert.equal((await mod.middleware(request('/api/cron/check-prices'))).next, true);
  assert.equal(authReads, 0);
  assert.equal((await mod.middleware(request('/api/admin/stock'))).status, 403);
  const { createAdminProof } = load('lib/admin-proof.ts');
  proof = await createAdminProof('member', Date.now() + 1000000, 'test-only');
  assert.equal((await mod.middleware(request('/api/items/item', 'PUT'))).next, true);
});

test('product selection exposes contextual actions; a failed save keeps the draft and submits once', async () => {
  let cursor = 0, calls = 0, sent;
  const hooks = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect() {}, useMemo: (fn) => fn(),
  };
  const jsx = (type, props) => ({ type, props });
  const component = load('app/admin/items/ItemsClient.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ refresh() { throw new Error('failed save must not refresh'); } }) },
    'react-hot-toast': { default: { error() {}, success() {} } },
  }, { fetch: async (_, options) => { calls++; sent = JSON.parse(options.body); return { ok: false, json: async () => ({ error: 'conflict' }) }; }, confirm: () => true }).default;
  const props = { items: [{ id: 'item', name: 'Tea', price: 130, stock: 7, stock_alert_threshold: 3, is_available: true, is_unlimited_stock: false, updated_at: '2026-10-15T00:00:00Z' }], categories: [] };
  const render = () => { cursor = 0; return component(props); };
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const button = (label) => nodes(render()).find((node) => node.type === 'button' && node.props.children === label);
  button('Tea').props.onClick();
  assert.ok(nodes(render()).some((node) => node.props?.['aria-label'] === '選択した商品'));
  nodes(render()).find((node) => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('商品情報を編集')).props.onClick();
  nodes(render()).find((node) => node.type === 'input' && node.props.value === 'Tea').props.onChange({ target: { value: 'Edited tea' } });
  const first = button('更新する').props.onClick();
  await button('保存中...').props.onClick(); await first;
  assert.equal(calls, 1); assert.equal(sent.name, 'Edited tea'); assert.equal('stock' in sent, false);
  assert.equal(sent.expected_updated_at, props.items[0].updated_at);
  assert.ok(button('更新する'));
  assert.ok(nodes(render()).some((node) => node.type === 'input' && node.props.value === 'Edited tea'));
});

test('navigation uses a server balance without repeating browser auth or profile queries', () => {
  let clients = 0;
  const jsx = (type, props) => ({ type, props });
  const Navbar = load('components/layout/Navbar.tsx', {
    react: { useState: (value) => [value, () => {}], useEffect: (fn) => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'link' },
    'next/navigation': { useRouter: () => ({}), usePathname: () => '/' },
    'lucide-react': {}, '@/lib/store/cart': { useCartStore: (fn) => fn({ count: () => 0, hasHydrated: true }) },
    '@/components/user/UserLocaleProvider': { useUserLocale: () => ({ locale: 'ja', toggleLocale() {} }) },
    '@/lib/supabase/client': { createClient() { clients++; throw new Error('redundant browser fetch'); } },
  }).default;
  Navbar({ initialUser: { id: 'member', name: 'Member', balance: 1250 } });
  assert.equal(clients, 0);
});
