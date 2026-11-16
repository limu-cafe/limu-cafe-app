// Checkout screen rules that do not need a browser: which payment timing is used,
// how the deferred allowance is read, and what the page no longer offers.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = process.env.LIMU_TEST_ROOT || path.resolve(__dirname, '../..');
const user = '50000000-0000-4000-8000-000000000001';
const plain = (value) => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}) {
  const modules = new Map();
  function compile(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireLocal = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return compile(path.join(root, name.slice(2)) + '.ts');
      throw new Error(name);
    };
    vm.runInNewContext(source, { module, exports: module.exports, require: requireLocal, URL, crypto: require('node:crypto').webcrypto, console: { error() {} } });
    return module.exports;
  }
  return compile(path.join(root, file));
}

test('a chosen payment timing survives every change of the amount left after points', () => {
  const { resolvePaymentTiming } = load('lib/checkout.ts');
  const at = (chosen, due, balance = 1000, deferredRemaining = 10000) => resolvePaymentTiming({ chosen, due, balance, deferredRemaining }).timing;
  // Before any choice: balance when it is enough, otherwise pay later.
  assert.equal(at(null, 260), 'balance');
  assert.equal(at(null, 1260), 'deferred');
  // The reported bug: pay later was chosen, then the number of points changed.
  for (const due of [260, 259, 200, 1, 999, 1000]) assert.equal(at('deferred', due), 'deferred', `due ${due}`);
  // Points cover everything for a moment while typing; the choice comes back afterwards.
  assert.equal(at('deferred', 0), 'balance');
  assert.equal(at('deferred', 100), 'deferred');
  // A balance choice is set aside only while the balance is short, and comes back too.
  assert.equal(at('balance', 260), 'balance');
  assert.equal(at('balance', 1260), 'deferred');
  assert.equal(at('balance', 1000), 'balance');
});

test('pay later is unavailable above the allowance and ordering stops when nothing can pay', () => {
  const { resolvePaymentTiming } = load('lib/checkout.ts');
  const resolve = (chosen, due, balance, deferredRemaining) => plain(resolvePaymentTiming({ chosen, due, balance, deferredRemaining }));
  // Exactly the allowance is fine; one yen more is not.
  assert.deepEqual(resolve('deferred', 260, 0, 260), { timing: 'deferred', balanceAvailable: false, deferredAvailable: true, canOrder: true });
  assert.deepEqual(resolve('deferred', 261, 0, 260), { timing: 'deferred', balanceAvailable: false, deferredAvailable: false, canOrder: false });
  // Over the allowance with enough balance: the balance is used instead.
  assert.deepEqual(resolve('deferred', 261, 1000, 260), { timing: 'balance', balanceAvailable: true, deferredAvailable: false, canOrder: true });
  assert.deepEqual(resolve(null, 261, 0, 0), { timing: 'deferred', balanceAvailable: false, deferredAvailable: false, canOrder: false });
  // Unknown allowance (lookup failed or still loading): the server decides.
  assert.deepEqual(resolve('deferred', 99999, 0, null), { timing: 'deferred', balanceAvailable: false, deferredAvailable: true, canOrder: true });
  // Points-only orders never depend on balance or allowance.
  assert.deepEqual(resolve('deferred', 0, 0, 0), { timing: 'balance', balanceAvailable: true, deferredAvailable: false, canOrder: true });
});

test('allowance helpers accept only whole yen and never report a negative allowance', () => {
  const { deferredAllowance, parseDeferredLimitDetail } = load('lib/deferred-limit.ts');
  assert.deepEqual(plain(deferredAllowance(10000, 9000)), { limit: 10000, deferred_balance: 9000, remaining: 1000 });
  assert.deepEqual(plain(deferredAllowance(10000, 10000)), { limit: 10000, deferred_balance: 10000, remaining: 0 });
  assert.deepEqual(plain(deferredAllowance(10000, 12000)), { limit: 10000, deferred_balance: 12000, remaining: 0 });
  for (const [limit, balance] of [[null, 0], ['10000', 0], [10000, undefined], [10000, 1.5], [-1, 0], [NaN, 0]]) assert.equal(deferredAllowance(limit, balance), null);
  assert.deepEqual(plain(parseDeferredLimitDetail('{"limit":10000,"current":9000,"requested":1500,"remaining":1000}')), { limit: 10000, remaining: 1000 });
  for (const bad of [undefined, null, '', 'not json', '{}', '{"limit":"10000","remaining":1}', '{"limit":10000,"remaining":-1}', 'null', { limit: 1, remaining: 1 }]) assert.equal(parseDeferredLimitDetail(bad), null);
});

function allowanceRoute(options = {}) {
  const calls = [];
  const db = {
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return options.limit ?? { data: 10000, error: null }; },
    from: (table) => ({ select: (columns) => ({ eq: (column, value) => ({ single: async () => { calls.push({ table, columns, column, value }); return options.profile ?? { data: { deferred_balance: 9000 }, error: null }; } }) }) }),
  };
  const route = load('app/api/deferred-limit/route.ts', {
    '@/lib/member-session': { requireMemberSession: async () => options.signedOut ? { user: null, status: 401, error: 'Unauthorized' } : { user: { id: user }, status: 200, error: null } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers }) } },
    '@/lib/supabase/server': { createAdminClient: () => db },
  });
  return { ...route, calls };
}

test('the allowance endpoint reports the signed-in member only and is never cached', async () => {
  const f = allowanceRoute(); const r = await f.GET();
  assert.equal(r.status, 200);
  assert.deepEqual(plain(r.body), { limit: 10000, deferred_balance: 9000, remaining: 1000 });
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.deepEqual(plain(f.calls.find((c) => c.table)), { table: 'users', columns: 'deferred_balance', column: 'id', value: user });
  assert.equal(f.calls.find((c) => c.rpc).rpc, 'deferred_balance_limit');
  const over = await allowanceRoute({ profile: { data: { deferred_balance: 12000 }, error: null } }).GET();
  assert.equal(over.body.remaining, 0);
});

test('the allowance endpoint needs a member session and hides database errors', async () => {
  const denied = allowanceRoute({ signedOut: true }); assert.equal((await denied.GET()).status, 401); assert.equal(denied.calls.length, 0);
  for (const options of [{ limit: { data: null, error: { code: 'PGRST202', message: 'secret detail' } } }, { profile: { data: null, error: { code: 'PGRST116', message: 'secret detail' } } }, { limit: { data: 'ten thousand', error: null } }]) {
    const r = await allowanceRoute(options).GET();
    assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(r.body), /secret/);
  }
});

test('the checkout page no longer offers a card option or resets the timing in an effect', () => {
  const source = fs.readFileSync(path.join(root, 'app/checkout/page.tsx'), 'utf8');
  assert.doesNotMatch(source, /stripe|クレカ|deferredOptions/i);
  assert.doesNotMatch(source, /setPaymentTiming/);
  assert.match(source, /resolvePaymentTiming\(/);
  assert.match(source, /setChosenTiming\(id\)/);
  assert.match(source, /deferred_settlement_method:\s*paymentMethod === 'deferred' \? deferredSettlementMethod : null/);
  assert.match(source, /const deferredSettlementMethod = 'cash' as const/);
  // Both languages explain the limit and what is left.
  assert.match(source, /pay-later limit of \$\{yen\(limit\)\}/);
  assert.match(source, /後払いの上限（\$\{yen\(limit\)\}）を超えるため注文できません/);
  assert.match(source, /err\.code === 'deferred_limit_exceeded'/);
});
