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

const user={id:'00000000-0000-4000-8000-000000000001',name:'架空の利用者',balance:1000};
const orders=Array.from({length:5},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,user_id:user.id,created_at:`2026-10-${String(i+1).padStart(2,'0')}T03:00:00Z`,accounting_ready:true,total_amount:130,points_used:0,payment_method:'deferred',payment_status:'completed',user,order_items:[{item_name:'緑茶2L',quantity:1}]}));
const confirmation='本人に確認し、選択したすべての注文の現金をまだ受け取っていないことを確認しました';
test('select all reviews five orders and the net total; returning preserves the same selection without submitting',async()=>{
 const h=fixture('components/admin/OrderBalanceCollection.tsx',{user,orders,returnTo:'/admin/transactions'});
 h.change('架空の利用者の未精算注文をすべて選択',true);assert.ok(h.all().some(n=>text(n).includes('5件選択 · 合計¥650')));
 await h.click('選択した注文を残高から精算');assert.ok(h.all().some(n=>text(n).includes('¥350')));assert.equal(h.calls.length,0);
 assert.equal(h.button('5件・¥650を残高から精算する').props.disabled,true);
 await h.click('選択に戻る');assert.ok(h.all().some(n=>text(n).includes('5件選択 · 合計¥650')));
});
test('uncertain response retries use the same operation ID and submit exactly one batch request per click',async()=>{
 const h=fixture('components/admin/OrderBalanceCollection.tsx',{user,orders,returnTo:'/admin/transactions'});
 h.change('架空の利用者の未精算注文をすべて選択',true);await h.click('選択した注文を残高から精算');h.change('一括精算の理由','本人から依頼');h.change(confirmation,true);h.setOk(false);
 const b=h.button('5件・¥650を残高から精算する');b.props.onClick();b.props.onClick();await flush();assert.equal(h.calls.length,1);assert.equal(h.refreshes(),0);
 await h.click('5件・¥650を残高から精算する');assert.equal(h.calls.length,2);assert.equal(h.calls[0].body.operation_id,h.calls[1].body.operation_id);assert.equal(h.calls[1].body.orders.length,5);
 h.setOk(true);await h.click('5件・¥650を残高から精算する');assert.equal(h.refreshes(),1);assert.ok(h.all().some(n=>n.props?.role==='status'));assert.equal(h.calls[2].body.operation_id,h.calls[0].body.operation_id);
});
test('another person and already paid orders never enter select-all; insufficient balance prevents execution',async()=>{
 const other={...orders[0],id:'other',user_id:'another'};const paid={...orders[0],id:'paid',settled_at:'2026-10-19'};
 const h=fixture('components/admin/OrderBalanceCollection.tsx',{user:{...user,balance:100},orders:[orders[0],other,paid],returnTo:'/admin/transactions'});
 h.change('架空の利用者の未精算注文をすべて選択',true);await h.click('選択した注文を残高から精算');assert.ok(h.all().some(n=>text(n).includes('選択した1件')));assert.equal(h.button('1件・¥130を残高から精算する').props.disabled,true);assert.equal(h.calls.length,0);
});
