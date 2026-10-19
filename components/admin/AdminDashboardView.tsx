import Link from 'next/link';
import type {SidebarNotifications} from '@/lib/admin-navigation';
import {describeCashCollectionBreakdown,type CashCollectionEntry} from '@/lib/cash-collection';
import BotIntroBroadcastCard from '@/app/admin/operations/BotIntroBroadcastCard';
type Overview={notifications:SidebarNotifications;collections:CashCollectionEntry[];activeSubscriptions:number;botIntroUsers:{id:string;name:string|null}[]};
export default function AdminDashboardView({overview}:{overview:Overview}){
 const alerts=[
 {href:'/admin/items?state=low-stock',label:'要補充の商品',count:overview.notifications.items},
 {href:'/admin/transactions?state=pending',label:'未精算・承認待ちの取引',count:overview.notifications.transactions},
 {href:'/admin/reimbursements?state=pending',label:'未精算の立替',count:overview.notifications.reimbursements},
 {href:'/admin/users?pending=1',label:'承認待ちの利用者',count:overview.notifications.users},
 {href:'/admin/requests?pending=1',label:'検討中の商品要望',count:overview.notifications.requests},
 {href:'/admin/legacy',label:'移行待ちの申請',count:overview.notifications.legacy}
 ].filter(alert=>alert.count>0);
 return <div className="mx-auto max-w-4xl space-y-6"><header><h1 className="text-3xl font-bold text-white">管理トップ</h1><p className="mt-2 text-sm text-gray-400">確認が必要な対象から、該当する記録へ移動できます。</p></header><section className="rounded-xl border border-gray-800 bg-gray-900"><h2 className="border-b border-gray-800 px-5 py-4 font-semibold text-white">確認が必要な対象</h2>{alerts.length?alerts.map(alert=><Link key={alert.href} href={alert.href} prefetch={false} className="flex items-center justify-between gap-4 border-b border-gray-800 px-5 py-4 text-sm hover:bg-gray-800"><span className="text-white">{alert.label}</span><span className="font-mono text-amber-300">{alert.count}</span></Link>):<p className="p-5 text-sm text-gray-400">現在、確認待ちの対象はありません。</p>}</section><section className="rounded-xl border border-gray-800 bg-gray-900"><h2 className="border-b border-gray-800 px-5 py-4 font-semibold text-white">要回収の利用者 <span className="ml-2 text-sm text-gray-400">{overview.collections.length}人</span></h2>{overview.collections.map(entry=><Link key={entry.userId} href={'/admin/transactions?user='+entry.userId+'&state=pending'} className="flex items-center gap-4 border-b border-gray-800 px-5 py-4"><span className="min-w-0 flex-1 text-sm text-white">{entry.name}<small className="mt-1 block text-xs text-gray-400">{describeCashCollectionBreakdown(entry)}</small></span><span className="font-mono text-sm text-amber-300">¥{entry.totalAmount.toLocaleString()}</span></Link>)}{!overview.collections.length&&<p className="p-5 text-sm text-gray-400">要回収の利用者はいません。</p>}</section><details><summary className="cursor-pointer text-sm text-gray-400">利用者へのBot案内</summary><div className="mt-3"><BotIntroBroadcastCard eligibleCount={overview.botIntroUsers.length} eligibleUsers={overview.botIntroUsers}/></div></details><p className="text-xs text-gray-500">契約中のサブスク {overview.activeSubscriptions}件。商品・利用者・会計・設定の各情報は左のメニューから確認できます。</p></div>;
}
