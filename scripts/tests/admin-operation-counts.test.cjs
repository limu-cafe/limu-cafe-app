const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, text, flush } = require('./helpers/ui-fixture.cjs');
const uuid = i => `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const user = { id: uuid(1), name: '利用者A', balance: 1200, points_balance: 50, is_active: true, is_approved: true };
const byAria = (h, label) => {
  const node = h.all().find(n => n.props?.['aria-label'] === label);
  assert.ok(node, label); return node;
};

test('one balance shortcut opens the actual form, keeps search and isolates the next user without a write', async () => {
  const h = fixture('app/admin/users/UsersClient.tsx', { users: [user, {...user,id:uuid(2),name:'利用者B'}], cashCollectionsByUserId:{} }, '?q=利用者&state=active');
  byAria(h,'利用者Aの残高・チャージ').props.onClick(); await h.effects();
  const input = h.all().find(n => n.props?.id === 'user-balance-amount');
  assert.ok(input); assert.equal(input.props.autoFocus,true);
  input.props.onChange({target:{value:'300'}});
  byAria(h,'利用者Bの残高・チャージ').props.onClick(); await h.effects();
  assert.equal(h.all().find(n=>n.props?.id==='user-balance-amount').props.value,'');
  const related=h.all().find(n=>n.props?.kind==='users');
  assert.equal(related.props.id,uuid(2));
  assert.equal(new URLSearchParams(related.props.collectionQuery).get('q'),'利用者');
  assert.equal(new URLSearchParams(related.props.collectionQuery).get('state'),'active');
  byAria(h,'利用者Aのポイント').props.onClick(); await h.effects();
  assert.equal(h.all().find(n=>n.props?.user?.name==='利用者A').props.user.id,uuid(1));
  assert.equal(h.calls.length,0);
});

test('contract shortcut fetches only the chosen product, clears a stale contract and never writes on navigation', async () => {
  const product={id:uuid(3),name:'定額A',price:500,billing_interval_count:1,billing_interval_unit:'month',is_active:true};
  const h=fixture('app/admin/subscriptions/SubscriptionsAdminClient.tsx',{products:[product]},'?member=old');
  byAria(h,'定額Aの契約者を見る').props.onClick(); await h.effects();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].url,`/api/admin/subscriptions/${product.id}/members`);
  assert.equal(h.calls[0].method,'GET');
  assert.ok(h.all().some(n=>text(n).includes('契約者はいません')));
  const workspace=h.all().find(n=>n.props?.label==='サブスク商品の詳細');
  assert.equal(workspace.props.selected,true);
});

test('one request selection exposes the optional note and submits it only with the existing explicit decision', async () => {
  const request={id:uuid(4),item_name:'紙コップ',status:'pending',created_at:'2026-11-20'};
  const h=fixture('app/admin/requests/RequestsClient.tsx',{requests:[request]});
  const row=h.all().find(n=>n.type==='button'&&text(n).startsWith('紙コップ'));
  row.props.onClick(); h.change('紙コップへの管理者コメント','次回購入');
  assert.equal(h.calls.length,0); await h.all().find(n=>n.type==='button'&&text(n).trim()==='採用').props.onClick(); await flush();
  assert.deepEqual(h.calls,[{url:`/api/admin/requests/${request.id}`,method:'PUT',body:{status:'approved',admin_note:'次回購入'}}]);
});

test('handover acknowledgement is immediately available but any selection change invalidates it', async () => {
  const record=i=>({id:uuid(i),purchased_by:user.id,payment_source:'personal_advance',reimbursement_status:'pending_reimbursement',total_amount:100,note:`備品${i}`,created_at:'2026-11-20'});
  const h=fixture('components/admin/ReimbursementBatch.tsx',{person:{id:user.id,name:user.name,total:200,records:[record(10),record(11)]},onBusyChange(){},onRecorded(){}});
  assert.equal(h.button('¥200の精算を記録').props.disabled,true);
  h.change('合計額の現金を立替者に渡したことを確認',true);
  assert.equal(h.button('¥200の精算を記録').props.disabled,false);
  h.change('備品10 ¥100を精算対象にする',false);
  assert.equal(h.field('合計額の現金を立替者に渡したことを確認').props.checked,false);
  assert.equal(h.button('¥100の精算を記録').props.disabled,true);
  await h.click('¥100の精算を記録'); assert.equal(h.calls.length,0);
});

test('all-order shortcut opens review once, excludes other users and paid rows, and does not bypass payment confirmation', async () => {
  const order=(id,extra={})=>({id:uuid(id),user_id:user.id,total_amount:130,points_used:30,payment_method:'deferred',payment_status:'completed',created_at:'2026-11-20',accounting_ready:true,order_items:[],...extra});
  const h=fixture('components/admin/OrderBalanceCollection.tsx',{user,orders:[order(20),order(21),order(22,{user_id:uuid(2)}),order(23,{settled_at:'2026-11-20'})],returnTo:'/admin/transactions'});
  await h.click('全2件の残高精算を確認');
  assert.ok(text(h.render()).includes('選択した2件を残高から精算'));
  assert.equal(h.button('2件・¥200を残高から精算する').props.disabled,true);
  assert.equal(h.calls.length,0);
});

test('cash ledger/count views expose their inputs directly while a selected historical record stays read-only', () => {
  const props={expectedAmount:100,pendingCashOrderAmount:0,pendingCashOrdersCount:0,totalCashCollectionAmount:0,unreimbursedAdvanceAmount:0,unreimbursedPurchaseRuns:[],latestCount:null,entries:[{id:uuid(30),entry_type:'manual',direction:'in',amount:100,note:null,created_at:'2026-11-20'}],counts:[]};
  const h=fixture('app/admin/cashbox/CashboxClient.tsx',props,'?view=ledger');
  assert.ok(h.field('金額'));
  h.setQuery('?view=counts');assert.ok(h.field('実測金額（枚数を使わない場合のみ）'));
  h.setQuery(`?view=ledger&entry=${uuid(30)}`);
  assert.equal(h.all().some(n=>n.type==='button'&&text(n)==='台帳に記録する'),false);
  assert.equal(h.calls.length,0);
});

test('transaction person selection submits the read-only filter without a separate apply button', () => {
  const h=fixture('app/admin/transactions/TransactionsClient.tsx',{orders:[],charges:[],settlements:[],subscriptionPayments:[],userChoices:[user],page:1,hasNextPage:false},'?state=pending');
  const filter=h.all().find(n=>n.type==='select'&&n.props.id==='transaction-user');
  let submissions=0;filter.props.onChange({currentTarget:{form:{requestSubmit(){submissions++;}}}});
  assert.equal(submissions,1);
  const form=h.all().find(n=>n.type==='form');
  assert.equal(form.props.action,'/admin/transactions');assert.equal(form.props.method,undefined);
  assert.equal(h.calls.length,0);
});
