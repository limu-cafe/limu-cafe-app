const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const root = process.env.LIMU_TEST_ROOT || path.resolve(__dirname, '../../..');
const text = n => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n);
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children), ...nodes(n.props?.collection), ...nodes(n.props?.detail)];
const flush = () => new Promise(setImmediate);
function fixture(file, props, query='', extraMocks={}, exportName='default') {
  let cursor=0, refreshes=0, ok=true, responder=null; const hooks=[], effects=[], calls=[], errors=[];
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
    vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,URL,URLSearchParams,crypto:require('node:crypto').webcrypto,console,confirm:()=>true,window:{location,history:{pushState(_s,_t,url){location.href=String(url);},replaceState(_s,_t,url){location.href=String(url);}}},fetch:async(url,options={})=>{calls.push({url,method:options.method??'GET',body:options.body?JSON.parse(options.body):undefined});if(responder)return responder(calls[calls.length-1]);return{ok,status:ok?200:400,json:async()=>ok?{ok:true,members:props.members??[]}: {error:'failed'}};}});
    return module.exports;
  }
  const Component=load(path.join(root,file))[exportName];
  const render=()=>{cursor=0;return Component(props);};
  const all=()=>nodes(render());
  const button=label=>{const n=all().find(n=>n.type==='button'&&text(n)===label);assert.ok(n,'Missing button: '+label);return n;};
  const field=label=>{const list=all();const direct=list.find(n=>['input','textarea','select'].includes(n.type)&&(n.props['aria-label']===label||n.props.placeholder===label));if(direct)return direct;const l=list.find(n=>n.type==='label'&&text(n).startsWith(label));const n=nodes(l).find(n=>['input','textarea','select'].includes(n.type));assert.ok(n,'Missing field: '+label);return n;};
  return {render,all,button,field,calls,errors,setResponder:fn=>{responder=fn;},setOk:v=>{ok=v;},setQuery:q=>{location.href='http://localhost/admin/test'+q;},refreshes:()=>refreshes,change(label,value){field(label).props.onChange({target:{value,checked:value}});},async effects(){render();while(effects.length)effects.shift()();await flush();render();},async submit(){all().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flush();},async click(label){await button(label).props.onClick();await flush();}};
}

module.exports={fixture,text,nodes,flush};
