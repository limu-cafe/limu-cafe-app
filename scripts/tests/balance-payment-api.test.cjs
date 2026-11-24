const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root=path.resolve(__dirname,'../..');
const user='00000000-0000-4000-8000-000000000001';
const order='00000000-0000-4000-8000-000000000002';
const other='00000000-0000-4000-8000-000000000003';
const plain=value=>JSON.parse(JSON.stringify(value));

function load(file,db,options={}) {
  const calls=[]; const cache=new Map();
  const mocks={
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status??200,headers:init.headers})}},
    'next/cache':{revalidatePath:path=>calls.push(path)},
    '@/lib/admin-session':{requireAdminSession:async()=>options.admin??{user:{id:other}}},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:user}}})}}),createAdminClient:()=>db},
  };
  function compile(filename) {
    if(cache.has(filename)) return cache.get(filename).exports;
    const module={exports:{}}; cache.set(filename,module);
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const localRequire=name=>name in mocks?mocks[name]:compile((name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name))+'.ts');
    vm.runInNewContext(source,{module,exports:module.exports,require:localRequire,URL,console:{error(){}}},{filename});
    return module.exports;
  }
  return {...compile(path.join(root,file)),calls};
}
const request=(body={},origin='https://cafe.test')=>new Request('https://cafe.test/api/test',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const quote={expected_amount:130,expected_balance:1000,confirm_unpaid:true};
test('administrator adapters require admin rights and use the authenticated actor for both receipt and undo',async()=>{
  const calls=[]; const db={rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}};
  const file='app/api/admin/orders/[id]/cash-settlement/route.ts';
  const denied=load(file,db,{admin:{user:null,error:'Forbidden',status:403}});
  assert.equal((await denied.POST(request(),{params:{id:order}})).status,403); assert.equal(calls.length,0);
  const api=load(file,db);
  assert.equal((await api.POST(request({},'https://attacker.test'),{params:{id:order}})).status,403);
  await api.POST(request({actor_id:user}),{params:{id:order}}); await api.DELETE(request(),{params:{id:order}});
  assert.deepEqual(calls.map(c=>c[1]),[false,true].map(reverse=>({p_kind:'cash_order',p_target_id:order,p_reverse:reverse,p_actor_id:other})));
});


const route='app/api/admin/orders/[id]/balance-payment/route.ts';
const reviewed={...quote,reason:'本人から残高精算の依頼を確認'};
test('admin balance payment derives the actor from the verified management session and owner from the order in SQL',async()=>{
  const calls=[];const api=load(route,{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
  const r=await api.POST(request({...reviewed,actor_id:user,user_id:other,amount:1}),{params:{id:order}});
  assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'private, no-store');
  assert.deepEqual(calls,[['admin_pay_order_from_balance',{p_order_id:order,p_expected_amount:130,p_expected_balance:1000,p_actor_id:other,p_reason:reviewed.reason}]]);
  assert.ok(api.calls.includes(`/admin/orders/${order}`));assert.ok(api.calls.includes('/mypage'));assert.ok(api.calls.includes('/admin/users'));
});
test('admin balance payment denies missing management proof, cross-origin, malformed amounts, missing consent/reason and bad IDs before any write',async()=>{
  const db={rpc(){throw Error('unexpected financial operation');}};
  assert.equal((await load(route,db,{admin:{user:null,status:403,error:'denied'}}).POST(request(reviewed),{params:{id:order}})).status,403);
  const api=load(route,db);
  assert.equal((await api.POST(request(reviewed,'https://attacker.test'),{params:{id:order}})).status,403);
  assert.equal((await api.POST(request(reviewed),{params:{id:'bad'}})).status,400);
  for(const bad of [{},{...reviewed,confirm_unpaid:false},{...reviewed,expected_amount:0},{...reviewed,expected_balance:-1},{...reviewed,expected_amount:1.5},{...reviewed,expected_balance:'1000'},{...reviewed,reason:''},{...reviewed,reason:' '.repeat(4)},{...reviewed,reason:'a'.repeat(301)}]) assert.equal((await api.POST(request(bad),{params:{id:order}})).status,400);
  assert.equal(api.calls.length,0);
});
test('payment conflicts and unavailable schema do not fall back to partial writes or claim success',async()=>{
  for(const [code,status] of [['P0001',409],['22023',400],['P0002',404],['42501',403],['PGRST202',503],['42703',503],['XX000',500]]) {
    let calls=0;const api=load(route,{rpc:async()=>{calls++;return{error:{code,message:'fixture'}};}});
    assert.equal((await api.POST(request(reviewed),{params:{id:order}})).status,status);assert.equal(calls,1);assert.equal(api.calls.length,0);
  }
});

const batchRoute='app/api/admin/users/[id]/order-balance-payments/route.ts';
const batchBody={operation_id:'00000000-0000-4000-8000-000000000009',orders:[{id:order,expected_amount:130}],expected_balance:1000,reason:'本人に確認',confirm_unpaid:true};
test('batch API scopes the target person and actor, validates every quote, and invalidates all selected order details',async()=>{
  const calls=[];const api=load(batchRoute,{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
  assert.equal((await api.POST(request({...batchBody,user_id:other,actor_id:user}),{params:{id:user}})).status,200);
  assert.deepEqual(calls,[['admin_pay_orders_from_balance',{p_operation_id:batchBody.operation_id,p_user_id:user,p_orders:batchBody.orders,p_expected_balance:1000,p_actor_id:other,p_reason:'本人に確認'}]]);
  assert.ok(api.calls.includes(`/admin/orders/${order}`));
});
test('batch API refuses missing proof, cross origin, empty/duplicate/invalid orders and missing acknowledgement before any RPC',async()=>{
  const db={rpc(){throw Error('unexpected write');}};
  assert.equal((await load(batchRoute,db,{admin:{user:null,status:403}}).POST(request(batchBody),{params:{id:user}})).status,403);
  const api=load(batchRoute,db);assert.equal((await api.POST(request(batchBody,'https://attacker.test'),{params:{id:user}})).status,403);
  for(const body of [{...batchBody,orders:[]},{...batchBody,orders:[...batchBody.orders,...batchBody.orders]},{...batchBody,orders:[{id:order,expected_amount:-1}]},{...batchBody,operation_id:'bad'},{...batchBody,confirm_unpaid:false},{...batchBody,reason:''},{...batchBody,expected_balance:'1000'}]) assert.equal((await api.POST(request(body),{params:{id:user}})).status,400);
});

const advanceRoute='app/api/admin/users/[id]/reimbursements/route.ts';
const advanceBody={operation_id:other,runs:[{id:order,expected_amount:600}],confirm_cash_paid:true};
test('advance payout uses one RPC, the path recipient and verified actor, and refreshes reimbursement/cashbox views',async()=>{
  const calls=[];const api=load(advanceRoute,{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
  assert.equal((await api.POST(request({...advanceBody,actor_id:user,recipient_id:other}),{params:{id:user}})).status,200);
  assert.deepEqual(calls,[['admin_reimburse_advances',{p_operation_id:other,p_recipient_id:user,p_runs:advanceBody.runs,p_actor_id:other}]]);
  assert.ok(api.calls.includes('/admin/reimbursements'));assert.ok(api.calls.includes('/admin/cashbox'));
});
test('advance payout rejects missing management proof, cross-origin, duplicate quotes, invalid recipient and unconfirmed cash',async()=>{
  const db={rpc(){throw Error('unexpected write');}},api=load(advanceRoute,db);
  assert.equal((await load(advanceRoute,db,{admin:{user:null,status:403}}).POST(request(advanceBody),{params:{id:user}})).status,403);
  assert.equal((await api.POST(request(advanceBody,'https://evil.test'),{params:{id:user}})).status,403);
  assert.equal((await api.POST(request(advanceBody),{params:{id:'bad'}})).status,400);
  for(const body of [{...advanceBody,confirm_cash_paid:false},{...advanceBody,runs:[]},{...advanceBody,runs:[...advanceBody.runs,...advanceBody.runs]},{...advanceBody,runs:[{id:order,expected_amount:'600'}]},{...advanceBody,runs:[{id:order,expected_amount:2147483648}]},{...advanceBody,operation_id:'bad'}]) assert.equal((await api.POST(request(body),{params:{id:user}})).status,400);
  assert.equal(api.calls.length,0);
});
test('missing batch migration returns unavailable with no partial write fallback; old endpoint shares transactional core',async()=>{
  let count=0;const api=load(advanceRoute,{rpc:async()=>{count++;return{error:{code:'PGRST202'}};}});
  assert.equal((await api.POST(request(advanceBody),{params:{id:user}})).status,503);assert.equal(count,1);assert.equal(api.calls.length,0);
  const calls=[],legacy=load('app/api/admin/purchases/[id]/reimburse/route.ts',{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
  await legacy.POST(request(),{params:{id:order}});assert.deepEqual(calls,[['admin_reimburse_advance',{p_purchase_run_id:order,p_actor_id:other}]]);
});

const stockRoute='app/api/admin/stock-batches/route.ts';
const stockBody={request_id:other,rows:[{item_id:order,quantity:6}],purchase:{payment_source:'personal_advance',total_amount:600,purchased_by:user}};
test('batch inbound validates one shared receipt, preserves the real payer, derives actor and makes one atomic call',async()=>{
 const calls=[],api=load(stockRoute,{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
 assert.equal((await api.POST(request({...stockBody,actor_id:user}))).status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'record_stock_receipt');assert.equal(calls[0][1].p_actor_id,other);assert.equal(calls[0][1].p_input.purchase.purchased_by,user);assert.equal(calls[0][1].p_input.rows[0].subtotal,null);assert.ok(api.calls.includes('/admin/items'));assert.ok(api.calls.includes('/admin/cashbox'));
});
test('batch inbound rejects empty/duplicate/fractional rows, incomplete cost allocation, bad payer and cross-origin before any mutation',async()=>{
 const db={rpc(){throw Error('unexpected write')}},api=load(stockRoute,db);
 assert.equal((await load(stockRoute,db,{admin:{user:null,status:403}}).POST(request(stockBody))).status,403);assert.equal((await api.POST(request(stockBody,'https://evil.test'))).status,403);
 for(const body of [{...stockBody,rows:[]},{...stockBody,rows:[...stockBody.rows,...stockBody.rows]},{...stockBody,rows:[{item_id:order,quantity:1.5}]},{...stockBody,rows:[{item_id:order,quantity:1,subtotal:200}]},{...stockBody,purchase:{...stockBody.purchase,purchased_by:'bad'}},{...stockBody,request_id:'bad'}])assert.equal((await api.POST(request(body))).status,400);
 assert.equal(api.calls.length,0);
});
test('batch history is guarded, paginated and provides exact old receipt lookup without writes',async()=>{
 const ids=[];const rows=Array.from({length:21},(_,i)=>({result:{request_id:'fixture'+i}}));const db={from(table){assert.equal(table,'stock_receipts');const q={select(){return q},order(){return q},range(a,b){ids.push([a,b]);return Promise.resolve({data:rows})},eq(k,v){ids.push([k,v]);return q},maybeSingle:async()=>({data:{result:rows[0].result}})};return q;}};
 const denied=load(stockRoute,db,{admin:{user:null,status:403}});assert.equal((await denied.GET(new Request('https://cafe.test/api/admin/stock-batches'))).status,403);
 const api=load(stockRoute,db),r=await api.GET(new Request('https://cafe.test/api/admin/stock-batches?page=2'));assert.equal(r.body.receipts.length,20);assert.equal(r.body.hasMore,true);assert.deepEqual(ids[0],[20,40]);assert.equal((await api.GET(new Request('https://cafe.test/api/admin/stock-batches?id='+order))).body.receipt.request_id,'fixture0');assert.equal((await api.GET(new Request('https://cafe.test/api/admin/stock-batches?id=bad'))).status,400);
});
test('inventory adjustment accepts explicit zero count, requires reason, protects the quote and authenticates the actor',async()=>{
 const body={request_id:other,item_id:order,kind:'count',value:0,expected_stock:12,note:'棚卸'},calls=[];
 const api=load('app/api/admin/stock-adjustments/route.ts',{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
 assert.equal((await api.POST(request(body))).status,200);assert.equal(calls[0][1].p_actor_id,other);assert.equal(calls[0][1].p_expected_stock,12);assert.equal(calls[0][1].p_value,0);
 for(const bad of [{...body,note:''},{...body,kind:'discard'},{...body,value:-1},{...body,expected_stock:'12'}])assert.equal((await api.POST(request(bad))).status,400);assert.equal(calls.length,1);
});

test('one bulk request keeps purchase dates, suppliers, funding and already-stocked flags independent while deriving the actor',async()=>{
 const calls=[],api=load(stockRoute,{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
 const body={request_id:other,receipts:[{receipt_id:user,rows:[{item_id:order,quantity:2,subtotal:100},{item_id:order,quantity:3,subtotal:180}],purchased_on:'2026-10-01',received_on:'2026-10-03',add_stock:true,purchase:{payment_source:'cashbox',total_amount:280,vendor:'A店'}},{receipt_id:order,rows:[{item_id:order,quantity:2,subtotal:null}],purchased_on:'2026-10-08',received_on:null,add_stock:false,purchase:{payment_source:'personal_advance',purchased_by:user,total_amount:300,vendor:'B店'}}]};
 assert.equal((await api.POST(request({...body,actor_id:user}))).status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'record_stock_intake');const input=calls[0][1].p_input;assert.equal(calls[0][1].p_actor_id,other);assert.deepEqual(input.receipts[0].rows,[{item_id:order,quantity:5,subtotal:280}]);assert.equal(input.receipts[0].purchased_on,'2026-10-01');assert.equal(input.receipts[1].add_stock,false);assert.equal(input.receipts[1].purchase.vendor,'B店');assert.equal(input.receipts[1].purchase.purchased_by,user);
});
test('bulk input rejects invalid calendar dates, empty purchases, duplicate purchase IDs and no-op stock flags without a partial write fallback',async()=>{
 const db={rpc(){throw Error('unexpected write')}},api=load(stockRoute,db);
 const r={receipt_id:user,rows:[{item_id:order,quantity:1,subtotal:100}],purchase:{payment_source:'cashbox',total_amount:100}};
 for(const receipts of [[],[{...r,purchased_on:'2026-02-30'}],[{...r,received_on:'not-date'}],[r,r],[{...r,rows:[]}],[{...r,add_stock:false,purchase:null,rows:[{item_id:order,quantity:1,subtotal:null}]}]])assert.equal((await api.POST(request({request_id:other,receipts}))).status,400);
 assert.equal(api.calls.length,0);
});

test('one mixed purchase or supplies-only purchase reaches one atomic RPC; malformed expense lines never write',async()=>{
 const calls=[],api=load('app/api/admin/purchases/route.ts',{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
 const expense={line_id:other,label:'ペーパータオル',quantity:3,subtotal:450};
 const receipt={receipt_id:user,rows:[{item_id:order,quantity:2,subtotal:200}],expenses:[expense],purchase:{payment_source:'personal_advance',total_amount:650,purchased_by:user}};
 assert.equal((await api.POST(request({request_id:other,receipts:[receipt],actor_id:user}))).status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'record_purchase');assert.equal(calls[0][1].p_actor_id,other);assert.deepEqual(calls[0][1].p_input.receipts[0].expenses,[expense]);assert.ok(api.calls.includes('/admin/reimbursements'));assert.ok(api.calls.includes('/admin/items'));
 assert.equal((await api.POST(request({request_id:other,receipts:[{...receipt,rows:[],purchase:{...receipt.purchase,total_amount:450}}]}))).status,200);assert.equal(calls.length,2);assert.equal(calls[1][1].p_input.receipts[0].rows.length,0);
 for(const bad of [{...expense,label:''},{...expense,quantity:0},{...expense,subtotal:'450'},{...expense,line_id:'invalid'}])assert.equal((await api.POST(request({request_id:other,receipts:[{...receipt,expenses:[bad]}]}))).status,400);
 assert.equal((await api.POST(request({request_id:other,receipts:[{...receipt,expenses:[expense,expense]}]}))).status,400);assert.equal(calls.length,2);
 const missingCalls=[],missing=load('app/api/admin/purchases/route.ts',{rpc:async(name)=>{missingCalls.push(name);return{error:{code:'PGRST202'}};}});assert.equal((await missing.POST(request({request_id:other,receipts:[receipt]}))).status,503);assert.deepEqual(missingCalls,['record_purchase']);
 const legacy=load(stockRoute,{rpc:async(name)=>{assert.equal(name,'record_purchase');return{error:{code:'PGRST202'}};}});assert.equal((await legacy.POST(request({request_id:other,receipts:[receipt]}))).status,503);
});

test('detailed purchase API preserves box quotes and physical stock; incompatible DB never falls back to an older recorder',async()=>{
 const calls=[],api=load('app/api/admin/purchases/route.ts',{rpc:async(name,args)=>{calls.push([name,plain(args)]);return{data:{ok:true}};}});
 const entry={line_id:other,item_id:order,label:null,quantity:2,package_unit:'box',units_per_package:6,price_mode:'total',price:1800,add_stock:true};
 const row={item_id:order,quantity:12,stock_quantity:12,subtotal:1800};const receipt={receipt_id:user,rows:[row],expenses:[],purchase_lines:[entry],purchase:{payment_source:'personal_advance',total_amount:1800}};const body={request_id:other,receipts:[receipt]};
 assert.equal((await api.POST(request(body))).status,200);assert.equal(calls[0][0],'record_purchase_v2');assert.deepEqual(calls[0][1].p_input.receipts[0].purchase_lines,[entry]);
 for(const bad of [{...receipt,rows:[{...row,quantity:2}]},{...receipt,rows:[{...row,stock_quantity:-1}]},{...receipt,purchase_lines:[{...entry,units_per_package:0}]},{...receipt,purchase_lines:[{...entry,price:1000}]},{...receipt,add_stock:false}])assert.equal((await api.POST(request({request_id:other,receipts:[bad]}))).status,400);assert.equal(calls.length,1);
 const missing=[],unsupported=load('app/api/admin/purchases/route.ts',{rpc:async name=>{missing.push(name);return{error:{code:'PGRST202'}};}});assert.equal((await unsupported.POST(request(body))).status,503);assert.deepEqual(missing,['record_purchase_v2']);
});

test('stocktake submission uses the authenticated actor and rejects invalid or duplicated counts before writing', async () => {
 const calls = [];
 const rpc = async (name, args) => { calls.push([name,plain(args)]); return {data:{ok:true}}; };
 const path = 'app/api/admin/stocktakes/route.ts';
 const api = load(path,{rpc});
 const entry = {item_id:order,expected_stock:16,actual_count:15};
 const body = {request_id:user,entries:[entry],note:' 棚を確認 ',actor_id:user};
 assert.equal((await api.POST(request(body))).status,200);
 assert.deepEqual(calls,[['record_stocktake',{p_request_id:user,p_actor_id:other,p_input:{note:'棚を確認',entries:[entry]}}]]);
 assert.ok(api.calls.includes('/admin/stock'));
 for (const entries of [[entry,entry],[{...entry,actual_count:-1}],[{...entry,actual_count:1.5}],[{item_id:order,expected_stock:16}]]) {
  assert.equal((await api.POST(request({...body,entries}))).status,400);
 }
 assert.equal((await api.POST(request(body,'https://elsewhere.test'))).status,403);
 assert.equal((await load(path,{rpc},{admin:{user:null,status:401,error:'unauthorized'}}).POST(request(body))).status,401);
 assert.equal(calls.length,1);
});
