const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const ids = [1,2,3].map((i) => `00000000-0000-4000-8000-00000000000${i}`);
function load(file, mocks = {}) {
  const modules = new Map();
  function compile(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const requireLocal = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return compile(path.join(root,name.slice(2))+'.ts');
      throw new Error(name);
    };
    vm.runInNewContext(source,{module,exports:module.exports,require:requireLocal,URL,crypto:require('node:crypto').webcrypto,console:{error(){}}}); return module.exports;
  }
  return compile(path.join(root,file));
}
const plain = (value) => JSON.parse(JSON.stringify(value));
test('restock validation rejects malformed quantities and zero-cost purchases before any write', () => {
  const {parseRestockInput} = load('lib/restock.ts');
  for (const quantity of [-1,0,1.5,'6',NaN,Infinity,2147483648]) assert.throws(()=>parseRestockInput({item_id:ids[0],quantity}));
  assert.throws(()=>parseRestockInput({item_id:ids[0],quantity:6,purchase:{record:true,payment_source:'cashbox',total_amount:0}}));
  assert.deepEqual(plain(parseRestockInput({item_id:ids[0],quantity:6,note:' test ',purchase:{record:true,payment_source:'cashbox',total_amount:780,vendor:' ',note:' memo '},stock:999,actor_id:ids[1]})),{item_id:ids[0],quantity:6,note:'test',purchase:{payment_source:'cashbox',total_amount:780,vendor:null,note:'memo'}});
});
test('an uncertain response retains the same ID; confirmed completion permits a new intentional operation', () => {
  const {RestockSubmission} = load('lib/restock.ts'); const submission = new RestockSubmission();
  const input = {item_id:ids[0],quantity:6};
  const first = submission.requestId(input);
  assert.equal(submission.requestId({...input}),first);
  assert.notEqual(submission.requestId({...input,quantity:7}),first);
  submission.complete(input); assert.notEqual(submission.requestId(input),first);
});
function route(access={user:{id:ids[2]}}, result={data:{ok:true,stock:20,purchase:null},error:null}) {
  const calls=[],invalidated=[];
  const {POST} = load('app/api/admin/stock/route.ts', {
    '@/lib/admin-session':{requireAdminSession:async()=>access},
    '@/lib/supabase/server':{createAdminClient:()=>({rpc:async(...args)=>{calls.push(args);return result;},from(){throw new Error('no read/overwrite fallback');}})},
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
    'next/cache':{revalidatePath:(path)=>invalidated.push(path)},
  });
  const request=(body,origin='https://cafe.test')=>({url:'https://cafe.test/api/admin/stock',headers:new Headers({origin}),json:async()=>body});
  const body={request_id:ids[1],item_id:ids[0],quantity:6,note:'fixture',purchase:null};
  return {POST,request,body,calls,invalidated};
}
test('unauthorized, cross-origin, malformed and legacy requests do not reach the database', async () => {
  const noAccess=route({user:null,error:'denied',status:403}); assert.equal((await noAccess.POST(noAccess.request(noAccess.body))).status,403);assert.equal(noAccess.calls.length,0);
  const r=route();
  assert.equal((await r.POST(r.request(r.body,'https://other.test'))).status,403);
  assert.equal((await r.POST(r.request({...r.body,quantity:'6'}))).status,400);
  assert.equal((await r.POST(r.request({...r.body,request_id:undefined}))).status,400);
  assert.equal(r.calls.length,0);
});
test('one RPC owns the operation and uses the verified actor rather than client-supplied identities', async () => {
  const r=route(); assert.equal((await r.POST(r.request({...r.body,actor_id:ids[0],stock:999}))).status,200);
  assert.deepEqual(plain(r.calls),[['record_stock_restock',{p_request_id:ids[1],p_item_id:ids[0],p_quantity:6,p_note:'fixture',p_purchase:null,p_actor_id:ids[2]}]]);
  assert.ok(r.invalidated.includes('/admin/cashbox')); assert.ok(r.invalidated.includes('/admin/audit'));
});
test('missing migration and failed or unconfirmed saves never fall back to the unsafe update', async () => {
  for (const [result,status] of [[{data:null,error:{code:'PGRST202'}},503],[{data:null,error:{code:'P0002'}},404],[{data:null,error:{code:'22023',message:'invalid'}},400],[{data:null,error:{code:'08006'}},500],[{data:null,error:null},500]]) {
    const r=route({user:{id:ids[2]}},result);assert.equal((await r.POST(r.request(r.body))).status,status);assert.equal(r.calls.length,1);assert.equal(r.invalidated.length,0);
  }
});
