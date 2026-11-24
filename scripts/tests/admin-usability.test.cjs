const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const jsx = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children), ...nodes(n.props?.collection), ...nodes(n.props?.detail)];
function load(file, mocks, globals = {}) {
  const modules = new Map();
  function compile(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const m = { exports: {} }; modules.set(file, m);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireLocal = n => {
      if (n in mocks) return mocks[n];
      const p = n.startsWith('@/') ? path.join(root, n.slice(2)) : path.resolve(path.dirname(file), n);
      return compile(p + (fs.existsSync(p + '.ts') ? '.ts' : '.tsx'));
    };
    vm.runInNewContext(source, { module: m, exports: m.exports, require: requireLocal, URL, URLSearchParams,crypto:require('node:crypto').webcrypto, Intl, console, ...globals });
    return m.exports;
  }
  return compile(path.join(root, file));
}
function screen(file, props, query = '') {
  let cursor = 0; const hooks = [], writes = [];
  const location = { href: 'http://localhost/admin/items' + query };
  const react = {
    useState(value) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof value === 'function' ? value() : value; return [hooks[i], v => hooks[i] = typeof v === 'function' ? v(hooks[i]) : v]; },
    useRef(value) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: value }; return hooks[i]; },
    useEffect() {}, useMemo: fn => fn(),
  };
  const Component = load(file, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {}, 'next/link': { default: 'link' },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URL(location.href).searchParams },
    'react-hot-toast': { default: {} },
  }, { window: { location, history: { pushState(_s, _t, url) { location.href = String(url); }, replaceState(_s, _t, url) { location.href = String(url); } } }, fetch: () => { writes.push('fetch'); throw Error('Navigation must not mutate or reload data'); } }).default;
  const all = () => { cursor = 0; return nodes(Component(props)); };
  const button = label => { const node = all().find(n => n.type === 'button' && n.props['aria-label'] === label); assert.ok(node, label); return node; };
  return { all, button, location, writes, setQuery(q) { location.href = 'http://localhost/admin/items' + q; } };
}
const item = { id: 'tea', name: '緑茶', stock: 8, price: 130, is_available: true, is_unlimited_stock: false, stock_alert_threshold: 3, updated_at: '2026-11-19' };

test('a product purchase shortcut skips the stock detail and preserves the collection return URL', () => {
  const product={...item,id:'00000000-0000-4000-8000-000000000010'};
  const h=screen('app/admin/items/ItemsClient.tsx',{items:[product,{...item,id:'coffee',name:'コーヒー',is_unlimited_stock:true}],categories:[]},'?q=緑茶&state=visible');
  const link=h.all().find(n=>n.props?.['aria-label']==='緑茶の入荷を記録');
  const q=new URL(link.props.href,'http://localhost').searchParams;
  assert.equal(q.get('record'),'purchase');assert.equal(q.get('item'),product.id);
  assert.equal(q.get('returnTo'),'/admin/items?q=%E7%B7%91%E8%8C%B6&state=visible');
  assert.equal(h.all().some(n=>n.props?.['aria-label']==='コーヒーの入荷を記録'),false);
  h.button('緑茶の在庫・入荷履歴').props.onClick();
  assert.equal(new URL(h.location.href).searchParams.get('view'),'stock');
  assert.ok(h.all().some(n=>n.props?.item?.id===product.id));
  assert.deepEqual(h.writes,[]);
});

test('balances, points and pending collections lead directly to the same person; legacy approval filters can be cleared', () => {
  const user = { id: 'user-a', name: '利用者A', balance: 1200, points_balance: 50, is_active: true, is_approved: true };
  const h = screen('app/admin/users/UsersClient.tsx', { users: [user], cashCollectionsByUserId: { 'user-a': { totalAmount: 260 } } }, '?q=利用者A');
  h.button('利用者Aの残高・チャージ').props.onClick();
  assert.equal(new URL(h.location.href).searchParams.get('user'), 'user-a');
  assert.equal(new URL(h.location.href).searchParams.get('view'), 'charges');
  assert.equal(new URL(h.location.href).searchParams.get('q'), '利用者A');
  h.setQuery(''); h.button('利用者Aのポイント').props.onClick();
  assert.equal(new URL(h.location.href).searchParams.get('view'), 'points');
  h.setQuery('');
  assert.equal(h.all().find(n => n.props?.['aria-label'] === '利用者Aの未精算取引').props.href, '/admin/transactions?user=user-a&state=pending');
  h.setQuery('?pending=1');
  h.all().find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children[0] === 'すべて').props.onClick();
  assert.equal(new URL(h.location.href).searchParams.has('pending'), false);
  assert.deepEqual(h.writes, []);
});

test('exact pending counts avoid empty-page round trips without hiding rows under a smaller server cap', async () => {
  const { fetchRecentAndPendingRows } = load('lib/transaction-history.ts', {});
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i), created_at: '2026-11-19' }));
  let calls = 0;
  const result = await fetchRecentAndPendingRows({ recent: Promise.resolve({ data: [], error: null }), pending: [async from => { calls++; return { data: rows.slice(from, from + 2), error: null, count: 5 }; }] });
  assert.equal(calls, 3); assert.equal(result.length, 5);
  calls = 0;
  await fetchRecentAndPendingRows({ recent: Promise.resolve({ data: [], error: null }), pending: [async from => { calls++; return { data: rows.slice(from), error: null, count: rows.length }; }] });
  assert.equal(calls, 1);
});

test('the product page reuses the authenticated profile for the navbar, with one profile check and no second sync', async () => {
  let profileReads = 0, authReads = 0;
  const user = { id: 'fixture-user', user_metadata: { name: '架空会員' } };
  const query = { select() { return query; }, eq() { return query; }, order() { return query; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
  const mocks = {
    react: { cache(fn) { let value; return () => value ??= fn(); }, Suspense: 'suspense' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { redirect: url => { throw Error('redirect:' + url); } },
    'next/cache': { unstable_noStore() {} },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => { authReads++; return { data: { user } }; } } }), createAdminClient: () => ({ from: () => query }) },
    '@/lib/slack-identity': { verifiedSlackIdentity: () => ({}) },
    '@/lib/supabase/sync-user': { syncUserProfile: async () => { profileReads++; return { is_active: true, is_approved: true, balance: 1200 }; } },
    '@/components/layout/UserLayout': { default: 'user-layout' },
    '@/components/user/DeferredDataPlaceholder': { default: 'placeholder' },
    './ItemListClient': { default: 'item-list' },
    '@/lib/item-order-server': { loadItemDisplayOrder: async () => ({ itemIds: [] }) },
    '@/lib/item-order': { sortItemsByDisplayOrder: items => items },
  };
  const page = await load('app/page.tsx', mocks).default();
  assert.equal(page.props.initialUser.balance, 1200);
  const content = nodes(page).find(n => typeof n.type === 'function');
  await content.type(content.props);
  assert.equal(profileReads, 1); assert.equal(authReads, 1);
});
