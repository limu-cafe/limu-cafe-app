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
