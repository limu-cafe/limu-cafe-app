import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';
import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';
import { parseStockReceipt } from '@/lib/stock-receipts';
import {parseStockIntake} from '@/lib/stock-intakes';

export async function POST(request: Request) {
  const body=await request.json().catch(()=>null),multi=Boolean(body&&typeof body==='object'&&!Array.isArray(body)&&'receipts' in body);
  const expenses=multi?Array.isArray(body.receipts)&&body.receipts.some((r:any)=>r&&typeof r==='object'&&'expenses' in r):Boolean(body&&typeof body==='object'&&'expenses' in body);
  const detailed=multi?Array.isArray(body.receipts)&&body.receipts.some((r:any)=>r&&typeof r==='object'&&'purchase_lines' in r):Boolean(body&&typeof body==='object'&&'purchase_lines' in body);
  return runAdminPayment(request, detailed?'record_purchase_v2':expenses?'record_purchase':multi?'record_stock_intake':'record_stock_receipt', async actor => {
    if (!isObjectId(body?.request_id)) throw new Error('画面を再読み込みしてから入荷を記録してください');
    const input = multi?parseStockIntake(body):parseStockReceipt(body);
    return {p_request_id:body.request_id.toLowerCase(),p_input:input,p_actor_id:actor};
  }, {action:'買い物・入荷',extraViews:['/admin/items','/admin/stock']});
}

export async function GET(request: Request) {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({error:access.error},{status:access.status});
  const url = new URL(request.url), id = url.searchParams.get('id'), intake=url.searchParams.get('intake');
  const page = Number(url.searchParams.get('page') ?? 1);
  if ((id && !isObjectId(id)) || (intake&&!isObjectId(intake)) || (id&&intake) || !Number.isSafeInteger(page) || page < 1 || page > 10000) return NextResponse.json({error:'記録の指定が不正です'},{status:400});
  const db = createAdminClient();
  if(intake){const {data,error}=await db.from('stock_intakes').select('result').eq('request_id',intake).maybeSingle();if(error)return NextResponse.json({error:'まとめ登録を読み込めませんでした'},{status:500});if(!data)return NextResponse.json({error:'まとめ登録が見つかりません'},{status:404});return NextResponse.json({intake:data.result},{headers:{'Cache-Control':'private, no-store'}});}
  const query = db.from('stock_receipts').select('request_id,result,created_at');
  const {data,error} = id ? await query.eq('request_id',id).maybeSingle()
    : await query.order('created_at',{ascending:false}).order('request_id',{ascending:false}).range((page-1)*20,page*20);
  if (error) {
    if (['42P01','PGRST205'].includes(error.code)) return NextResponse.json({error:'入荷記録の準備ができていません'},{status:503});
    return NextResponse.json({error:'入荷記録を読み込めませんでした'},{status:500});
  }
  if (id && !data) return NextResponse.json({error:'入荷記録が見つかりません'},{status:404});
  return NextResponse.json(id?{receipt:(data as any).result}:{receipts:(data as any[]).slice(0,20).map(row=>row.result),hasMore:(data as any[]).length>20,page},{headers:{'Cache-Control':'private, no-store'}});
}
