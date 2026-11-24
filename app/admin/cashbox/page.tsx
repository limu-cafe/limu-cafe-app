import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import CashboxClient from './CashboxClient';
import {isObjectId} from '@/lib/admin-objects';
export const dynamic = 'force-dynamic';
const pageNumber=(value:unknown)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=10000?n:1;};
export default async function CashboxPage({searchParams}:{searchParams?:Promise<{ledgerPage?:string;countPage?:string;entry?:string;count?:string}>}) {
  await requireAdminPage();
  const db=createAdminClient(),params=await searchParams??{},entryPage=pageNumber(params.ledgerPage),countPage=pageNumber(params.countPage);
  const [summary,ledger,counts,latest]=await Promise.all([
    db.rpc('read_cashbox_totals'),
    db.from('cashbox_entries').select('*, created_by_user:users!cashbox_entries_created_by_fkey(name)').order('created_at',{ascending:false}).order('id',{ascending:false}).range((entryPage-1)*30,entryPage*30),
    db.from('cashbox_counts').select('*, counted_by_user:users!cashbox_counts_counted_by_fkey(name)').order('counted_at',{ascending:false}).order('id',{ascending:false}).range((countPage-1)*20,countPage*20),
    db.from('cashbox_counts').select('*, counted_by_user:users!cashbox_counts_counted_by_fkey(name)').order('counted_at',{ascending:false}).order('id',{ascending:false}).limit(1),
  ]);
  for(const result of [summary,ledger,counts,latest]) if(result.error)throw result.error;
  const entries=(ledger.data??[]).slice(0,30),countRows=(counts.data??[]).slice(0,20);
  // An audit deep link must not disappear just because its row is on an old page.
  await Promise.all([
    {id:params.entry,rows:entries,table:'cashbox_entries',fields:'*, created_by_user:users!cashbox_entries_created_by_fkey(name)'},
    {id:params.count,rows:countRows,table:'cashbox_counts',fields:'*, counted_by_user:users!cashbox_counts_counted_by_fkey(name)'},
  ].map(async target=>{if(!isObjectId(target.id)||target.rows.some((row:{id:string})=>row.id===target.id))return;const result=await db.from(target.table).select(target.fields).eq('id',target.id).maybeSingle();if(result.error)throw result.error;if(result.data)target.rows.unshift(result.data);}));
  const totals=summary.data;
  for(const key of ['expectedAmount','pendingCashOrdersCount','pendingCashOrderAmount','totalCashCollectionAmount','unreimbursedAdvanceAmount']) if(!Number.isSafeInteger(totals?.[key]))throw Error('金庫の集計結果を確認できませんでした');
  return <CashboxClient {...totals} unreimbursedPurchaseRuns={[]} latestCount={latest.data?.[0]??null} entries={entries} counts={countRows} entryPage={entryPage} hasMoreEntries={(ledger.data?.length??0)>30} countPage={countPage} hasMoreCounts={(counts.data?.length??0)>20}/>;
}
