import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin-audit';
import { requireAdminSession } from '@/lib/admin-session';
import { notifyChargeReviewed } from '@/lib/slack';

type PointSettingsRow = {
  is_enabled: boolean;
  yen_per_point_unit: number;
  base_points_per_unit: number;
};

type PointCampaignRow = {
  apply_immediately: boolean;
  starts_at: string | null;
  ends_at: string | null;
  multiplier: number;
};

export async function POST(
  _request: Request,
  { params }: { params: { id: string; action: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { id, action } = params;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data: req, error: fetchError } = await supabase
    .from('charge_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single();

  if (fetchError || !req) {
    return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
  }

  if (action === 'approve') {
    const [{ data: targetUser, error: targetUserError }, settingsResponse, campaignsResponse] =
      await Promise.all([
        supabase.from('users').select('balance, deferred_balance').eq('id', req.user_id).single(),
        supabase.from('point_settings').select('*').eq('singleton', 'default').maybeSingle(),
        supabase.from('point_campaigns').select('*').eq('is_enabled', true),
      ]);

    if (targetUserError || !targetUser) {
      return NextResponse.json(
        { error: targetUserError?.message ?? 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    const nextBalance = (targetUser.balance ?? 0) + req.amount;
    const nextDeferredBalance = (targetUser.deferred_balance ?? 0) + req.amount;

    const { error: approveError } = await supabase
      .from('charge_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: adminSession.user.id,
      })
      .eq('id', id);

    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 500 });
    }

    const { error: balanceError } = await supabase
      .from('users')
      .update({
        balance: nextBalance,
        deferred_balance: nextDeferredBalance,
      })
      .eq('id', req.user_id);

    if (balanceError) {
      return NextResponse.json({ error: balanceError.message }, { status: 500 });
    }

    const pointSettings =
      settingsResponse.data && (settingsResponse.data as PointSettingsRow).is_enabled
        ? (settingsResponse.data as PointSettingsRow)
        : null;

    if (pointSettings) {
      const now = new Date();
      const activeCampaign =
        ((campaignsResponse.data ?? []) as PointCampaignRow[])
          .filter((campaign: PointCampaignRow) => {
            if (campaign.apply_immediately) return true;
            if (!campaign.starts_at) return false;

            const startsAt = new Date(campaign.starts_at).getTime();
            const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;
            const nowTime = now.getTime();

            return startsAt <= nowTime && (endsAt === null || endsAt >= nowTime);
          })
          .sort((left: PointCampaignRow, right: PointCampaignRow) => right.multiplier - left.multiplier)[0] ?? null;

      const multiplier = activeCampaign?.multiplier ?? 1;
      const rewardPoints = Math.floor(
        (req.amount / pointSettings.yen_per_point_unit) * pointSettings.base_points_per_unit * multiplier
      );

      if (rewardPoints > 0) {
        const { error: rewardError } = await supabase.rpc('record_point_transaction', {
          p_user_id: req.user_id,
          p_delta: rewardPoints,
          p_reason_type: 'charge_reward',
          p_charge_request_id: req.id,
          p_order_id: null,
          p_note: `チャージ特典 ${rewardPoints}pt`,
          p_created_by: adminSession.user.id,
        });

        if (rewardError) {
          console.error('[admin charge approve] point reward record failed', rewardError);
        }
      }
    }
  } else {
    const { error: rejectError } = await supabase
      .from('charge_requests')
      .update({
        status: 'rejected',
        approved_at: new Date().toISOString(),
        approved_by: adminSession.user.id,
      })
      .eq('id', id);

    if (rejectError) {
      return NextResponse.json({ error: rejectError.message }, { status: 500 });
    }
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: action === 'approve' ? 'charge_approved' : 'charge_rejected',
    target_type: 'charge_request',
    target_id: req.id,
    summary: `${req.user_id} の ${req.amount.toLocaleString()}円チャージ申請を${action === 'approve' ? '承認' : '却下'}しました`,
    metadata: {
      method: req.method,
      amount: req.amount,
      user_id: req.user_id,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/points');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');
  revalidatePath('/mypage');

  const { data: targetUserProfile } = await supabase
    .from('users')
    .select('slack_user_id')
    .eq('id', req.user_id)
    .single();

  if (targetUserProfile?.slack_user_id) {
    await notifyChargeReviewed({
      slackUserId: targetUserProfile.slack_user_id,
      amount: req.amount,
      status: action === 'approve' ? 'approved' : 'rejected',
    });
  }

  return NextResponse.json({ ok: true });
}
