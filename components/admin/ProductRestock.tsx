'use client';
import Link from 'next/link';
import {purchaseEntryHref} from '@/lib/purchase-navigation';
import {readIntegerInput,normalizeIntegerInput} from '@/lib/numeric-input';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import toast from 'react-hot-toast';
import type {Item} from '@/types';
import {RestockSubmission} from '@/lib/restock';
export default function ProductRestock({item,submission}:{item:Item;submission?:RestockSubmission}){
 const router=useRouter(),ownedRequests=useRef(new RestockSubmission()),busy=useRef(false);
 const requests=submission??ownedRequests.current;
 const [quantity,setQuantity]=useState(''),[loading,setLoading]=useState(false);
 async function save(){
  const qty=readIntegerInput(quantity);if(item.is_unlimited_stock||!Number.isInteger(qty)||qty<=0){toast.error('追加する個数を入力してください');return;}

  if(busy.current)return;busy.current=true;setLoading(true);
  const input={item_id:item.id,quantity:qty,note:'入荷',purchase:null};
  try{const response=await fetch('/api/admin/stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,request_id:requests.requestId(input)})});const payload=await response.json();if(!response.ok)throw new Error(payload.error??'在庫追加に失敗しました');requests.complete(input);setQuantity('');toast.success('入荷を記録しました');router.refresh();}catch(error){toast.error((error as Error).message);}finally{busy.current=false;setLoading(false);}
 }
 const field='mt-2 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white';
 if(item.is_unlimited_stock)return <p className="mt-4 text-sm text-gray-400">この商品は在庫を管理しません。</p>;
 return <section aria-label="選択商品の在庫" className="mt-5 max-w-lg space-y-4"><p className="text-sm text-gray-300">在庫 <b className="ml-3 font-mono text-white">{item.stock}個</b></p><Link href={purchaseEntryHref({itemId:item.id,returnTo:`/admin/items?item=${item.id}&view=stock`})} className="inline-block text-sm text-sky-300 underline">買い物を記録（備品も一緒に入力） →</Link><details className="border-t border-gray-800 pt-4"><summary className="cursor-pointer text-sm text-gray-400">購入は記録済み・在庫だけ追加する</summary><div className="mt-4 space-y-4"><label className="block text-sm text-gray-300">追加する個数（販売単位）<input type="text" inputMode="numeric" autoComplete="off" value={quantity} onFocus={e=>e.currentTarget.select()} onBlur={e=>setQuantity(normalizeIntegerInput(e.target.value))} onChange={event=>setQuantity(event.target.value)} className={field}/></label><p className="text-xs text-gray-400">購入・立替・出金は追加しません。</p><button type="button" disabled={loading} onClick={()=>void save()} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading?'記録中…':'在庫を追加'}</button></div></details></section>;
}
