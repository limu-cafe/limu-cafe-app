'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ADMIN_NAVIGATION} from '@/lib/admin-navigation';
export default function AdminLocation(){
 const path=usePathname();if(path==='/admin')return null;
 const group=ADMIN_NAVIGATION.find(group=>group.items.some(item=>[item.href,...(item.activePaths??[])].some(href=>path===href||(href!=='/admin'&&path.startsWith(href+'/')))));
 const item=group?.items.find(item=>[item.href,...(item.activePaths??[])].some(href=>path===href||(href!=='/admin'&&path.startsWith(href+'/'))));
 if(!item)return null;
 return <nav aria-label="管理画面の位置" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-gray-500"><Link href="/admin" className="text-gray-400 hover:text-white">管理トップ</Link><span>/</span><span>{group?.label}</span><span>/</span><span className="text-gray-300">{item.label}</span></nav>;
}
