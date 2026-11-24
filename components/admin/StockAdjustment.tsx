'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Item} from '@/types';
export default function StockAdjustment({item}:{item:Item}){
 const router=useRouter(),busy=useRef(false),attempt=useRef<{signature:string;id:string;stock:number}|null>(null);
 const [kind,setKind]=useState('discard'),[value,setValue]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[done,setDone]=useState(false),[uncertain,setUncertain]=useState(false);
 const locked=loading||uncertain;
 if(item.is_unlimited_stock)return null;
 const n=Number(value),after=item.stock-n,valid=value.trim()!==''&&Number.isInteger(n)&&n>=1&&n<=2147483647&&after>=0;
 async function save(){
  if(busy.current)return;if(!uncertain&&(!valid||!note.trim())){setError('数量と理由を入力してください');return;}
  const signature=JSON.stringify([item.id,kind,n,note.trim()]);
  if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID(),stock:item.stock};
  const op=attempt.current;let responseStatus=0;busy.current=true;setLoading(true);setError('');
  try{const response=await fetch('/api/admin/stock-adjustments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:op.id,item_id:item.id,kind,value:n,expected_stock:op.stock,note})});responseStatus=response.status;const result=await response.json().catch(()=>null);
   if(!response.ok||!result?.ok||result.request_id!==op.id||result.item_id!==item.id||result.stock_before!==op.stock||result.stock_after!==op.stock-n){if([400,404,409].includes(response.status)){attempt.current=null;setUncertain(false);}throw Error(result?.error??'保存結果を確認できませんでした。同じ内容で再試行できます');}
   setDone(true);setUncertain(false);attempt.current=null;router.refresh();
  }catch(e){if(responseStatus===0||responseStatus<400||responseStatus>=500&&responseStatus!==503)setUncertain(true);setError((e as Error).message);}finally{busy.current=false;setLoading(false);}
 }
 const field='mt-2 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white';
 return <details className="mt-6 border-t border-gray-700 pt-4"><summary className="cursor-pointer text-sm text-gray-300">廃棄・仕入先への返品</summary><div className="mt-4 max-w-lg space-y-4">
  <p className="text-xs leading-relaxed text-gray-400">入荷とは別の記録です。過去の購入・仕入れ・残高は変更しません。</p>
  <label className="block text-sm text-gray-300">調整の種類<select aria-label="在庫調整の種類" value={kind} disabled={locked} onChange={e=>{setKind(e.target.value);setValue('');setDone(false);}} className={field}><option value="discard">廃棄した個数を減らす</option><option value="return">仕入先に返品した個数を減らす</option></select></label>
  <label className="block text-sm text-gray-300">減らす個数（販売単位）<input aria-label="在庫調整の個数" type="number" min={1} step={1} value={value} disabled={locked} onChange={e=>{setValue(e.target.value);setDone(false);}} className={field}/></label>
  <label className="block text-sm text-gray-300">理由<input aria-label="在庫調整の理由" value={note} disabled={locked} onChange={e=>{setNote(e.target.value);setDone(false);}} placeholder="例：破損、期限切れ" className={field}/></label>
  {valid&&!done&&<p className="font-mono text-white">{item.stock} → {after}個（{after-item.stock>0?'+':''}{after-item.stock}）</p>}
  {kind==='return'&&<p className="text-xs text-gray-400">仕入先からの返金は自動で記録しません。現金を受け取ったら金庫の出納へ記録してください。</p>}
  {error&&<p role="alert" className="text-sm text-amber-300">{error} <button type="button" onClick={()=>router.refresh()} className="underline">最新の在庫を確認</button></p>}
  {uncertain&&<p className="text-xs text-amber-300">保存結果が未確認です。内容を変えずに同じ調整を再試行してください。</p>}
  {done?<p role="status" className="text-sm text-emerald-300">在庫調整を記録しました。</p>:<button type="button" disabled={loading||!uncertain&&(!valid||!note.trim())} onClick={()=>void save()} className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-white disabled:opacity-40">{loading?'記録中…':'この在庫調整を記録'}</button>}
 </div></details>;
}
