'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import toast from 'react-hot-toast';
import type {Item} from '@/types';
import {RestockSubmission} from '@/lib/restock';
export default function ProductRestock({item,submission}:{item:Item;submission?:RestockSubmission}){
 const router=useRouter(),ownedRequests=useRef(new RestockSubmission()),busy=useRef(false);
 const requests=submission??ownedRequests.current;
 const [quantity,setQuantity]=useState(''),[loading,setLoading]=useState(false);
 const [purchase,setPurchase]=useState({enabled:false,payment_source:'cashbox',total_amount:'',vendor:'',note:''});
 const update=(patch:Partial<typeof purchase>)=>setPurchase(current=>({...current,...patch}));
 async function save(){
  const qty=Number(quantity);if(item.is_unlimited_stock||!Number.isInteger(qty)||qty<=0){toast.error('追加する個数を入力してください');return;}
  if(purchase.enabled&&(!Number.isInteger(Number(purchase.total_amount))||Number(purchase.total_amount)<=0)){toast.error('仕入れ合計額を1円以上の整数で入力してください');return;}
  if(busy.current)return;busy.current=true;setLoading(true);
  const input={item_id:item.id,quantity:qty,note:'入荷',purchase:purchase.enabled?{record:true,payment_source:purchase.payment_source as 'cashbox'|'personal_advance',total_amount:Number(purchase.total_amount),vendor:purchase.vendor,note:purchase.note}:null};
  try{const response=await fetch('/api/admin/stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,request_id:requests.requestId(input)})});const payload=await response.json();if(!response.ok)throw new Error(payload.error??'在庫追加に失敗しました');requests.complete(input);setQuantity('');setPurchase({enabled:false,payment_source:'cashbox',total_amount:'',vendor:'',note:''});toast.success('入荷を記録しました');router.refresh();}catch(error){toast.error((error as Error).message);}finally{busy.current=false;setLoading(false);}
 }
 const field='mt-2 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white';
 if(item.is_unlimited_stock)return <p className="mt-4 text-sm text-gray-400">この商品は在庫を管理しません。</p>;
 return <section aria-label="選択商品の在庫" className="mt-5 max-w-lg space-y-4"><p className="text-sm text-gray-300">在庫 <b className="ml-3 font-mono text-white">{item.stock}個</b></p><label className="block text-sm text-gray-300">追加する個数<input type="number" min={1} step={1} value={quantity} onChange={event=>setQuantity(event.target.value)} className={field}/></label><label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={purchase.enabled} onChange={event=>update({enabled:event.target.checked})}/>仕入れ額と支払元も記録する</label>{purchase.enabled&&<div className="space-y-4 rounded-xl border border-gray-700 p-4"><label className="block text-sm text-gray-300">支払元<select value={purchase.payment_source} onChange={event=>update({payment_source:event.target.value})} className={field}><option value="cashbox">金庫</option><option value="personal_advance">個人立替</option></select></label><label className="block text-sm text-gray-300">仕入れ合計額<input type="number" min={1} step={1} value={purchase.total_amount} onChange={event=>update({total_amount:event.target.value})} className={field}/></label><label className="block text-sm text-gray-300">購入先<input value={purchase.vendor} onChange={event=>update({vendor:event.target.value})} className={field}/></label><label className="block text-sm text-gray-300">メモ<input value={purchase.note} onChange={event=>update({note:event.target.value})} className={field}/></label></div>}<button type="button" disabled={loading} onClick={()=>void save()} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading?'記録中…':purchase.enabled?'入荷と仕入れを記録':'在庫を追加'}</button></section>;
}
