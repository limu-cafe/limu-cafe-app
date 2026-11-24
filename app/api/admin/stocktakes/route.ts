import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-session';
import { isObjectId } from '@/lib/admin-objects';
import { runAdminPayment } from '@/lib/payment-api';
import { parseStocktake } from '@/lib/stocktake';
import { createAdminClient } from '@/lib/supabase/server';

const pageSize = 20;
const noCache = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  return runAdminPayment(request, 'record_stocktake', async actor => {
    const body = await request.json().catch(() => null);
    if (!isObjectId(body?.request_id)) throw Error('棚卸の登録番号を確認してください');
    return {
      p_request_id: body.request_id.toLowerCase(),
      p_input: parseStocktake(body),
      p_actor_id: actor,
    };
  }, { action: '棚卸', extraViews: ['/admin/stock', '/admin/items'] });
}

export async function GET(request: Request) {
  const access = await requireAdminSession();
  if (!access.user) return NextResponse.json({ error: access.error }, { status: access.status });
  const search = new URL(request.url).searchParams;
  const id = search.get('id');
  const page = Number(search.get('page') ?? 1);
  if ((id !== null && !isObjectId(id)) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return NextResponse.json({ error: '棚卸の記録の指定を確認してください' }, { status: 400 });
  }
  const db = createAdminClient();
  if (id) {
    const { data, error } = await db.from('stocktakes').select('result').eq('request_id', id).maybeSingle();
    if (error) return NextResponse.json({ error: '棚卸の記録を取得できませんでした' }, { status: 503 });
    if (!data) return NextResponse.json({ error: '棚卸の記録が見つかりません' }, { status: 404 });
    return NextResponse.json({ record: data.result }, { headers: noCache });
  }
  const start = (page - 1) * pageSize;
  const { data, error } = await db.from('stocktakes')
    .select('request_id, created_at, item_count:result->item_count, changed_count:result->changed_count, actor_name:result->>actor_name')
    .order('created_at', { ascending: false }).order('request_id', { ascending: false })
    .range(start, start + pageSize);
  if (error) return NextResponse.json({ error: '棚卸の記録を取得できませんでした' }, { status: 503 });
  return NextResponse.json({ records: data.slice(0, pageSize), hasMore: data.length > pageSize }, { headers: noCache });
}
