'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Item} from '@/types';
import {RestockSubmission} from '@/lib/restock';
import {emptyIntake,emptyPurchase,emptyIntakeLine,isBlankIntakeLine,intakePayload,intakeLineAmount,purchaseAmount,intakeAdjustment,linePrice,linePriceValue,purchaseQuantity,matchesStockIntake,type IntakeDraft,type PurchaseDraft,type StockIntakeInput,type StockIntakeResult} from '@/lib/stock-intakes';
import type {PriceMode} from '@/lib/purchase-lines';
import {readIntegerInput,normalizeIntegerInput,stepQuantity} from '@/lib/numeric-input';
import {money} from './ObjectRelatedRecords';
export const emptyStockDraft=emptyIntake;
export type StockDraft=IntakeDraft;
const stockColumns='sm:grid-cols-[minmax(0,1fr)_7rem]';
const purchaseColumns='sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6.5rem]';
const field='block w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white disabled:opacity-40';
export default function StockReceiptEditor({items,draft,onChange,onBusyChange,onRecorded,submission,defaultSource,miscExamples=[]}:{items:(Pick<Item,'id'|'name'>&{is_unlimited_stock?:boolean})[];draft:IntakeDraft;onChange:(draft:IntakeDraft)=>void;onBusyChange:(busy:boolean)=>void;onRecorded:(receipt:StockIntakeResult)=>void;submission:RestockSubmission;defaultSource?:PurchaseDraft['source'];miscExamples?:string[]}){
 const panel=useRef<HTMLElement>(null),focusRequest=useRef<{lineId:string;field:string}|null>(null),busy=useRef(false),pending=useRef<StockIntakeInput|null>(null);
 const router=useRouter();
 const [review,setReview]=useState(false),[loading,setLoading]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[errorOwner,setErrorOwner]=useState<string|null>(null);
 const [payers,setPayers]=useState<{id:string;name:string}[]>([]),[payerError,setPayerError]=useState(''),[payerRetry,setPayerRetry]=useState(0);
 const locked=loading||uncertain;
 useEffect(()=>{const request=focusRequest.current;if(request&&panel.current){const control=panel.current.querySelector<HTMLInputElement>(`[data-line-id="${request.lineId}"] [data-field="${request.field}"]`);if(control){control.focus();if(control instanceof HTMLInputElement)control.select();focusRequest.current=null;}}},[draft,review]);
 useEffect(()=>{if(errorOwner&&!review){const alert=panel.current?.querySelector<HTMLElement>(`[data-purchase-id="${errorOwner}"] [role="alert"]`);alert?.scrollIntoView({block:'nearest'});alert?.focus({preventScroll:true});}},[error,errorOwner,review]);
 const payerNeeded=draft.purchases.some(p=>p.scope!=='stock'&&p.source==='personal_advance'&&p.otherPayer);
 useEffect(()=>{if(!payerNeeded)return;let current=true;setPayerError('');fetch('/api/admin/stock-payers').then(async r=>{const d=await r.json();if(!r.ok||!Array.isArray(d.users))throw Error(d.error??'立替者を読み込めませんでした');if(current)setPayers(d.users);}).catch(e=>{if(current)setPayerError(e.message);});return()=>{current=false;};},[payerNeeded,payerRetry]);
 const replace=(p:PurchaseDraft)=>{if(!busy.current&&!uncertain)onChange({purchases:draft.purchases.map(r=>r.id===p.id?p:r)});};
 const change=(p:PurchaseDraft,patch:Partial<PurchaseDraft>)=>replace({...p,...patch});
 const line=(p:PurchaseDraft,id:string,patch:Partial<PurchaseDraft['lines'][number]>)=>change(p,{lines:p.lines.map(r=>r.id===id?{...r,...patch}:r)});

 function editLinePrice(p: PurchaseDraft, lineId: string, mode: PriceMode, value: string) {
  line(p, lineId, {
   amount: '',
   price: { mode, total: mode === 'total' ? value : '', unit: mode === 'unit' ? value : '' },
  });
 }

 function editReceiptTotal(p: PurchaseDraft, total: string) {
  const pricing = total.trim() ? 'receipt' : p.linePricing;
  // Preserve the meaning of amounts in older drafts when changing receipt mode.
  const lines = pricing === p.pricing ? p.lines : p.lines.map(row => row.price ? row : { ...row, price: linePrice(p, row) });
  change(p, { total, pricing, lines });
 }
 function appendLine(p:PurchaseDraft){if(locked)return;const next=emptyIntakeLine();focusRequest.current={lineId:next.id,field:'product'};change(p,{lines:[...p.lines,next]});}
 function appendPurchase(){if(locked)return;const next=emptyPurchase(defaultSource);focusRequest.current={lineId:next.lines[0].id,field:'product'};onChange({purchases:[...draft.purchases,next]});}
 function move(p:PurchaseDraft,row:PurchaseDraft['lines'][number],fieldName:'price'|'quantity'|'next'){
  if(fieldName!=='next'){focusRequest.current={lineId:row.id,field:fieldName};const control=panel.current?.querySelector<HTMLInputElement>(`[data-line-id="${row.id}"] [data-field="${fieldName}"]`);if(control){control.focus();control.select();focusRequest.current=null;}return;}
  if((row.kind==='expense'?!row.label?.trim():!row.itemId)||!Number.isFinite(purchaseQuantity(row))||p.scope!=='stock'&&!(p.pricing==='receipt'&&!linePriceValue(p,row).trim())&&intakeLineAmount(p,row)===null){setError('買ったもの・購入数・金額を確認してください');setErrorOwner(p.id);return;}
  const next=p.lines[p.lines.indexOf(row)+1];if(next){panel.current?.querySelector<HTMLElement>(`[data-line-id="${next.id}"] [data-field="product"]`)?.focus();}else appendLine(p);
 }
 const report=(e:unknown)=>{setError((e as Error).message);setErrorOwner((e as any)?.receiptId??null);setReview(false);};
 function validate(){for(const p of draft.purchases)for(const r of p.lines){if(isBlankIntakeLine(r))continue;if(r.kind==='expense')continue;const item=items.find(i=>i.id===r.itemId);if(!item||(p.scope==='stock'||p.scope==='both'&&r.addStock!==false)&&item.is_unlimited_stock){const e=new Error('商品を選んでください') as Error&{receiptId:string};e.receiptId=p.id;throw e;}}return intakePayload(draft);}
 const totals=draft.purchases.reduce((v,p)=>{const lines=p.lines.filter(r=>!isBlankIntakeLine(r)),amount=purchaseAmount(p);if(Number.isFinite(amount))v.amount+=amount;else{v.incomplete=true;if(p.scope!=='stock')v.amount+=lines.reduce((sum,r)=>sum+(intakeLineAmount(p,r)??0),0);}if(lines.some(r=>r.kind==='expense'?!r.label?.trim():!r.itemId))v.incomplete=true;if(p.scope!=='purchase')for(const r of lines){const q=purchaseQuantity(r);if(r.kind!=='expense'&&(p.scope==='stock'||r.addStock!==false)&&r.itemId&&Number.isInteger(q)&&q>0)v.stock.set(r.itemId,(v.stock.get(r.itemId)??0)+q);}return v;},{amount:0,incomplete:false,stock:new Map<string,number>()});
 const meaningful=draft.purchases.flatMap(p=>p.lines.filter(r=>!isBlankIntakeLine(r))),showStockSummary=draft.purchases.length>1||new Set(meaningful.filter(r=>r.kind!=='expense').map(r=>r.itemId)).size<meaningful.filter(r=>r.kind!=='expense').length||meaningful.some(r=>r.addStock===false);
 async function save(){
  if(busy.current)return;let payload;try{payload=pending.current??validate();}catch(e){report(e);return;}
  const requestId=submission.requestId(payload);let unresolved=Boolean(pending.current),status=0;busy.current=true;setLoading(true);onBusyChange(true);setError('');
  try{const response=await fetch('/api/admin/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,request_id:requestId})});status=response.status;const result=await response.json().catch(()=>null);if(!response.ok||!matchesStockIntake(result,payload,requestId))throw Error(result?.error??'登録結果を確認できませんでした。同じ内容で再試行できます');unresolved=false;pending.current=null;setUncertain(false);submission.complete(payload);onRecorded(result);router.refresh();}
  catch(e){unresolved=unresolved||status===0||status<400||status>=500&&status!==503;if(unresolved){pending.current=payload;setUncertain(true);}setError((e as Error).message);}finally{busy.current=false;setLoading(false);onBusyChange(unresolved);}
 }
 const selectAll=(e:React.FocusEvent<HTMLInputElement>)=>e.currentTarget.select();
 const enter=(e:React.KeyboardEvent,p:PurchaseDraft,r:PurchaseDraft['lines'][number],next:'quantity'|'next')=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();move(p,r,next);}if(next==='next'&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();line(p,r.id,{quantity:stepQuantity(r.quantity,e.key==='ArrowUp'?1:-1)});}};
 return <section ref={panel} aria-label="買ったもの・金額・数量の入力" className="space-y-4">
  {!review && <p className="text-xs text-gray-400">商品は1点として売る単位で数えます。</p>}
  {draft.purchases.map((p,pi)=><section key={p.id} data-purchase-id={p.id} aria-label={`買い物${pi+1}`} className={draft.purchases.length>1?'space-y-3 rounded-lg border border-gray-700 p-3':'space-y-3'}>
   {draft.purchases.length>1&&<div className="flex items-center justify-between text-sm"><h3 className="font-semibold text-white">{p.vendor||`買い物${pi+1}`}{p.purchasedOn&&<small className="ml-2 text-gray-400">{p.purchasedOn}</small>}</h3>{!review&&<button type="button" disabled={locked} onClick={()=>onChange({purchases:draft.purchases.filter(r=>r.id!==p.id)})} className="text-xs text-gray-400 underline">この買い物を外す</button>}</div>}
   {error&&errorOwner===p.id&&<p tabIndex={-1} role="alert" className="text-sm text-amber-300">{error}</p>}
   {review ? <>
    <p className="text-xs text-gray-400">{p.scope==='stock'?'在庫のみ':p.source==='cashbox'?'金庫払い':`立替：${p.otherPayer?payers.find(u=>u.id===p.payer)?.name??'指定した人':'自分'}`}{p.vendor&&` · ${p.vendor}`}{p.purchasedOn&&` · ${p.purchasedOn}`}{p.scope==='purchase'&&' · 商品の在庫追加なし'}</p>
    {p.scope!=='stock'&&<p className="text-xs text-gray-400">{p.scope!=='purchase'&&p.lines.some(r=>r.kind!=='expense'&&r.itemId&&r.addStock!==false)?'今回の入荷分だけ在庫に追加します。備品・追加済みの分は含めません。':'今回は商品の在庫を変更しません。'}</p>}
    <ul className="divide-y divide-gray-700">{p.lines.filter(r=>!isBlankIntakeLine(r)).map(r => {
     const amount = p.scope === 'stock' ? null : intakeLineAmount(p, r);
     const quote = linePrice(p, r);
     return <li key={r.id} className="flex justify-between gap-4 py-3 text-sm">
      <span className="min-w-0 text-white">
       {r.kind === 'expense' ? r.label : items.find(item => item.id === r.itemId)?.name} · {purchaseQuantity(r).toLocaleString('ja-JP')}個
       {amount !== null && quote.mode === 'unit' && <small className="ml-2 text-gray-400">
        単価 {money(readIntegerInput(quote.unit, 'money'))}
       </small>}
      </span>
      {p.scope !== 'stock' && <span className="shrink-0 font-mono text-white">{amount === null ? '—' : money(amount)}</span>}
     </li>;
    })}</ul>
    {p.scope!=='stock'&&Number.isFinite(intakeAdjustment(p))&&intakeAdjustment(p)!==0&&<p className="text-right text-xs text-gray-400">{p.pricing==='receipt'?'明細との差額':'送料・値引き等'} {money(intakeAdjustment(p))}</p>}
    {p.scope!=='stock'&&draft.purchases.length>1&&<p className="text-right font-mono text-white">{money(purchaseAmount(p))}</p>}
   </> : <>
    <div className={`hidden gap-3 pr-8 text-xs text-gray-400 sm:grid ${p.scope==='stock' ? stockColumns : purchaseColumns}`}>
     <span>{p.scope==='stock' ? '商品' : '買ったもの'}</span>
     {p.scope!=='stock' && <span>金額（税込・円）は片方に入力</span>}
     <span>{p.scope==='stock' ? '追加する個数' : '個数'}</span>
    </div>
    <div className="space-y-3">{p.lines.map((r,i)=>{
     const quantity = purchaseQuantity(r);
     const quote = linePrice(p, r);
     const automaticTotal = quote.mode === 'unit' ? intakeLineAmount(p, r) : null;
     const firstPrice = quote.mode === 'unit' && quote.unit.trim() ? 'unit' : 'total';
     const prefix = `買い物${pi+1} 明細${i+1}`;
     return <div key={r.id} data-line-id={r.id} className={`relative grid grid-cols-2 items-end gap-3 border-b border-gray-800 pb-3 pr-8 ${p.scope==='stock' ? stockColumns : purchaseColumns}`}>
     {r.kind==='expense'?<label className="col-span-2 min-w-0 sm:col-span-1"><span className="sr-only">備品・雑費名</span><input data-field="product" data-autofocus={pi===0&&i===0&&!r.itemId?true:undefined} aria-label={`${prefix}の備品・雑費名`} value={r.label??''} disabled={locked} list={`supplies-${p.id}`} placeholder="備品・雑費名（例：ペーパータオル）" onChange={e=>line(p,r.id,{label:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();move(p,r,p.pricing==='receipt'?'quantity':'price');}}} className={field}/></label>:<select data-field="product" data-autofocus={pi===0&&i===0&&!r.itemId?true:undefined} aria-label={`${prefix}の商品`} value={r.itemId} disabled={locked} onChange={e=>{focusRequest.current={lineId:r.id,field:e.target.value==='__expense__'?'product':p.scope==='stock'||p.pricing==='receipt'?'quantity':'price'};line(p,r.id,e.target.value==='__expense__'?{kind:'expense',itemId:'',addStock:false}:{itemId:e.target.value,addStock:!items.find(i=>i.id===e.target.value)?.is_unlimited_stock});}} className={`col-span-2 sm:col-span-1 ${field}`}><option value="">商品を選ぶ</option>{p.scope!=='stock'&&<option value="__expense__">商品以外（備品・雑費）</option>}{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
     {p.scope !== 'stock' ? <div className="col-span-2 grid min-w-0 grid-cols-2 items-end gap-2 sm:col-span-1">
      {(['total', 'unit'] as const).map(mode => {
       const calculated = mode === 'total' && automaticTotal !== null;
       const label = mode === 'total' ? '合計金額' : '単価';
       return <label key={mode} className="block min-w-0 space-y-1 text-xs text-gray-300">
        <span>{label}{calculated && <span className="ml-1 text-gray-400">（自動）</span>}</span>
        <input
         data-field={mode === 'total' ? 'price' : 'unit-price'}
         data-autofocus={pi === 0 && i === 0 && Boolean(r.itemId) && mode === firstPrice ? true : undefined}
         aria-label={`${prefix}の${label}`}
         type="text"
         inputMode="numeric"
         autoComplete="off"
         value={quote.mode === mode ? quote[mode] : ''}
         disabled={locked}
         placeholder={calculated ? automaticTotal.toLocaleString('ja-JP') : '円'}
         onFocus={selectAll}
         onChange={event => editLinePrice(p, r.id, mode, event.target.value)}
         onBlur={event => {
          const value = event.target.value;
          const normalized = normalizeIntegerInput(value, 'money');
          if (quote.mode === mode && normalized !== value) editLinePrice(p, r.id, mode, normalized);
         }}
         onKeyDown={event => enter(event, p, r, 'quantity')}
         className={`${field} tabular-nums ${calculated ? 'placeholder:text-gray-300' : ''}`}
        />
       </label>;
      })}
     </div> : null}

     <label className="min-w-0 space-y-1 text-xs text-gray-300">
      <span className="sm:sr-only">{p.scope==='stock' ? '追加する個数' : '個数'}</span>
      <input data-field="quantity" data-autofocus={pi===0&&i===0&&Boolean(r.itemId)&&p.scope==='stock'?true:undefined}
        aria-label={`${prefix}の個数`} type="text" inputMode="numeric" autoComplete="off" value={r.quantity} disabled={locked}
        onFocus={selectAll} onChange={event=>line(p,r.id,{quantity:event.target.value})}
        onBlur={event=>line(p,r.id,{quantity:normalizeIntegerInput(event.target.value)})}
        onKeyDown={event=>enter(event,p,r,'next')} className={`${field} text-right tabular-nums`}/>
     </label>
     <button type="button" aria-label={`${prefix}を外す`} disabled={locked} onClick={()=>change(p,{lines:p.lines.filter(l=>l.id!==r.id)})} className="absolute right-0 top-2 rounded px-2 py-2 text-sm text-gray-500 hover:text-white">×</button>
     {p.scope==='both'&&r.itemId&&r.kind!=='expense'&&
      <label className="col-span-full flex items-center gap-2 text-xs text-gray-400">
       <input type="checkbox" aria-label={`${prefix}を在庫に追加`} checked={r.addStock!==false}
         disabled={locked||Boolean(items.find(item=>item.id===r.itemId)?.is_unlimited_stock)}
         onChange={event=>line(p,r.id,{addStock:event.target.checked})}/>
       {r.addStock===false?'今回は在庫に追加しない':`在庫へ＋${Number.isFinite(quantity)?quantity:'—'}個`}
      </label>}


    </div>;})}</div>
    <datalist id={`supplies-${p.id}`}>{miscExamples.map(name=><option key={name} value={name}/>)}</datalist>
    <button type="button" disabled={locked} aria-label={`買い物${pi+1}に商品を追加`} onClick={()=>appendLine(p)} className="text-sm text-sky-300 hover:underline">＋ 明細を追加</button>
    {p.scope !== 'stock' && <label className="block max-w-xs space-y-1 text-xs text-gray-300">
     <span>レシート合計（税込・円）</span>
     <input
      aria-label={`買い物${pi+1}のレシート合計`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={p.pricing === 'receipt' ? p.total : ''}
      disabled={locked}
      placeholder="空欄なら明細を合計"
      onFocus={selectAll}
      onChange={event => editReceiptTotal(p, event.target.value)}
      onBlur={event => {
       const value = event.target.value;
       const normalized = normalizeIntegerInput(value, 'money');
       if (normalized !== value) editReceiptTotal(p, normalized);
      }}
      className={field}
     />
     {p.pricing === 'receipt' && p.total.trim() && Number.isFinite(readIntegerInput(p.total, 'money')) && <span className="block text-gray-400">
      {p.lines.some(row => !isBlankIntakeLine(row) && intakeLineAmount(p,row) === null)
       ? '金額が分からない明細は空欄で記録できます。'
       : `明細との差額 ${money(intakeAdjustment(p))}`}
     </span>}
    </label>}
    <details className="border-t border-gray-800 pt-3"><summary className="cursor-pointer text-xs text-gray-400">{p.scope==='stock'?'在庫のみ':p.source==='cashbox'?'金庫払い':p.otherPayer?'代理で立替記録':'自分の立替'} · {p.vendor||'購入先・日付など'}{p.purchasedOn&&` · ${p.purchasedOn}`}</summary><div className="mt-3 space-y-3">
     <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-gray-400">購入先<input aria-label={`買い物${pi+1}の購入先`} value={p.vendor} disabled={locked} onChange={e=>change(p,{vendor:e.target.value})} className={field}/></label><label className="text-xs text-gray-400">支払元<select aria-label={`買い物${pi+1}の支払元`} value={p.source} disabled={locked} onChange={e=>change(p,{source:e.target.value as PurchaseDraft['source']})} className={field}><option value="cashbox">金庫</option><option value="personal_advance">個人立替</option></select></label><label className="text-xs text-gray-400">購入日<input aria-label={`買い物${pi+1}の購入日`} type="date" value={p.purchasedOn} disabled={locked} onChange={e=>change(p,{purchasedOn:e.target.value})} className={field}/></label><label className="text-xs text-gray-400">入荷日<input aria-label={`買い物${pi+1}の入荷日`} type="date" value={p.receivedOn} disabled={locked} onChange={e=>change(p,{receivedOn:e.target.value})} className={field}/></label></div>
     {p.source==='personal_advance'&&<><label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={p.otherPayer} disabled={locked} onChange={e=>change(p,{otherPayer:e.target.checked})}/>別の人が立て替えた買い物</label>{p.otherPayer&&<select aria-label={`買い物${pi+1}の立替者`} value={p.payer} disabled={locked} onChange={e=>change(p,{payer:e.target.value})} className={field}><option value="">立替者を選ぶ</option>{payers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}</>}
     <label className="block text-xs text-gray-400">記録する内容<select aria-label={`買い物${pi+1}の記録内容`} value={p.scope} disabled={locked} onChange={e=>change(p,{scope:e.target.value as PurchaseDraft['scope']})} className={field}><option value="both">購入と商品の在庫追加</option><option value="stock" disabled={p.lines.some(r=>r.kind==='expense')}>在庫のみ</option><option value="purchase">購入のみ（在庫は追加しない）</option></select></label>

     <label className="block text-xs text-gray-400">送料・値引き・税額など<input aria-label={`買い物${pi+1}の送料・値引き`} type="text" inputMode="numeric" value={p.pricing==='receipt'&&p.lines.filter(r=>!isBlankIntakeLine(r)).every(r=>intakeLineAmount(p,r)!==null)?(Number.isFinite(intakeAdjustment(p))?String(intakeAdjustment(p)):''):p.adjustment} disabled={locked||p.pricing==='receipt'&&p.lines.filter(r=>!isBlankIntakeLine(r)).every(r=>intakeLineAmount(p,r)!==null)} onFocus={selectAll} onChange={e=>change(p,{adjustment:e.target.value})} onBlur={e=>change(p,{adjustment:normalizeIntegerInput(e.target.value,'signed')})} placeholder="値引きはマイナス" className={field}/></label>
     <label className="block text-xs text-gray-400">メモ<textarea aria-label={`買い物${pi+1}のメモ`} rows={2} value={p.note} disabled={locked} onChange={e=>change(p,{note:e.target.value})} className={field}/></label>
    </div></details>
   </>}
  </section>)}
  {!review&&<div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-3"><button type="button" disabled={locked||draft.purchases.length>=50} onClick={appendPurchase} className="text-xs text-gray-400 hover:underline">＋ 別の店・日付の買い物</button><span className="text-xs text-gray-500">Enterで次の欄へ</span></div>}
  {review&&showStockSummary&&<section className="rounded-lg bg-gray-800 p-3"><h3 className="text-xs text-gray-400">在庫に追加する合計</h3>{Array.from(totals.stock).map(([id,q])=><p key={id} className="mt-2 flex justify-between gap-3 text-sm text-gray-300"><span>{items.find(i=>i.id===id)?.name}</span><span className="font-mono">＋{q}個</span></p>)}{!totals.stock.size&&<p className="mt-2 text-xs text-gray-400">在庫は変更しません。</p>}</section>}
  {error&&(!errorOwner||review)&&<p role="alert" className="text-sm text-amber-300">{error}</p>}{payerError&&<p role="alert" className="text-xs text-amber-300">{payerError} <button type="button" onClick={()=>setPayerRetry(n=>n+1)} className="underline">再読み込み</button></p>}{uncertain&&<p className="text-xs text-amber-300">登録結果が未確認です。内容を変えずに同じ登録を再試行してください。</p>}
  <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 bg-gray-900 py-4">{draft.purchases.every(p=>p.scope==='stock') ? <p className="text-sm text-gray-300">在庫に追加する商品 {totals.stock.size}件</p>
    : <div><p className="text-xs text-gray-400">{totals.incomplete?'入力済みの合計':'合計'}</p><p className="mt-1 font-mono text-2xl text-white">{money(totals.amount)}</p></div>}<div className="flex gap-3">{review&&<button type="button" disabled={locked} onClick={()=>setReview(false)} className="px-3 py-2 text-sm text-gray-300">入力に戻る</button>}<button type="button" disabled={loading||!draft.purchases.length} onClick={()=>{if(review)void save();else try{validate();setReview(true);setError('');}catch(e){report(e);}}} className="rounded-lg bg-white px-4 py-2.5 text-sm text-gray-950 disabled:opacity-40">{loading?'登録中…':review?'まとめて登録':'登録内容を確認'}</button></div></footer>
 </section>;
}
