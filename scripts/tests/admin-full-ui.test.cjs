const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = process.env.LIMU_TEST_ROOT || path.resolve(__dirname, '../..');
const text = n => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n);
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children), ...nodes(n.props?.collection), ...nodes(n.props?.detail)];
const flush = () => new Promise(setImmediate);
function fixture(file, props, query='', extraMocks={}) {
  let cursor=0, refreshes=0, ok=true; const hooks=[], effects=[], calls=[], errors=[];
  const location={href:'http://localhost/admin/test'+query};
  const jsx=(type,props)=>({type,props});
  const react={
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useMemo:fn=>fn(),
    useEffect(fn,deps){const i=cursor++;if(!(i in hooks)||deps.some((d,j)=>d!==hooks[i][j])){hooks[i]=deps;effects.push(fn);}},
  };
  const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link'},'next/navigation':{useSearchParams:()=>new URL(location.href).searchParams,useRouter:()=>({refresh(){refreshes++;}})},'lucide-react':{},'date-fns':{format:()=> '2026/10/19'},'date-fns/locale':{ja:{}},'react-hot-toast':{default:{success(){},error(e){errors.push(e);}}}};
  Object.assign(mocks,extraMocks);
  const modules=new Map();
  function load(filename){
    if(modules.has(filename))return modules.get(filename).exports;
    const module={exports:{}};modules.set(filename,module);
    const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const requireLocal=name=>{if(name in mocks)return mocks[name];const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(filename),name);return load(target+(fs.existsSync(target+'.ts')?'.ts':'.tsx'));};
    vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,URL,URLSearchParams,crypto:require('node:crypto').webcrypto,console,confirm:()=>true,window:{location,history:{pushState(_s,_t,url){location.href=String(url);}}},fetch:async(url,options={})=>{calls.push({url,method:options.method??'GET',body:options.body?JSON.parse(options.body):undefined});return{ok,json:async()=>ok?{members:props.members??[]}: {error:'failed'}};}});
    return module.exports;
  }
  const Component=load(path.join(root,file)).default;
  const render=()=>{cursor=0;return Component(props);};
  const all=()=>nodes(render());
  const button=label=>{const n=all().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,'Missing button: '+label);return n;};
  const field=label=>{const list=all();const direct=list.find(n=>['input','textarea','select'].includes(n.type)&&(n.props['aria-label']===label||n.props.placeholder===label));if(direct)return direct;const l=list.find(n=>n.type==='label'&&text(n).startsWith(label));const n=nodes(l).find(n=>['input','textarea','select'].includes(n.type));assert.ok(n,'Missing field: '+label);return n;};
  return {render,all,button,field,calls,errors,setOk:v=>{ok=v;},setQuery:q=>{location.href='http://localhost/admin/test'+q;},refreshes:()=>refreshes,change(label,value){field(label).props.onChange({target:{value,checked:value}});},async effects(){render();while(effects.length)effects.shift()();await flush();render();},async click(label){await button(label).props.onClick();await flush();}};
}
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
  const h=fixture('app/admin/cashbox/CashboxClient.tsx',props,'?view=counts');await h.click('金庫確認を記録');
  await h.click('確認結果を保存する');assert.equal(h.calls.length,0);
  h.change('実測金額（枚数を使わない場合のみ）','0');await h.click('確認結果を保存する');
  assert.deepEqual(h.calls[0],{url:'/api/admin/cashbox/counts',method:'POST',body:{actual_amount:0,denomination_counts:null,note:''}});
  h.change('実測金額（枚数を使わない場合のみ）','999');h.change('1,000円','2');h.change('100円','3');h.change('メモ（例: 月末確認、つり銭補充前）','棚卸');await h.click('確認結果を保存する');
  assert.deepEqual(h.calls[1].body,{actual_amount:2300,denomination_counts:{10000:0,5000:0,1000:2,500:0,100:3,50:0,10:0,5:0,1:0},note:'棚卸'});
});

test('stock purchase keeps the payment source and the same retry ID after uncertain failure',async()=>{
  const h=fixture('components/admin/ProductRestock.tsx',{item:{id:'00000000-0000-4000-8000-000000000001',stock:12,is_unlimited_stock:false}});
  h.change('追加する個数','2');h.change('仕入れ額と支払元も記録する',true);h.change('支払元','personal_advance');h.change('仕入れ合計額','0');await h.click('入荷と仕入れを記録');assert.equal(h.calls.length,0);
  h.change('仕入れ合計額','260');h.change('購入先','売店');h.change('メモ','入荷');h.setOk(false);
  h.button('入荷と仕入れを記録').props.onClick();h.button('記録中…').props.onClick();await flush();assert.equal(h.calls.length,1);assert.equal(h.refreshes(),0);
  h.setOk(true);await h.click('入荷と仕入れを記録');assert.equal(h.calls[0].body.request_id,h.calls[1].body.request_id);assert.equal(h.calls[1].body.quantity,2);assert.deepEqual(h.calls[1].body.purchase,{record:true,payment_source:'personal_advance',total_amount:260,vendor:'売店',note:'入荷'});
  h.change('追加する個数','3');await h.click('在庫を追加');assert.equal(h.calls[2].body.purchase,null);assert.notEqual(h.calls[2].body.request_id,h.calls[1].body.request_id);
});

test('reimbursement detail applies to its selected record and retains both advance forms',async()=>{
  const h=fixture('app/admin/reimbursements/ReimbursementsClient.tsx',{items:[{id:'i1',name:'緑茶'}],purchaseRuns:[{id:'r1',total_amount:260,payment_source:'personal_advance',reimbursement_status:'pending_reimbursement',created_at:'2026-10-19',purchase_run_items:[]}],miscExamples:[]},'?run=r1');
  assert.equal(h.calls.length,0);await h.click('この立替を金庫から精算');assert.equal(h.calls[0].url,'/api/admin/purchases/r1/reimburse');
  await h.click('立替を記録');h.change('個数','2');h.change('立替額','260');h.change('購入先','売店');h.change('メモ','購入');await h.click('商品の立替を記録');
  assert.deepEqual(h.calls[1].body,{kind:'product',item_id:'i1',quantity:2,total_amount:260,vendor:'売店',note:'購入'});
  h.change('立替の種類','misc');h.change('立て替えたもの','紙コップ');h.change('立替額','200');await h.click('雑費の立替を記録');assert.deepEqual(h.calls[2].body,{kind:'misc',label:'紙コップ',total_amount:200,vendor:'',note:''});
});

test('request bulk action sends only selected pending requests',async()=>{
  const requests=[{id:'q1',item_name:'水',status:'pending',created_at:'2026-10-19'},{id:'q2',item_name:'緑茶',status:'pending',created_at:'2026-10-19'},{id:'q3',item_name:'コーヒー',status:'approved',created_at:'2026-10-19'}];
  const h=fixture('app/admin/requests/RequestsClient.tsx',{requests});h.change('水を一括操作の対象にする',true);assert.equal(h.calls.length,0);await h.click('一括採用');assert.deepEqual(h.calls,[{url:'/api/admin/requests/q1',method:'PUT',body:{status:'approved',admin_note:''}}]);
});

test('cash ledger keeps manual direction and miscellaneous expense payloads',async()=>{
  const h=fixture('app/admin/cashbox/CashboxClient.tsx',{expectedAmount:0,pendingCashOrderAmount:0,pendingCashOrdersCount:0,totalCashCollectionAmount:0,unreimbursedAdvanceAmount:0,unreimbursedPurchaseRuns:[],latestCount:null,entries:[],counts:[]},'?view=ledger');
  await h.click('出納記録を追加');await h.click('出金');h.change('金額','500');h.change('メモ（例: 金庫からつり銭を補充）','つり銭');await h.click('台帳に記録する');
  assert.deepEqual(h.calls[0],{url:'/api/admin/cashbox/adjustments',method:'POST',body:{amount:500,direction:'out',note:'つり銭'}});
  h.change('記録の種類','misc');h.change('雑費名','洗剤');h.change('金額','200');h.change('メモ','備品');await h.click('雑費を記録');assert.deepEqual(h.calls[1],{url:'/api/admin/cashbox/misc-expenses',method:'POST',body:{amount:200,item_name:'洗剤',note:'備品'}});
});

test('an older reimbursement opened from the cashbox is retrieved by its exact ID',async()=>{
  const id='00000000-0000-4000-8000-000000000999',queries=[];
  const db={from(table){const filters=[];const q={select(){return q;},order(){return q;},eq(k,v){filters.push([k,v]);return q;},limit(){return q;},async maybeSingle(){queries.push({table,filters});return {data:{id,payment_source:'personal_advance',note:'旧記録'}};},then(resolve,reject){return Promise.resolve({data:table==='purchase_runs'?Array.from({length:40},(_,i)=>({id:'recent'+i,note:null})):[]}).then(resolve,reject);}};return q;}};
  const h=fixture('app/admin/reimbursements/page.tsx',{searchParams:{run:id}},'',{'@/lib/admin-page-session':{requireAdminPage:async()=>{}},'@/lib/supabase/server':{createAdminClient:()=>db}});
  const rendered=await h.render();assert.equal(rendered.props.purchaseRuns.length,41);assert.equal(rendered.props.purchaseRuns[0].id,id);assert.deepEqual(queries,[{table:'purchase_runs',filters:[['id',id],['payment_source','personal_advance']]}]);
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
