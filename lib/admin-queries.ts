import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';
import { buildCashCollectionEntries, type DeferredCashCollectionRow, type PendingCashOrderRow, type PendingSubscriptionCashRow } from '@/lib/cash-collection';
import { isItemLowStock } from '@/lib/item-stock';

type InventoryRow = { stock: number; stock_alert_threshold: number; is_available: boolean; is_unlimited_stock?: boolean };
type OverviewData = {
  deferredOrders: number; cashOrders: number; pendingCharges: number; cashCharges: number;
  subscriptionPayments: number; reimbursements: number; users: number; requests: number; legacy: number;
  activeSubscriptions: number; inventory: InventoryRow[];
  deferredUsers: DeferredCashCollectionRow[]; pendingCashOrders: PendingCashOrderRow[];
  pendingSubscriptions: PendingSubscriptionCashRow[]; botIntroUsers: { id: string; name: string | null }[];
};

export class AdminOverview {
  constructor(private readonly data: OverviewData) {}
  get notifications() {
    return {
      items: this.data.inventory.filter(isItemLowStock).length,
      transactions: this.data.deferredOrders + this.data.cashOrders + this.data.pendingCharges + this.data.cashCharges + this.data.subscriptionPayments,
      reimbursements: this.data.reimbursements, users: this.data.users, requests: this.data.requests,
      legacy: this.data.legacy, points: 0,
    };
  }
  get collections() {
    return buildCashCollectionEntries({ deferredUsers: this.data.deferredUsers, pendingCashOrders: this.data.pendingCashOrders, pendingSubscriptionPayments: this.data.pendingSubscriptions });
  }
  get activeSubscriptions() { return this.data.activeSubscriptions; }
  get botIntroUsers() { return this.data.botIntroUsers; }
}

/** Read-only repository. The optional RPC returns one database snapshot, without a persistent cache. */
export class AdminReadRepository {
  constructor(private readonly db: any, private readonly workspaceId: string | null) {}

  async readOverview(): Promise<AdminOverview> {
    if (typeof this.db.rpc === 'function') {
      const result = await this.db.rpc('read_admin_overview', { p_workspace_id: this.workspaceId });
      if (!result.error) return new AdminOverview(result.data);
      if (result.error.code !== 'PGRST202' && result.error.code !== '42883') throw result.error;
    }
    return this.readLegacyOverview();
  }

  private async readLegacyOverview() {
    const count = (table: string) => this.db.from(table).select('*', { count: 'exact', head: true });
    let botIntro = this.db.from('users').select('id, name').eq('is_active', true).not('slack_user_id', 'is', null).is('bot_intro_sent_at', null).order('name');
    if (this.workspaceId) botIntro = botIntro.eq('slack_workspace_id', this.workspaceId);
    const queries = {
      deferredOrders: count('orders').eq('payment_method', 'deferred').eq('payment_status', 'completed').or('deferred_settlement_method.is.null,deferred_settlement_method.eq.cash').is('settled_at', null),
      cashOrders: count('orders').eq('payment_method', 'cash').eq('payment_status', 'pending'),
      pendingCharges: count('charge_requests').eq('status', 'pending'),
      cashCharges: count('charge_requests').eq('method', 'cash').eq('status', 'approved').is('settled_at', null),
      subscriptionPayments: count('subscription_payments').eq('payment_status', 'pending_cash_settlement'),
      reimbursements: count('purchase_runs').eq('reimbursement_status', 'pending_reimbursement'),
      users: count('users').eq('is_approved', false).eq('is_active', true),
      requests: count('item_requests').eq('status', 'pending'),
      legacy: count('legacy_transfer_requests').eq('status', 'pending'),
      activeSubscriptions: count('user_subscriptions').in('status', ['active', 'cancel_at_period_end']),
      inventory: this.db.from('items').select('id, stock, stock_alert_threshold, is_available, is_unlimited_stock').eq('is_available', true),
      deferredUsers: this.db.from('users').select('id, name, avatar_url, deferred_balance').gt('deferred_balance', 0).eq('is_active', true),
      pendingCashOrders: this.db.from('orders').select('user_id, total_amount, user:users!orders_user_id_fkey(id, name, avatar_url)').eq('payment_method', 'cash').eq('payment_status', 'pending'),
      pendingSubscriptions: this.db.from('subscription_payments').select('user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)').eq('payment_status', 'pending_cash_settlement').gt('cash_due_amount', 0),
      botIntroUsers: botIntro,
    };
    const data: Record<string, unknown> = {};
    await Promise.all(Object.entries(queries).map(async ([key, query]) => {
      const result: any = await query;
      if (result.error) throw result.error;
      data[key] = result.data ?? result.count ?? [];
    }));
    return new AdminOverview(data as OverviewData);
  }
}

// React cache is scoped to one server render, so no account data or balances persist across requests.
export const getAdminOverview = cache(async () => new AdminReadRepository(
  createAdminClient(), process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim() || null
).readOverview());
