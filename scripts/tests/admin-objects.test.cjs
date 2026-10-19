const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const itemId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const cache = new Map();
  function compile(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireLocal = (name) => {
      if (name in mocks) return mocks[name];
      const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return compile(target + (fs.existsSync(target + '.ts') ? '.ts' : '.tsx'));
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: requireLocal, URL, URLSearchParams, AbortController, Intl, console, ...globals }, { filename });
    return module.exports;
  }
  return compile(path.join(root, file));
}
function database(tables, error = null) {
  const calls = [];
  const db = { from(table) {
    const filters = []; let from = 0, to = Infinity, fields;
    const query = {
      select(value) { fields = value; return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      order() { return query; }, range(a, b) { from = a; to = b; return query; },
      maybeSingle() { return query.then((r) => ({ ...r, data: r.data?.[0] ?? null })); },
      then(resolve, reject) {
        calls.push({ table, fields, filters, from, to });
        return Promise.resolve({ error, data: error ? null : (tables[table] ?? []).filter((r) => filters.every(([k,v]) => r[k] === v)).slice(from, to + 1) }).then(resolve, reject);
      },
      insert() { throw new Error('read must never insert'); }, update() { throw new Error('read must never update'); }, delete() { throw new Error('read must never delete'); },
    }; return query;
  } };
  return { db, calls };
}

test('object history is read-only, scoped before pagination, and remains reachable beyond the first 20 rows', async () => {
  const source = Array.from({ length: 46 }, (_, i) => ({ id: i, item_id: itemId, change_amount: -1 }));
  const r = database({ stock_history: [...source, { id: 'other', item_id: userId }] });
  const before = JSON.stringify(source);
  const { AdminObjectReadRepository } = load('lib/admin-object-queries.ts');
  const repo = new AdminObjectReadRepository(r.db);
  const first = await repo.read('items', itemId, 'stock');
  const last = await repo.read('items', itemId, 'stock', 3);
  assert.equal(first.rows.length, 20); assert.equal(first.hasNextPage, true);
  assert.equal(last.rows.length, 6); assert.equal(last.hasNextPage, false);
  assert.deepEqual(plain(r.calls[1].filters), [['item_id', itemId]]);
  assert.equal(r.calls[1].from, 40); assert.equal(r.calls[1].to, 60);
  assert.equal(JSON.stringify(source), before);
});

test('every user relation is limited to that user; an unavailable query is not an empty history', async () => {
  const { AdminObjectReadRepository } = load('lib/admin-object-queries.ts');
  const r = database({}); const repo = new AdminObjectReadRepository(r.db);
  for (const relation of ['orders', 'charges', 'points', 'subscriptions']) await repo.read('users', userId, relation);
  assert.ok(r.calls.every((c) => c.filters.length === 1 && c.filters[0][0] === 'user_id' && c.filters[0][1] === userId && c.to === 20));
  const failure = { message: 'connection failed', code: '08006' };
  await assert.rejects(() => new AdminObjectReadRepository(database({}, failure).db).read('items', itemId, 'orders'), (e) => e === failure);
  assert.equal(r.calls.length, 4);
  await assert.rejects(() => repo.read('items', itemId, 'points'));
  await assert.rejects(() => repo.read('users', userId, 'orders', -1));
  assert.equal(r.calls.length, 4);
});

test('order detail fetches its exact ID independently of recent/pending lists and keeps historical prices', async () => {
  const row = { id: orderId, user_id: userId, total_amount: 100, order_items: [{ item_id: itemId, item_name: '以前の商品名', item_price: 100, quantity: 1, subtotal: 100 }] };
  const r = database({ orders: [row] });
  const { AdminObjectReadRepository } = load('lib/admin-object-queries.ts');
  const repo = new AdminObjectReadRepository(r.db);
  assert.deepEqual(plain(await repo.order(orderId)), row);
  assert.equal(await repo.order(itemId), null);
  assert.equal(await repo.order('bad-id'), null);
  assert.equal(r.calls.length, 2);
  assert.ok(r.calls[0].fields.includes('item_price'));
});

test('order action destinations preserve the existing payment/status policy, including individual versus aggregate settlements', () => {
  const { orderActions, orderStateLabel } = load('lib/admin-objects.ts');
  const base = { id: orderId, user_id: userId, total_amount: 130, created_at: '2026-10-16', payment_method: 'balance', payment_status: 'completed' };
  const cases = [
    [{ payment_method: 'cash', payment_status: 'pending' }, ['cash-settlement:POST', 'refund:POST']],
    [{ payment_method: 'cash' }, ['cash-settlement:DELETE', 'refund:POST']],
    [{ payment_method: 'deferred' }, ['deferred-settlement:POST', 'refund:POST', 'cancel:POST']],
    [{ payment_method: 'deferred', settled_at: '2026-10-16', settlement_source: 'individual_deferred_order' }, ['deferred-settlement:DELETE', 'refund:POST', 'cancel:POST']],
    [{ payment_method: 'deferred', settled_at: '2026-10-16', settlement_source: 'deferred_settlement' }, ['refund:POST', 'cancel:POST']],
    [{ payment_method: 'deferred', deferred_settlement_method: 'stripe' }, ['refund:POST', 'cancel:POST']],
    [{}, ['refund:POST', 'cancel:POST']],
    [{ payment_status: 'cancelled' }, []], [{ payment_status: 'refunded' }, []],
  ];
  for (const [patch, expected] of cases) {
    const actions = orderActions({ ...base, ...patch });
    assert.deepEqual(plain(actions.map((a) => `${a.endpoint.split('/').pop()}:${a.method}`)), expected);
    assert.ok(actions.every((a) => a.endpoint.startsWith(`/api/admin/orders/${orderId}/`)));
  }
  assert.equal(orderStateLabel({ ...base, payment_method: 'deferred' }), '未精算');
  assert.equal(orderStateLabel({ ...base, payment_method: 'deferred', settled_at: '2026-10-16' }), '精算済み');
});

test('related-record API rejects unverified sessions and malformed scopes before constructing the admin client', async () => {
  let reads = 0;
  const mocks = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/admin-session': { requireAdminSession: async () => ({ user: null, error: 'login', status: 403 }) },
    '@/lib/supabase/server': { createAdminClient() { reads++; throw new Error('must not reach database'); } },
  };
  const file = 'app/api/admin/objects/[kind]/[id]/route.ts';
  const request = { url: 'http://localhost/api/admin/objects/users/' + userId + '?view=orders' };
  assert.equal((await load(file, mocks).GET(request, { params: { kind: 'users', id: userId } })).status, 403);
  mocks['@/lib/admin-session'] = { requireAdminSession: async () => ({ user: { id: 'admin' } }) };
  const { GET } = load(file, mocks);
  for (const [kind, id, query] of [['constructor', userId, 'view=orders'], ['users', 'bad', 'view=orders'], ['items', itemId, 'view=points'], ['users', userId, 'view=orders&page=10001']]) {
    assert.equal((await GET({ url: `http://localhost/?${query}` }, { params: { kind, id } })).status, 400);
  }
  assert.equal(reads, 0);
});

test('related-record API returns private no-store results and a visible failure instead of false success', async () => {
  const r = database({ orders: [{ id: orderId, user_id: userId }] });
  const mocks = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/admin-session': { requireAdminSession: async () => ({ user: { id: 'admin' } }) },
    '@/lib/supabase/server': { createAdminClient: () => r.db },
  };
  const args = [{ url: 'http://localhost/?view=orders' }, { params: { kind: 'users', id: userId } }];
  const file = 'app/api/admin/objects/[kind]/[id]/route.ts';
  const response = await load(file, mocks).GET(...args);
  assert.equal(response.status, 200); assert.equal(response.body.rows[0].id, orderId);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  mocks['@/lib/supabase/server'] = { createAdminClient: () => database({}, { message: 'private failure' }).db };
  const failed = await load(file, mocks).GET(...args);
  assert.equal(failed.status, 503); assert.equal(JSON.stringify(failed).includes('private failure'), false);
});

test('order detail degrades only missing optional columns; transport failure is never shown as a missing order', async () => {
  const fields = [];
  const db = { from() { let selected; const query = { select(value) { selected = value; fields.push(value); return query; }, eq() { return query; }, async maybeSingle() {
    if (selected.includes('settled_at')) return { error: { code: '42703', message: 'column orders.settled_at does not exist' } };
    return { data: { id: orderId, points_used: 50 }, error: null };
  } }; return query; } };
  const { AdminObjectReadRepository } = load('lib/admin-object-queries.ts');
  const result = await new AdminObjectReadRepository(db).order(orderId);
  assert.equal(result.points_used, 50); assert.equal(fields.length, 2);
  assert.equal(fields[1].includes('points_used'), true);
  const error = { code: '08006', message: 'network unavailable' };
  await assert.rejects(() => new AdminObjectReadRepository(database({}, error).db).order(orderId), (e) => e === error);
});

test('switching the selected object cannot display a slower response belonging to the previous object', async () => {
  const hooks = [], effects = []; let cursor = 0, scheduled = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }]; },
    useEffect(fn, deps) { const i = cursor++; const previous = effects[i]; if (!previous || JSON.stringify(previous.deps) !== JSON.stringify(deps)) scheduled.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const requests = [];
  const jsx = (type, props) => ({ type, props });
  const Related = load('components/admin/ObjectRelatedRecords.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'link' } }, {
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
  }).default;
  function render(id) { cursor = 0; const tree = Related({ kind: 'items', id }); const pending = scheduled; scheduled = []; pending.forEach((fn) => fn()); return tree; }
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  render(itemId); render(userId);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve({ ok: true, json: async () => ({ rows: [{ id: 'current' }], page: 1, hasNextPage: false }) });
  await new Promise(setImmediate);
  requests[0].resolve({ ok: true, json: async () => ({ rows: [{ id: 'stale' }], page: 1, hasNextPage: false }) });
  await new Promise(setImmediate);
  const records = nodes(render(userId)).filter((node) => node.props?.row).map((node) => node.props.row.id);
  assert.deepEqual(records, ['current']);
});

test('order details submit the selected order once; failure retains an actionable screen and never reports success', async () => {
  let cursor = 0, calls = 0, successes = 0, refreshes = 0; const hooks = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
  };
  const jsx = (type, props) => ({ type, props });
  const Detail = load('app/admin/orders/[id]/OrderDetailClient.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'link' },
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    'react-hot-toast': { default: { success() { successes++; }, error() {} } },
  }, { confirm: () => true, fetch: async (url, options) => { calls++; assert.equal(url, `/api/admin/orders/${orderId}/deferred-settlement`); assert.equal(options.method, 'POST'); return { ok: false, json: async () => ({ error: 'conflict' }) }; } }).default;
  const props = { order: { id: orderId, user_id: userId, total_amount: 130, payment_method: 'deferred', payment_status: 'completed', created_at: '2026-10-16' }, returnTo: '/admin/transactions' };
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const render = () => { cursor = 0; return Detail(props); };
  const button = nodes(render()).find((node) => node.type === 'button' && node.props.children === '精算完了');
  const first = button.props.onClick(); await button.props.onClick(); await first;
  assert.equal(calls, 1); assert.equal(successes, 0); assert.equal(refreshes, 0);
  assert.ok(nodes(render()).find((node) => node.type === 'button' && node.props.children === '精算完了' && !node.props.disabled));
});

test('point adjustment reviews the selected person before sending; duplicate confirmation and failure cannot apply twice or report success', async () => {
  let cursor=0, calls=0, refreshes=0, successes=0, errors=0, ok=false;
  const hooks=[],jsx=(type,props)=>({type,props});
  const react={
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];}
  };
  const Adjust=load('components/admin/UserPointAdjustment.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})},
    'react-hot-toast':{default:{success(){successes++;},error(){errors++;}}}
  },{fetch:async(url,options)=>{calls++;assert.equal(url,'/api/admin/points/manual');assert.deepEqual(JSON.parse(options.body),{user_id:userId,delta:-10,note:'訂正理由'});return{ok,json:async()=>ok?{}:{error:'conflict'}};}}).default;
  const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
  const render=()=>{cursor=0;return Adjust({user:{id:userId,name:'Member',points_balance:50}});};
  let tree=render();
  nodes(tree).find(n=>n.type==='input'&&n.props.type==='number').props.onChange({target:{value:'-10'}});
  nodes(tree).find(n=>n.type==='input'&&!n.props.type).props.onChange({target:{value:'訂正理由'}});
  tree=render();tree.props.onSubmit({preventDefault(){}});
  assert.equal(calls,0);
  tree=render();let submit=nodes(tree).find(n=>n.type==='button'&&n.props.children==='この内容で反映');
  submit.props.onClick();submit.props.onClick();await new Promise(setImmediate);
  assert.equal(calls,1);assert.equal(successes,0);assert.equal(refreshes,0);assert.equal(errors,1);
  submit=nodes(render()).find(n=>n.type==='button'&&n.props.children==='この内容で反映');
  assert.equal(submit.props.disabled,false);
  ok=true;submit.props.onClick();await new Promise(setImmediate);
  assert.equal(calls,2);assert.equal(successes,1);assert.equal(refreshes,1);
  assert.ok(nodes(render()).some(n=>n.type==='input'&&n.props.value===''));
});
