import type { PointCampaign, PointSettings, PointTransactionReason } from '@/types';

export const DEFAULT_POINT_SETTINGS: PointSettings = {
  singleton: 'default',
  is_enabled: true,
  base_points_per_unit: 1,
  yen_per_point_unit: 100,
  updated_by: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export const POINT_REASON_LABELS: Record<PointTransactionReason, string> = {
  charge_reward: 'チャージ特典',
  manual_grant: '管理者付与',
  manual_deduct: '管理者減算',
  order_use: '注文利用',
  order_refund: '注文返却',
  charge_refund_reversal: 'チャージ返金取消',
};

export function getActivePointCampaign(
  campaigns: PointCampaign[],
  now = new Date()
): PointCampaign | null {
  const nowTime = now.getTime();

  return (
    campaigns
      .filter((campaign) => {
        if (!campaign.is_enabled) return false;
        if (campaign.apply_immediately) return true;

        const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
        const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;

        if (startsAt === null) return false;
        if (startsAt > nowTime) return false;
        if (endsAt !== null && endsAt < nowTime) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.multiplier !== a.multiplier) {
          return b.multiplier - a.multiplier;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })[0] ?? null
  );
}

export function getCurrentPointMultiplier(campaigns: PointCampaign[], now = new Date()) {
  return getActivePointCampaign(campaigns, now)?.multiplier ?? 1;
}

export function calculateRewardPoints(
  amount: number,
  settings: Pick<PointSettings, 'is_enabled' | 'base_points_per_unit' | 'yen_per_point_unit'>,
  multiplier = 1
) {
  if (!settings.is_enabled || amount <= 0) return 0;
  return Math.floor((amount / settings.yen_per_point_unit) * settings.base_points_per_unit * multiplier);
}

export function formatPointRule(settings: Pick<PointSettings, 'base_points_per_unit' | 'yen_per_point_unit'>) {
  return `${settings.yen_per_point_unit}円ごとに${settings.base_points_per_unit}pt`;
}

export function clampPointsToUse(requestedPoints: number, availablePoints: number, totalAmount: number) {
  const safeRequestedPoints = Number.isFinite(requestedPoints) ? Math.floor(requestedPoints) : 0;
  return Math.max(0, Math.min(safeRequestedPoints, availablePoints, totalAmount));
}
