import { isObjectId, OBJECT_RELATIONS, type AdminOrder, type ObjectKind, type ObjectRecords } from '@/lib/admin-objects';

export class AdminObjectReadRepository {
  constructor(private readonly db: any) {}

  async read(kind: ObjectKind, id: string, relation: string, page = 1): Promise<ObjectRecords> {
    if (!isObjectId(id) || !OBJECT_RELATIONS[kind]?.some((entry) => entry.id === relation) || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Invalid object query');
    let query;
    if (kind === 'items' && relation === 'stock') query = this.db.from('stock_history').select('id, change_amount, reason, note, order_id, created_at').eq('item_id', id);
    else if (kind === 'items') query = this.db.from('order_items').select('id, order_id, item_name, quantity, item_price, subtotal, created_at, order:orders!order_items_order_id_fkey(id, user_id, total_amount, payment_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name))').eq('item_id', id);
    else if (relation === 'orders') query = this.db.from('orders').select('id, user_id, total_amount, payment_method, payment_status, created_at, order_items(item_name, quantity)').eq('user_id', id);
    else if (relation === 'charges') query = this.db.from('charge_requests').select('id, amount, method, status, note, created_at').eq('user_id', id);
    else if (relation === 'points') query = this.db.from('point_transactions').select('id, delta, reason_type, note, created_at').eq('user_id', id);
    else query = this.db.from('user_subscriptions').select('id, status, end_month, next_billing_at, created_at, product:subscription_products!user_subscriptions_subscription_product_id_fkey(id, name)').eq('user_id', id);
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 20, page * 20);
    if (error) throw error;
    return { rows: (data ?? []).slice(0, 20), page, hasNextPage: (data?.length ?? 0) > 20 };
  }

  async order(id: string): Promise<AdminOrder | null> {
    if (!isObjectId(id)) return null;
    const base = 'id, user_id, total_amount, payment_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), order_items(id, item_id, item_name, item_price, quantity, subtotal)';
    let result = await this.db.from('orders').select(`${base}, points_used, deferred_settlement_method, settled_at, settlement_source`).eq('id', id).maybeSingle();
    if (result.error) {
      const message = String(result.error.message ?? '');
      if (!['points_used', 'deferred_settlement_method', 'settled_at', 'settlement_source'].some((column) => message.includes(column))) throw result.error;
      const missingSettlement = ['settled_at', 'settlement_source'].some((column) => message.includes(column));
      const legacySelect = missingSettlement ? `${base}, points_used, deferred_settlement_method` : base;
      result = await this.db.from('orders').select(legacySelect).eq('id', id).maybeSingle();
      if (missingSettlement && result.error && ['points_used', 'deferred_settlement_method'].some((column) => String(result.error.message ?? '').includes(column))) {
        result = await this.db.from('orders').select(base).eq('id', id).maybeSingle();
      }
    }
    if (result.error) throw result.error;
    return result.data;
  }
}
