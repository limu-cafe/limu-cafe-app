const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');

function row(id, position, extra = {}) {
  return {
    id,
    created_at: new Date(Date.UTC(2026, 9, 14) - position * 86400000).toISOString(),
    ...extra,
  };
}

// Read-only query double: execute the real pages against a large transaction history.
function database(tables, options = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      let fields = '';
      let head = false;
      const filters = [];
      const ordering = [];
      let start = 0;
      let end = Infinity;
      const query = {
        select(value, settings = {}) { fields = value; head = Boolean(settings.head); return query; },
        order(column, settings = {}) { ordering.push([column, settings.ascending !== false]); return query; },
        eq(column, value) { filters.push((item) => item[column] === value); return query; },
        gt(column, value) { filters.push((item) => item[column] > value); return query; },
        is(column, value) { filters.push((item) => (item[column] ?? null) === value); return query; },
        not(column, operator, value) { filters.push((item) => (item[column] ?? null) !== value); return query; },
        in(column, values) { filters.push((item) => values.includes(item[column])); return query; },
        or(expression) {
          assert.equal(expression, 'deferred_settlement_method.is.null,deferred_settlement_method.eq.cash');
          filters.push((item) => item.deferred_settlement_method == null || item.deferred_settlement_method === 'cash');
          return query;
        },
        limit(value) { end = value - 1; return query; },
        range(from, to) { start = from; end = to; return query; },
        then(resolve, reject) {
          calls.push({ table, fields, head, start, end });
          if (options.failPending && !head && end - start === 199) {
            return Promise.resolve({ data: null, error: { message: 'database unavailable' } }).then(resolve, reject);
          }
          if (options.missingSettlementColumns && table === 'orders' && fields.includes('settled_at')) {
            return Promise.resolve({ data: null, error: { message: 'column orders.settled_at does not exist', code: '42703' } }).then(resolve, reject);
          }
          const matches = (tables[table] ?? []).filter((item) => filters.every((filter) => filter(item)));
          matches.sort((left, right) => {
            for (const [column, ascending] of ordering) {
              const comparison = String(left[column]).localeCompare(String(right[column]));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          const data = matches.slice(start, Math.min(end + 1, start + (options.rowCap ?? 1000)));
          return Promise.resolve({ data: head ? null : data, count: matches.length, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function load(relativePath, db) {
  const cache = new Map();
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    '@/lib/supabase/server': { createAdminClient: () => db },
    '@/lib/item-stock': { countLowStockItems: async () => 3 },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'link' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
  };

  function compile(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.endsWith('TransactionsClient')) return { default: 'TransactionsClient' };
      if (name.endsWith('BotIntroBroadcastCard')) return { default: 'BotIntroBroadcastCard' };
      if (name.endsWith('AdminAuthGuard')) return { default: 'AdminAuthGuard' };
      if (name.endsWith('AdminSidebar')) return { default: 'AdminSidebar' };
      const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return compile(target + '.ts');
    };
    vm.runInNewContext(source, { exports: module.exports, module, require: localRequire, process: { env: {} } }, { filename });
    return module.exports;
  }
  return compile(path.join(root, relativePath));
}

function ordersFixture() {
  return Array.from({ length: 120 }, (_, index) => {
    const position = index + 1;
    return row(`order-${position}`, position, {
      user_id: 'user-1', total_amount: 130, payment_method: [24, 41, 90, 107].includes(position) ? 'deferred' : 'balance',
      payment_status: 'completed', deferred_settlement_method: 'cash', settled_at: null,
    });
  });
}

test('transactions page includes all four unsettled orders, including positions 90 and 107, exactly once', async () => {
  const db = database({ orders: ordersFixture() });
  const page = await load('app/admin/transactions/page.tsx', db).default();
  const pending = page.props.orders.filter((item) => item.payment_method === 'deferred' && !item.settled_at);
  assert.deepEqual(Array.from(pending, (item) => item.id), ['order-24', 'order-41', 'order-90', 'order-107']);
  assert.equal(pending.reduce((sum, item) => sum + item.total_amount, 0), 520);
  assert.equal(page.props.orders.length, 82);
  assert.equal(new Set(page.props.orders.map((item) => item.id)).size, 82);
});

test('old pending cash orders, charges and subscription payments remain actionable without reviving settled records', async () => {
  const orders = ordersFixture();
  orders.push(row('old-cash', 200, { payment_method: 'cash', payment_status: 'pending' }));
  orders.push(row('old-settled', 201, { payment_method: 'deferred', payment_status: 'completed', settled_at: '2026-10-01', deferred_settlement_method: 'cash' }));
  orders.push(row('old-card', 202, { payment_method: 'deferred', payment_status: 'completed', deferred_settlement_method: 'stripe', settled_at: null }));
  const charges = Array.from({ length: 90 }, (_, index) => row(`charge-${index}`, index, { method: 'cash', status: 'approved', settled_at: '2026-10-01' }));
  charges.push(row('old-charge', 200, { method: 'cash', status: 'approved', settled_at: null }));
  charges.push(row('old-approval', 201, { method: 'stripe', status: 'pending' }));
  const subscriptions = Array.from({ length: 90 }, (_, index) => row(`subscription-${index}`, index, { payment_status: 'completed' }));
  subscriptions.push(row('old-subscription', 200, { payment_status: 'pending_cash_settlement' }));
  const page = await load('app/admin/transactions/page.tsx', database({ orders, charge_requests: charges, subscription_payments: subscriptions })).default();
  assert.ok(page.props.orders.some((item) => item.id === 'old-cash'));
  assert.ok(!page.props.orders.some((item) => ['old-settled', 'old-card'].includes(item.id)));
  assert.ok(page.props.charges.some((item) => item.id === 'old-charge' && !item.is_cash_settled));
  assert.ok(page.props.charges.some((item) => item.id === 'old-approval'));
  assert.ok(page.props.subscriptionPayments.some((item) => item.id === 'old-subscription'));
});

test('pending pagination retrieves more than 1000 records even with a smaller server row cap', async () => {
  const orders = Array.from({ length: 1025 }, (_, index) => row(`pending-${index}`, index, { payment_method: 'deferred', payment_status: 'completed', deferred_settlement_method: null, settled_at: null }));
  const page = await load('app/admin/transactions/page.tsx', database({ orders }, { rowCap: 73 })).default();
  assert.equal(page.props.orders.length, 1025);
  assert.equal(new Set(page.props.orders.map((item) => item.id)).size, 1025);
});

test('a failed pending query raises an error rather than showing an incomplete collection list', async () => {
  const page = load('app/admin/transactions/page.tsx', database({ orders: ordersFixture() }, { failPending: true }));
  await assert.rejects(page.default(), (error) => error.message === 'database unavailable');
});

test('legacy schema fallback still retrieves old pending orders', async () => {
  const page = await load('app/admin/transactions/page.tsx', database({ orders: ordersFixture() }, { missingSettlementColumns: true })).default();
  assert.equal(page.props.orders.filter((item) => item.payment_method === 'deferred').length, 4);
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean) ?? null;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.props?.children);
}

test('dashboard renders four pending transactions and two reimbursements from the correct queries', async () => {
  const db = database({
    orders: ordersFixture(),
    purchase_runs: [{ id: 'purchase-1', reimbursement_status: 'pending_reimbursement' }, { id: 'purchase-2', reimbursement_status: 'pending_reimbursement' }],
  });
  const page = await load('app/admin/page.tsx', db).default();
  const transactions = find(page, (node) => node.props?.href === '/admin/transactions');
  const reimbursements = find(page, (node) => node.props?.href === '/admin/reimbursements');
  assert.equal(textContent(transactions), '取引履歴4');
  assert.equal(textContent(reimbursements), '立替管理2');
  const layout = await load('app/admin/layout.tsx', db).default({ children: null });
  const sidebar = find(layout, (node) => node.props?.notifications);
  assert.equal(sidebar.props.notifications.transactions, 4);
  assert.equal(sidebar.props.notifications.reimbursements, 2);
});
