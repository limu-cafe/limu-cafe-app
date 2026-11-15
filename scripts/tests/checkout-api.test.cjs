const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const user = '20000000-0000-4000-8000-000000000001';
const item = '20000000-0000-4000-8000-000000000002';
const requestId = '20000000-0000-4000-8000-000000000003';
const body = { items: [{item_id:item,quantity:2,item_price:1,item_name:'偽物',subtotal:2}], total_amount:260,payment_method:'balance',points_used:0,request_id:requestId };
function fixture(options = {}) {
  const writes = [], notifications = [], refreshes = [], modules = new Map();
  const mocks = {
    '@/lib/member-session': {requireMemberSession:async()=>({user:options.signedOut?null:{id:user},status:options.signedOut?401:200,error:'Unauthorized'})},
    'next/server': {NextResponse:{json:(body, init={})=>({body,status:init.status??200})}},
    'next/cache': {revalidatePath:p=>refreshes.push(p)},
    '@/lib/supabase/server': {
      createClient:async()=>({auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:user}}})}}),
      createAdminClient:()=>({rpc:async(name,args)=>{writes.push({name,args:JSON.parse(JSON.stringify(args))}); return options.result??{data:{ok:true,order_id:'order1',user_name:'利用者',items:[{item_name:'お茶',item_price:130,quantity:2}],total_amount:260,payment_method:'balance',low_stock_items:[]}};}}),
    },
    '@/lib/slack': Object.fromEntries(['notifyNewOrder','notifyCashOrderPending','notifyLowStock'].map(n=>[n,async p=>{notifications.push({name:n,args:JSON.parse(JSON.stringify(p))}); if(options.notificationFailure) throw Error('notification unavailable');}])),
  };
  function load(file) {
    if(modules.has(file)) return modules.get(file).exports;
    const module = {exports:{}}; modules.set(file,module);
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??load(path.join(root,n.slice(2))+'.ts'),URL,crypto:require('node:crypto').webcrypto,console:{error(){}}});
    return module.exports;
  }
  return {...load(path.join(root,'app/api/orders/route.ts')),lib:load(path.join(root,'lib/checkout.ts')),writes,notifications,refreshes};
}
const request = (value=body, origin='https://cafe.test') => new Request('https://cafe.test/api/orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});
test('checkout derives user from authentication and strips browser prices and identities',async()=>{
  const f=fixture(); assert.equal((await f.POST(request({...body,user_id:'someone-else'}))).status,200);
  assert.deepEqual(f.writes,[{name:'checkout_order',args:{p_user_id:user,p_items:[{item_id:item,quantity:2}],p_expected_total:260,p_payment_method:'balance',p_deferred_method:null,p_requested_points:0,p_request_id:requestId}}]);
  assert.equal(f.notifications[0].args.items[0].price,130);assert.equal(f.notifications[0].args.items[0].name,'お茶');
  assert.ok(f.refreshes.includes('/mypage'));assert.ok(f.refreshes.includes('/admin/transactions'));
});
test('authentication, cross-origin, malformed JSON and malformed carts are rejected before financial writes',async()=>{
  const denied=fixture({signedOut:true}); assert.equal((await denied.POST(request())).status,401);assert.equal(denied.writes.length,0);
  const f=fixture();assert.equal((await f.POST(request(body,'https://attacker.test'))).status,403);
  for(const bad of [null,{}, {...body,items:[]},{...body,items:[...body.items,...body.items]},{...body,items:[{item_id:item,quantity:-1}]},{...body,items:[{item_id:item,quantity:0}]},{...body,items:[{item_id:item,quantity:1.5}]},{...body,items:[{item_id:'invalid',quantity:1}]},{...body,total_amount:'260'},{...body,points_used:-1},{...body,points_used:0.5},{...body,payment_method:'stripe'}]) assert.equal((await f.POST(request(bad))).status,400);
  assert.equal((await f.POST(new Request('https://cafe.test/api/orders',{method:'POST',body:'{'}))).status,400);
  assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
});
test('price or stock conflict and database failure send no success notification',async()=>{
  for(const [code,status] of [['P0001',409],['LM001',409],['22023',400],['42501',403],['P0002',404],['XX000',500]]) {
    const f=fixture({result:{error:{code,message:'fixture error'}}});assert.equal((await f.POST(request())).status,status);assert.equal(f.notifications.length,0);assert.equal(f.refreshes.length,0);
  }
});
test('a notification outage never rolls back or resubmits an already committed order',async()=>{
  const f=fixture({notificationFailure:true});const r=await f.POST(request());assert.equal(r.status,200);assert.equal(r.body.order_id,'order1');assert.equal(f.writes.length,1);
});
test('a missing or malformed request ID asks for a reload and reaches no financial write',async()=>{
  const f=fixture(),{request_id:_,...withoutId}=body;
  for(const bad of [withoutId,{...body,request_id:null},{...body,request_id:''},{...body,request_id:'not-a-uuid'},{...body,request_id:42}]) {
    const r=await f.POST(request(bad));assert.equal(r.status,400);assert.match(r.body.error,/ページを再読み込み/);
  }
  assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
  const upper=fixture();assert.equal((await upper.POST(request({...body,request_id:requestId.toUpperCase().replace('2','a')}))).status,200);
  assert.equal(upper.writes[0].args.p_request_id,requestId.replace('2','a'));
});
test('a replayed request returns the first order without notifying again',async()=>{
  const first={ok:true,order_id:'order1',user_name:'利用者',items:[{item_name:'お茶',item_price:130,quantity:2}],total_amount:260,payment_method:'cash',low_stock_items:[{name:'お茶',stock:1,stock_alert_threshold:3}]};
  const f=fixture({result:{data:{...first,replayed:true}}});const r=await f.POST(request());
  assert.equal(r.status,200);assert.deepEqual(JSON.parse(JSON.stringify(r.body)),{ok:true,order_id:'order1'});
  assert.equal(f.writes.length,1);assert.equal(f.notifications.length,0);assert.ok(f.refreshes.includes('/mypage'));
  const fresh=fixture({result:{data:first}});await fresh.POST(request());
  assert.deepEqual(fresh.notifications.map(n=>n.name),['notifyNewOrder','notifyCashOrderPending','notifyLowStock']);
});
test('exceeding the deferred balance ceiling is a conflict that shows the database message',async()=>{
  const f=fixture({result:{error:{code:'LM001',message:'後払いの上限（10,000円）を超えるため受け付けできません'}}});
  const r=await f.POST(request({...body,payment_method:'deferred',deferred_settlement_method:'cash'}));
  assert.equal(r.status,409);assert.equal(r.body.error,'後払いの上限（10,000円）を超えるため受け付けできません');assert.equal(f.notifications.length,0);
});
test('the browser keeps one request ID per order until that order succeeds',()=>{
  const {CheckoutSubmission,validCheckoutRequestId}=fixture().lib;
  const s=new CheckoutSubmission(),order={items:[{item_id:item,quantity:2}],total_amount:260},changed={items:[{item_id:item,quantity:3}],total_amount:390};
  const id=s.requestId(order);assert.ok(validCheckoutRequestId(id));
  assert.equal(s.requestId({...order}),id);assert.notEqual(s.requestId(changed),id);assert.equal(s.requestId(order),id);
  s.complete(order);assert.notEqual(s.requestId(order),id);
  assert.notEqual(new CheckoutSubmission().requestId(changed),s.requestId(changed));
});
