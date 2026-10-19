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
    vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,URL,URLSearchParams,crypto:require('node:crypto').webcrypto,console,confirm:()=>true,window:{location,history:{pushState(_s,_t,url){location.href=String(url);}}},fetch:async(url,options={})=>{calls.push({url,method:options.method??'GET',body:options.body?JSON.parse(options.body):undefined});return{ok,json:async()=>ok?{ok:true,members:props.members??[]}: {error:'failed'}};}});
    return module.exports;
  }
  const Component=load(path.join(root,file)).default;
  const render=()=>{cursor=0;return Component(props);};
  const all=()=>nodes(render());
  const button=label=>{const n=all().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,'Missing button: '+label);return n;};
  const field=label=>{const list=all();const direct=list.find(n=>['input','textarea','select'].includes(n.type)&&(n.props['aria-label']===label||n.props.placeholder===label));if(direct)return direct;const l=list.find(n=>n.type==='label'&&text(n).startsWith(label));const n=nodes(l).find(n=>['input','textarea','select'].includes(n.type));assert.ok(n,'Missing field: '+label);return n;};
  return {render,all,button,field,calls,errors,setOk:v=>{ok=v;},setQuery:q=>{location.href='http://localhost/admin/test'+q;},refreshes:()=>refreshes,change(label,value){field(label).props.onChange({target:{value,checked:value}});},async effects(){render();while(effects.length)effects.shift()();await flush();render();},async click(label){await button(label).props.onClick();await flush();}};
}

const order={id:'00000000-0000-4000-8000-000000000001',user_id:'00000000-0000-4000-8000-000000000002',created_at:'2026-10-19',accounting_ready:true,total_amount:160,points_used:30,payment_method:'deferred',payment_status:'completed',user:{name:'架空の利用者',balance:1000}};
test('an administrator reviews the selected order, obtains consent and records a reason before debiting; errors keep the confirmation available',async()=>{
  const h=fixture('components/admin/OrderBalancePayment.tsx',{order});
  await h.click('利用者の残高から精算');
  assert.equal(h.calls.length,0);assert.ok(h.all().some(n=>text(n).includes('¥870')));
  const confirmation='本人に確認し、この注文の現金をまだ受け取っていないことを確認しました';
  assert.equal(h.button('¥130を残高から精算する').props.disabled,true);
  h.change('精算理由','本人から依頼を確認');h.change(confirmation,true);h.setOk(false);
  const submit=h.button('¥130を残高から精算する');submit.props.onClick();submit.props.onClick();await flush();
  assert.equal(h.calls.length,1);assert.equal(h.refreshes(),0);
  assert.deepEqual(h.calls[0],{url:`/api/admin/orders/${order.id}/balance-payment`,method:'POST',body:{expected_amount:130,expected_balance:1000,confirm_unpaid:true,reason:'本人から依頼を確認'}});
  assert.ok(h.all().some(n=>n.props?.role==='alert'));
  assert.equal(h.button('¥130を残高から精算する').props.disabled,false);
});
test('insufficient balance permits order review but prevents debit, and already settled/unready orders have no wallet action',async()=>{
  const h=fixture('components/admin/OrderBalancePayment.tsx',{order:{...order,user:{...order.user,balance:100}}});
  await h.click('利用者の残高から精算');assert.ok(h.all().some(n=>text(n).includes('¥30不足')));assert.equal(h.button('¥130を残高から精算する').props.disabled,true);assert.equal(h.calls.length,0);
  for(const patch of [{accounting_ready:false},{settled_at:'2026-10-19'},{payment_method:'balance'},{cash_confirmed_at:'2026-10-19'}]) {
    const view=fixture('components/admin/OrderBalancePayment.tsx',{order:{...order,...patch}});assert.equal(view.render(),null);
  }
});

test('confirmed success refreshes the order and disables further payment before the refresh completes',async()=>{
  const h=fixture('components/admin/OrderBalancePayment.tsx',{order});
  await h.click('利用者の残高から精算');h.change('精算理由','本人が残高支払いを希望');h.change('本人に確認し、この注文の現金をまだ受け取っていないことを確認しました',true);
  await h.click('¥130を残高から精算する');assert.equal(h.calls.length,1);assert.equal(h.refreshes(),1);assert.ok(h.all().some(n=>n.props?.role==='status'));assert.equal(h.all().filter(n=>n.type==='button').length,0);
});
