const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {fixture,text,flush}=require('./helpers/ui-fixture.cjs');
const root=path.resolve(__dirname,'../..');
function load(file){
  const modules=new Map();
  function compile(file){
    if(modules.has(file))return modules.get(file).exports;
    const m={exports:{}};modules.set(file,m);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>compile(path.join(root,n.slice(2))+'.ts')});
    return m.exports;
  }
  return compile(path.join(root,file));
}
const component='app/admin/reimbursements/ReimbursementsClient.tsx';
const row=(id,extra={})=>({id,total_amount:600,payment_source:'personal_advance',reimbursement_status:'pending_reimbursement',vendor:'売店',note:'お茶の購入',created_at:'2026-11-20T00:00:00Z',purchased_by_user:{name:'立替者A'},created_by_user:{name:'記録者B'},purchase_run_items:[{item_name:'緑茶',quantity:2}],...extra});
const props={items:[{id:'tea',name:'緑茶'}],purchaseRuns:[row('a'),row('b',{total_amount:200,note:'紙コップ',purchase_run_items:[],purchased_by_user:{name:'立替者C'}}),row('c',{reimbursement_status:'reimbursed',total_amount:900})],miscExamples:['紙コップ']};
const ariaButton=(h,label)=>{const n=h.all().find(n=>n.type==='button'&&n.props['aria-label']===label);assert.ok(n,label);return n;};
const choose=async(h,label)=>{ariaButton(h,label).props.onClick();await h.effects();};

const uuid=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const payer=uuid(10), other=uuid(11);
const records=[row(uuid(100),{purchased_by:payer}),row(uuid(101),{purchased_by:payer,total_amount:200,note:'紙コップ',purchase_run_items:[]})];
const person={id:payer,name:'立替者A',records,total:800};
const batch='components/admin/ReimbursementBatch.tsx';
const open=async h=>{h.change('合計額の現金を立替者に渡したことを確認',true);};
test('pending advances group by actual payer UUID, never display name or recorder, and opening submits nothing',async()=>{
  const {groupPendingAdvances}=load('lib/reimbursements.ts');
  const source=[...records,row(uuid(102),{purchased_by:other}),row(uuid(103),{purchased_by:null}),row(uuid(104),{purchased_by:payer,reimbursement_status:'reimbursed'}),row(uuid(105),{purchased_by:payer,payment_source:'cashbox'})];
  const before=JSON.stringify(source),groups=groupPendingAdvances(source);
  assert.deepEqual(JSON.parse(JSON.stringify(groups.people.map(p=>[p.id,p.records.length,p.total]))),[[payer,2,800],[other,1,600]]);
  assert.equal(groups.unassigned.length,1);assert.equal(JSON.stringify(source),before);
  const h=fixture(batch,{person,onBusyChange(){},onRecorded(){}});assert.ok(text(h.render()).includes('選択中 2件'));assert.equal(h.calls.length,0);assert.equal(h.button('¥800の精算を記録').props.disabled,true);
});
test('all advances are selected by default; excluding one updates the single payout; other payers cannot leak into it',async()=>{
  let receipt;const h=fixture(batch,{person:{...person,records:[...records,row(uuid(102),{purchased_by:other})]},onBusyChange(){},onRecorded:r=>receipt=r});
  h.change('紙コップ ¥200を精算対象にする',false);await open(h);
  h.setResponder(async call=>({ok:true,json:async()=>({ok:true,operation_id:call.body.operation_id,recipient_id:payer,count:1,amount:600})}));
  await h.click('¥600の精算を記録');assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,`/api/admin/users/${payer}/reimbursements`);
  assert.deepEqual(h.calls[0].body.runs,[{id:uuid(100),expected_amount:600}]);assert.equal(receipt.amount,600);assert.equal(receipt.items.length,1);assert.equal(h.refreshes(),1);
});
test('one payout is one request with both quotes; uncertain response retries the same operation and rejects mismatched success',async()=>{
  let receipt,reply;const h=fixture(batch,{person,onBusyChange(){},onRecorded:r=>receipt=r});await open(h);
  h.setResponder(()=>new Promise(resolve=>reply=resolve));h.button('¥800の精算を記録').props.onClick();h.button('記録中…').props.onClick();assert.equal(h.calls.length,1);
  reply({ok:true,json:async()=>{throw Error('lost response')}});await flush();assert.equal(receipt,undefined);
  h.setResponder(async call=>({ok:true,json:async()=>({ok:true,operation_id:call.body.operation_id,recipient_id:other,count:2,amount:800})}));await h.click('¥800の精算を記録');assert.equal(receipt,undefined);
  h.setResponder(async call=>({ok:true,json:async()=>({ok:true,operation_id:call.body.operation_id,recipient_id:payer,count:2,amount:800})}));await h.click('¥800の精算を記録');
  assert.equal(new Set(h.calls.map(c=>c.body.operation_id)).size,1);assert.deepEqual(h.calls[0].body.runs,records.map(r=>({id:r.id,expected_amount:r.total_amount})));assert.equal(receipt.items.length,2);
});
test('person workspace links an old unpaid purchase URL to the entire payer without issuing writes',()=>{
  const h=fixture('components/admin/AdvancePeopleWorkspace.tsx',{records,keyword:'',disabled:false,onBusyChange(){},onRecorded(){}},`?run=${records[0].id}`);
  const child=h.all().find(n=>n.props?.person);assert.equal(child.props.person.total,800);assert.equal(child.props.person.records.length,2);assert.equal(h.calls.length,0);
});

test('all purchase shortcuts use one editor, preserving payment source and product selection without a write',async()=>{
 const item='00000000-0000-4000-8000-000000000010';
 const h=fixture(component,{...props,items:[{id:item,name:'水',is_unlimited_stock:false}]},`?record=purchase&item=${item}&source=cashbox&returnTo=%2Fadmin%2Fitems%3Fq%3Dwater`);const editor=h.all().find(n=>n.props?.draft);assert.equal(editor.props.draft.purchases[0].source,'cashbox');assert.equal(editor.props.draft.purchases[0].lines[0].itemId,item);assert.equal(h.calls.length,0);assert.ok(h.all().some(n=>n.props?.href==='/admin/items?q=water'));
 const misc=fixture(component,props,'?record=purchase&misc=1');assert.equal(misc.all().find(n=>n.props?.draft).props.draft.purchases[0].lines[0].kind,'expense');
});

test('payer identity is not replaced by a different recorder when the payer relationship exists but is missing',()=>{
  const {reimbursementOwner}=load('lib/reimbursements.ts');
  assert.equal(reimbursementOwner(row('a')),'立替者A');
  assert.equal(reimbursementOwner(row('a',{purchased_by_user:null})),'立替者未登録');
  const legacy=row('a');delete legacy.purchased_by_user;
  assert.equal(reimbursementOwner(legacy),'記録者B');
});

function database(source,failure=null){
  const calls=[];
  return {calls,from(table){
    const filters=[];let from=0,to=Infinity,withCount=false;
    const q={select(_fields,options){withCount=options?.count==='exact';return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},range(a,b){from=a;to=b;return q;},
      maybeSingle:async()=>{calls.push({filters,from,to});return {error:failure,data:source.find(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v))??null};},
      then(resolve,reject){
        calls.push({filters,from,to});let rows=source.filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v)).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
        const count=rows.length,cap=filters.some(([k,v])=>k==='reimbursement_status'&&v==='pending_reimbursement')?137:Infinity;
        rows=rows.slice(from,Math.min(to+1,from+cap));
        return Promise.resolve({error:failure,data:failure?null:rows,count:withCount?count:null}).then(resolve,reject);
      },insert(){throw Error('Read-only');},update(){throw Error('Read-only');},delete(){throw Error('Read-only');}};
    return q;
  }};
}
test('old pending advances beyond the recent forty and above a server row cap remain present once on every archive page',async()=>{
  const uuid=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
  const settled=Array.from({length:65},(_,i)=>row(uuid(i),{reimbursement_status:'reimbursed',created_at:new Date(Date.UTC(2026,0,1)+i*1000).toISOString()}));
  const pending=Array.from({length:1105},(_,i)=>row(uuid(i+1000),{created_at:'2021-01-01T00:00:00Z'}));
  const source=[...settled,...pending,row(uuid(9000),{payment_source:'cashbox'}),row(uuid(9001),{reimbursement_status:'not_needed'})],before=JSON.stringify(source);
  const {readReimbursements}=load('lib/reimbursement-queries.ts');
  const db=database(source),first=await readReimbursements(db);
  assert.equal(first.purchaseRuns.length,1145);assert.equal(first.hasMoreHistory,true);
  assert.equal(new Set(first.purchaseRuns.map(row=>row.id)).size,1145);
  assert.ok(first.purchaseRuns.some(row=>row.id===uuid(9001)));
  assert.equal(first.purchaseRuns.some(row=>row.id===uuid(9000)),false);
  const second=await readReimbursements(db,{page:'2'});
  assert.equal(second.purchaseRuns.length,1131);assert.equal(second.hasMoreHistory,false);
  assert.equal(second.purchaseRuns.filter(row=>row.reimbursement_status==='pending_reimbursement').length,1105);
  const linked=await readReimbursements(db,{run:settled[0].id});assert.equal(linked.purchaseRuns[0].id,settled[0].id);
  assert.equal(JSON.stringify(source),before);
});
test('reimbursement query errors are visible failures, not a zero pending total',async()=>{
  const {readReimbursements}=load('lib/reimbursement-queries.ts'),error={message:'database unavailable'};
  await assert.rejects(()=>readReimbursements(database([],error)),cause=>cause===error);
});

test('a receipt deep link restores the whole payout; an old run URL stays on the person receipt after success',()=>{
  const receipt={operation_id:uuid(500),recipient_id:payer,recipient_name:'立替者A',amount:800,items:records.map(r=>({id:r.id,title:r.note,amount:r.total_amount}))};
  const h=fixture('components/admin/AdvancePeopleWorkspace.tsx',{records,keyword:'',disabled:false,onBusyChange(){},onRecorded(){}},`?run=${records[0].id}`);
  h.all().find(n=>n.props?.person).props.onRecorded(receipt);
  assert.ok(h.all().some(n=>n.props?.role==='status'&&text(n).includes('立替者Aへの精算を記録しました')));
  const saved=fixture('components/admin/AdvancePeopleWorkspace.tsx',{records:[],receipt,keyword:'',disabled:false,onBusyChange(){},onRecorded(){}},`?receipt=${receipt.operation_id}`);
  assert.ok(saved.all().some(n=>n.props?.role==='status'&&text(n).includes('2件をまとめて精算済み')));assert.equal(saved.calls.length,0);
});
test('receipt lookup reads only the requested UUID and does not swallow failures',async()=>{
  const {readAdvanceReceipt}=load('lib/reimbursement-queries.ts');let calls=0;const receipt={operation_id:uuid(500),amount:800};
  const db={from(table){calls++;assert.equal(table,'advance_reimbursement_batches');return{select(){return this},eq(k,v){assert.equal(k,'operation_id');assert.equal(v,receipt.operation_id);return this},async maybeSingle(){return{data:receipt}}}}};
  assert.equal(await readAdvanceReceipt(db,'invalid'),null);assert.equal(calls,0);assert.equal(await readAdvanceReceipt(db,receipt.operation_id),receipt);
  const fail={from(){return{select(){return this},eq(){return this},async maybeSingle(){return{error:new Error('unavailable')}}}}};await assert.rejects(()=>readAdvanceReceipt(fail,receipt.operation_id),/unavailable/);
});

test('SSR and client reuse the same purchase identifiers without mutating the seed or losing URL preselection',()=>{
 const line={id:uuid(702),itemId:'',quantity:'1',amount:'',price:{mode:'total',unit:'',total:''}},initialDraft={purchases:[{id:uuid(701),lines:[line],scope:'both',pricing:'lines',linePricing:'lines',source:'personal_advance',vendor:'',purchasedOn:'',receivedOn:'',total:'',adjustment:'',otherPayer:false,payer:'',note:''}]};const before=JSON.stringify(initialDraft);const input={...props,initialDraft};const query=`?record=purchase&item=${uuid(10)}`;
 const server=fixture(component,input,query).all().find(n=>n.props?.draft).props.draft;const client=fixture(component,input,query).all().find(n=>n.props?.draft).props.draft;assert.equal(server.purchases[0].id,client.purchases[0].id);assert.equal(server.purchases[0].lines[0].id,client.purchases[0].lines[0].id);assert.equal(client.purchases[0].lines[0].itemId,uuid(10));assert.equal(JSON.stringify(initialDraft),before);const unlimited=fixture(component,{...input,items:[{id:uuid(10),name:'在庫管理なし',is_unlimited_stock:true}]},query).all().find(n=>n.props?.draft).props.draft;assert.equal(unlimited.purchases[0].lines[0].addStock,false);
});
