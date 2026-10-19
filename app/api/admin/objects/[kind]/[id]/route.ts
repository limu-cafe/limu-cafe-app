import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';
import { AdminObjectReadRepository } from '@/lib/admin-object-queries';
import { isObjectId, OBJECT_RELATIONS, type ObjectKind } from '@/lib/admin-objects';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { kind: string; id: string } }) {
  const session = await requireAdminSession();
  if (!session.user) return NextResponse.json({ error: session.error }, { status: session.status });
  const search = new URL(request.url).searchParams;
  const kind = params.kind as ObjectKind;
  const relation = search.get('view') ?? '';
  const page = Number(search.get('page') ?? 1);
  if (!Object.prototype.hasOwnProperty.call(OBJECT_RELATIONS, kind) || !isObjectId(params.id) || !OBJECT_RELATIONS[kind].some((entry) => entry.id === relation) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({ error: '表示する対象を確認してください' }, { status: 400 });
  }
  try {
    const result = await new AdminObjectReadRepository(createAdminClient()).read(kind, params.id, relation, page);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: '履歴を取得できませんでした。再読み込みしてください。' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
