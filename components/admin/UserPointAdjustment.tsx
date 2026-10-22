'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function UserPointAdjustment({user}: {user: {id:string; name:string; points_balance:number}}) {
  const router=useRouter();
  const [delta,setDelta]=useState('10'),[note,setNote]=useState(''),[review,setReview]=useState(false),[loading,setLoading]=useState(false);
  const busy=useRef(false);
  const value=Number(delta),valid=Number.isInteger(value)&&value!==0&&note.trim().length>0;
  async function save() {
    if(!valid||busy.current)return;
    busy.current=true;setLoading(true);
    try {
      const response=await fetch('/api/admin/points/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:user.id,delta:value,note:note.trim()})});
      const payload=await response.json();if(!response.ok)throw new Error(payload.error??'ポイントを更新できませんでした');
      toast.success('ポイントを更新しました');setReview(false);setNote('');router.refresh();
    } catch(error) {toast.error((error as Error).message);} finally {busy.current=false;setLoading(false);}
  }
  return <form aria-label={`${user.name}のポイント調整`} className="mt-4 space-y-4 rounded-xl border border-gray-700 p-4" onSubmit={event=>{event.preventDefault();if(valid)setReview(true);}}>
    <h3 className="text-sm font-medium text-white">{user.name}のポイント調整</h3>
    {review?<><dl className="grid grid-cols-[7rem_1fr] gap-3 text-sm"><dt className="text-gray-400">現在</dt><dd className="font-mono text-white">{user.points_balance}pt</dd><dt className="text-gray-400">増減</dt><dd className="font-mono text-white">{value>0?'+':''}{value}pt</dd><dt className="text-gray-400">反映後</dt><dd className="font-mono text-white">{user.points_balance+value}pt</dd></dl><p className="wrap-break-word text-sm text-gray-300">理由：{note}</p><div className="flex gap-3"><button type="button" disabled={loading} onClick={()=>void save()} className="rounded-lg bg-white px-3 py-2 text-sm text-gray-950 disabled:opacity-40">{loading?'反映中…':'この内容で反映'}</button><button type="button" disabled={loading} onClick={()=>setReview(false)} className="text-sm text-gray-300 underline">内容を戻す</button></div></>:<><label className="block text-sm text-gray-300">増減ポイント<input type="number" step={1} required value={delta} onChange={event=>setDelta(event.target.value)} className="mt-2 block w-full max-w-40 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"/></label><label className="block text-sm text-gray-300">調整の理由<input required value={note} onChange={event=>setNote(event.target.value)} placeholder="例：買い出し協力のお礼" className="mt-2 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"/></label><button disabled={!valid} className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-white disabled:opacity-40">調整内容を確認</button></>}
  </form>;
}
