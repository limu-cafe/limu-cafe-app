import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { applyLegacyTransfer } from '@/lib/legacy-transfer';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(
  request: Request,
  { params }: { params: { id: string; action: string } }
) {
  const adminSession = await requireAdminSession();
  const supabase = createAdminClient();

  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { id, action } = params;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data: transferRequest, error: requestError } = await supabase
    .from('legacy_transfer_requests')
    .select('id, user_id, status')
    .eq('id', id)
    .single();

  if (requestError || !transferRequest) {
    return NextResponse.json({ error: requestError?.message ?? '申請が見つかりません' }, { status: 404 });
  }

  if (transferRequest.status !== 'pending') {
    return NextResponse.json({ error: 'この申請はすでに処理済みです' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === 'reject') {
    const { rejection_reason } = await request.json().catch(() => ({ rejection_reason: '' }));
    const { error } = await supabase
      .from('legacy_transfer_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejection_reason?.trim() || null,
        reviewed_by: adminSession.user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction(supabase, {
      actor_id: adminSession.user.id,
      action_type: 'legacy_transfer_rejected',
      target_type: 'legacy_transfer_request',
      target_id: id,
      summary: '旧データ引き継ぎ申請を却下しました',
      metadata: {
        request_id: id,
        user_id: transferRequest.user_id,
        rejection_reason: rejection_reason?.trim() || null,
      },
    });

    revalidatePath('/mypage');
    revalidatePath('/admin');
    revalidatePath('/admin/legacy');
    revalidatePath('/admin/audit');
    return NextResponse.json({ ok: true });
  }

  const { legacy_user_id } = await request.json();

  if (!legacy_user_id) {
    return NextResponse.json({ error: 'legacy_user_id is required' }, { status: 400 });
  }

  try {
    await applyLegacyTransfer(supabase, {
      requestId: id,
      currentUserId: transferRequest.user_id,
      legacyUserId: legacy_user_id,
      reviewedBy: adminSession.user.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'legacy_transfer_completed',
    target_type: 'legacy_transfer_request',
    target_id: id,
    summary: '旧データ引き継ぎを完了しました',
    metadata: {
      request_id: id,
      user_id: transferRequest.user_id,
      legacy_user_id,
    },
  });

  revalidatePath('/mypage');
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  revalidatePath('/admin/legacy');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
