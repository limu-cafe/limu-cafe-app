const assert=require('node:assert/strict');
const {test}=require('node:test');
const {fixture,text,flush}=require('./helpers/ui-fixture.cjs');
const product={id:'p1',name:'定額A',english_name:'Plan A',description:'説明',price:500,billing_interval_count:1,billing_interval_unit:'month',points_enabled:true,balance_enabled:true,is_active:true};

test('subscription product and individual contract retain all fields and target IDs', async()=>{
  const member={id:'m1',product_id:'p1',status:'active',end_month:'2026-12-01',payment_priority:['points','balance','cash'],allow_partial_payment:true,user:{id:'u1',name:'利用者A',balance:100,points_balance:10}};
  const h=fixture('app/admin/subscriptions/SubscriptionsAdminClient.tsx',{products:[product,{...product,id:'p2',name:'定額B'}],members:[member]},'?product=p1');
  h.change('価格','700');await h.click('保存');
  assert.deepEqual(h.calls[0],{url:'/api/admin/subscriptions/p1',method:'PATCH',body:{name:'定額A',english_name:'Plan A',description:'説明',price:700,billing_interval_count:1,billing_interval_unit:'month',points_enabled:true,balance_enabled:true,is_active:true}});
  h.setQuery('?product=p2');assert.equal(h.field('価格').props.value,'500');
  h.setQuery('?product=p1&view=members&member=m1');await h.effects();
  assert.equal(h.calls[1].url,'/api/admin/subscriptions/p1/members');
  assert.ok(h.all().some(n=>n.props?.href==='/admin/users?user=u1&view=subscriptions'));
  h.change('終了予定年月','2027-01');h.change('状態','cancel_at_period_end');h.change('部分利用',false);await h.click('保存');
  assert.deepEqual(h.calls[2],{url:'/api/admin/subscription-members/m1',method:'PATCH',body:{status:'cancel_at_period_end',end_month:'2027-01',payment_priority:['points','balance','cash'],allow_partial_payment:false}});
});

test('subscription creation preserves price, billing interval and availability controls',async()=>{
  const h=fixture('app/admin/subscriptions/SubscriptionsAdminClient.tsx',{products:[]});
  await h.click('サブスク商品を追加');h.change('サブスク名','新プラン');h.change('価格','900');h.change('英語名','New');h.change('説明','説明');h.change('ポイント利用可',false);
  await h.click('追加');assert.deepEqual(h.calls[0],{url:'/api/admin/subscriptions',method:'POST',body:{name:'新プラン',english_name:'New',description:'説明',price:900,billing_interval_count:1,billing_interval_unit:'month',points_enabled:false,balance_enabled:true,is_active:true}});
});

test('cash count accepts explicit zero and denomination counts override the manual total',async()=>{
  const props={expectedAmount:5200,pendingCashOrderAmount:0,pendingCashOrdersCount:0,totalCashCollectionAmount:520,unreimbursedAdvanceAmount:0,unreimbursedPurchaseRuns:[],latestCount:null,entries:[],counts:[]};
  const h=fixture('app/admin/cashbox/CashboxClient.tsx',props,'?view=counts');
  await h.click('確認結果を保存する');assert.equal(h.calls.length,0);
  h.change('実測金額（枚数を使わない場合のみ）','0');await h.click('確認結果を保存する');
  assert.deepEqual(h.calls[0],{url:'/api/admin/cashbox/counts',method:'POST',body:{actual_amount:0,denomination_counts:null,note:''}});
  h.change('実測金額（枚数を使わない場合のみ）','999');h.change('1,000円','2');h.change('100円','3');h.change('メモ（例: 月末確認、つり銭補充前）','棚卸');await h.click('確認結果を保存する');
  assert.deepEqual(h.calls[1].body,{actual_amount:2300,denomination_counts:{10000:0,5000:0,1000:2,500:0,100:3,50:0,10:0,5:0,1:0},note:'棚卸'});
});

test('product stock-only action keeps its idempotent operation; purchasing uses the shared editor',async()=>{
 const id='00000000-0000-4000-8000-000000000001';const h=fixture('components/admin/ProductRestock.tsx',{item:{id,stock:12,is_unlimited_stock:false}});assert.ok(h.all().some(n=>n.props?.href?.startsWith('/admin/reimbursements?record=purchase')));h.change('追加する個数','２');h.setOk(false);await h.click('在庫を追加');h.setOk(true);await h.click('在庫を追加');assert.equal(h.calls[0].body.request_id,h.calls[1].body.request_id);assert.equal(h.calls[1].body.quantity,2);assert.equal(h.calls[1].body.purchase,null);
});

test('request bulk action sends only selected pending requests',async()=>{
  const requests=[{id:'q1',item_name:'水',status:'pending',created_at:'2026-10-19'},{id:'q2',item_name:'緑茶',status:'pending',created_at:'2026-10-19'},{id:'q3',item_name:'コーヒー',status:'approved',created_at:'2026-10-19'}];
  const h=fixture('app/admin/requests/RequestsClient.tsx',{requests});h.change('水を一括操作の対象にする',true);assert.equal(h.calls.length,0);await h.click('一括採用');assert.deepEqual(h.calls,[{url:'/api/admin/requests/q1',method:'PUT',body:{status:'approved',admin_note:''}}]);
});

test('cash ledger keeps manual direction and routes miscellaneous purchases to the shared editor',async()=>{
  const h=fixture('app/admin/cashbox/CashboxClient.tsx',{expectedAmount:0,pendingCashOrderAmount:0,pendingCashOrdersCount:0,totalCashCollectionAmount:0,unreimbursedAdvanceAmount:0,unreimbursedPurchaseRuns:[],latestCount:null,entries:[],counts:[]},'?view=ledger');
  await h.click('出金');h.change('金額','500');h.change('メモ（例: 金庫からつり銭を補充）','つり銭');await h.click('台帳に記録する');
  assert.deepEqual(h.calls[0],{url:'/api/admin/cashbox/adjustments',method:'POST',body:{amount:500,direction:'out',note:'つり銭'}});
  h.change('記録の種類','misc');assert.ok(h.all().some(n=>n.props?.href?.startsWith('/admin/reimbursements?record=purchase')&&n.props.href.includes('source=cashbox')&&n.props.href.includes('misc=1')));assert.equal(h.calls.length,1);
});

test('an older reimbursement opened from the cashbox is retrieved by its exact ID',async()=>{
  const id='00000000-0000-4000-8000-000000000999',queries=[];
  const db={from(table){const filters=[];const q={select(){return q;},order(){return q;},in(){return q;},eq(k,v){filters.push([k,v]);return q;},limit(){return q;},range(){return q;},async maybeSingle(){queries.push({table,filters});return {data:{id,payment_source:'personal_advance',note:'旧記録'}};},then(resolve,reject){const pending=filters.some(([k,v])=>k==='reimbursement_status'&&v==='pending_reimbursement');return Promise.resolve({data:table==='purchase_runs'&&!pending?Array.from({length:40},(_,i)=>({id:'recent'+i,note:null,created_at:'2026-10-19'})):[],count:0}).then(resolve,reject);}};return q;}};
  const h=fixture('app/admin/reimbursements/page.tsx',{searchParams:{run:id}},'',{'@/lib/admin-page-session':{requireAdminPage:async()=>{}},'@/lib/supabase/server':{createAdminClient:()=>db}});
  const rendered=await h.render();assert.equal(rendered.props.purchaseRuns.length,41);assert.equal(rendered.props.purchaseRuns[0].id,id);assert.deepEqual(queries,[{table:'purchase_runs',filters:[['payment_source','personal_advance'],['id',id]]}]);
});

test('point campaigns keep creation, activation and deletion scoped to the selected campaign',async()=>{
  const props={settings:{is_enabled:true,base_points_per_unit:1,yen_per_point_unit:100},campaigns:[{id:'c1',name:'秋',multiplier:2,is_enabled:true,apply_immediately:true,starts_at:null,ends_at:null}],users:[],transactions:[]};
  const h=fixture('app/admin/points/PointsClient.tsx',props,'?view=campaigns&campaign=c1');
  assert.equal(h.calls.length,0);await h.click('停止');assert.deepEqual(h.calls[0],{url:'/api/admin/points/campaigns/c1',method:'PATCH',body:{is_enabled:false}});await h.click('削除');assert.equal(h.calls[1].method,'DELETE');assert.equal(h.calls[1].url,'/api/admin/points/campaigns/c1');
  await h.click('キャンペーンを追加');h.change('キャンペーン名','新学期');h.change('倍率','3');h.change('今すぐ適用する',true);await h.click('キャンペーンを作成');assert.deepEqual(h.calls[2],{url:'/api/admin/points/campaigns',method:'POST',body:{name:'新学期',multiplier:3,starts_at:'',ends_at:'',is_enabled:true,apply_immediately:true,note:''}});
});

test('legacy transfer previews the chosen source and submits only the chosen request and source',async()=>{
  const h=fixture('app/admin/legacy/LegacyTransferClient.tsx',{requests:[{id:'q1',legacy_name:'旧A',status:'pending',user:{name:'A'}},{id:'q2',legacy_name:'旧B',status:'pending',user:{name:'B'}}],legacyUsers:[{id:'l1',name:'旧A',legacy_balance:500,favorite_item_names:['水'],matched_user_id:null,transferred_at:null,purchase_summary:{totalQuantity:1,topItems:['水']}}]},'?request=q1');
  h.change('紐づける旧システムユーザー','l1');assert.ok(h.all().some(n=>text(n).includes('+¥500')));assert.equal(h.calls.length,0);await h.click('引き継いで完了');assert.deepEqual(h.calls[0],{url:'/api/admin/legacy-transfer/q1/approve',method:'POST',body:{legacy_user_id:'l1'}});
  h.setQuery('?request=q2');assert.equal(h.field('紐づける旧システムユーザー').props.value,'');h.change('却下理由（任意）','対象違い');await h.click('却下');assert.deepEqual(h.calls[1],{url:'/api/admin/legacy-transfer/q2/reject',method:'POST',body:{rejection_reason:'対象違い'}});
});
