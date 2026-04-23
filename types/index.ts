export type UserRole = 'member' | 'admin';
export type PaymentMethod = 'balance' | 'deferred' | 'cash' | 'stripe';
export type DeferredSettlementMethod = 'cash' | 'stripe';
export type PaymentStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';
export type ChargeMethod = 'cash' | 'stripe';
export type ChargeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
export type ItemRequestStatus = 'pending' | 'approved' | 'rejected';
export type ItemRequestVoteType = 'up';
export type ItemRequestCommentSource = 'app' | 'slack';
export type SettlementStatus = 'pending' | 'completed';
export type StockReason = 'restock' | 'purchase' | 'adjustment' | 'discard';
export type Platform = 'amazon' | 'rakuten' | 'yahoo' | 'other';
export type ItemShowcaseOverride = 'auto' | 'show' | 'hide';
export type PurchasePaymentSource = 'cashbox' | 'personal_advance';
export type PurchaseReimbursementStatus = 'not_needed' | 'pending_reimbursement' | 'reimbursed';
export type PointTransactionReason =
  | 'charge_reward'
  | 'manual_grant'
  | 'manual_deduct'
  | 'order_use'
  | 'order_refund'
  | 'charge_refund_reversal';

export interface User {
  id: string;
  slack_user_id?: string;
  slack_workspace_id?: string;
  name: string;
  avatar_url?: string;
  email?: string;
  balance: number;
  deferred_balance: number;
  points_balance: number;
  role: UserRole;
  is_approved: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  sort_order: number;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  english_name?: string | null;
  description?: string;
  price: number;
  category_id?: string;
  category?: Category;
  image_url?: string;
  stock: number;
  stock_alert_threshold: number;
  is_available: boolean;
  popular_override: ItemShowcaseOverride;
  new_arrival_override: ItemShowcaseOverride;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  user?: User;
  total_amount: number;
  points_used: number;
  payment_method: PaymentMethod;
  deferred_settlement_method?: DeferredSettlementMethod | null;
  payment_status: PaymentStatus;
  cash_confirmed_at?: string;
  cash_confirmed_by?: string;
  note?: string;
  order_items?: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string;
  item?: Item;
  item_name: string;
  item_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
}

export interface ChargeRequest {
  id: string;
  user_id: string;
  user?: User;
  amount: number;
  method: ChargeMethod;
  status: ChargeStatus;
  stripe_payment_intent_id?: string;
  approved_by?: string;
  approved_at?: string;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface Settlement {
  id: string;
  user_id: string;
  user?: User;
  amount: number;
  period_start: string;
  period_end: string;
  method: PaymentMethod;
  status: SettlementStatus;
  settled_by?: string;
  settled_at?: string;
  note?: string;
  created_at: string;
}

export interface ItemRequest {
  id: string;
  user_id: string;
  user?: User;
  item_name: string;
  reason?: string;
  desired_price?: number;
  status: ItemRequestStatus;
  admin_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ItemRequestVote {
  id: string;
  request_id: string;
  user_id: string;
  vote_type: ItemRequestVoteType;
  created_at: string;
}

export interface ItemRequestComment {
  id: string;
  request_id: string;
  user_id: string;
  user?: Pick<User, 'id' | 'name' | 'avatar_url'>;
  body: string;
  source: ItemRequestCommentSource;
  created_at: string;
}

export interface StockHistory {
  id: string;
  item_id: string;
  item?: Item;
  change_amount: number;
  reason: StockReason;
  order_id?: string;
  note?: string;
  created_by?: string;
  created_at: string;
}

export interface PriceWatch {
  id: string;
  item_name: string;
  url: string;
  platform: Platform;
  target_price: number;
  current_price?: number;
  last_checked_at?: string;
  is_active: boolean;
  notified_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FavoriteItem {
  id: string;
  user_id: string;
  item_id: string;
  created_at: string;
}

export interface PurchaseRunItem {
  id: string;
  purchase_run_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface PurchaseRun {
  id: string;
  total_amount: number;
  payment_source: PurchasePaymentSource;
  reimbursement_status: PurchaseReimbursementStatus;
  vendor?: string | null;
  note?: string | null;
  purchased_by?: string | null;
  reimbursed_by?: string | null;
  reimbursed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  items?: PurchaseRunItem[];
}

export interface LegacyUser {
  id: string;
  source: string;
  legacy_user_key: string;
  name: string;
  email?: string;
  legacy_balance: number;
  favorite_item_names?: string[];
  notes?: string;
  matched_user_id?: string | null;
  transferred_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegacyTransferRequest {
  id: string;
  user_id: string;
  legacy_name?: string | null;
  note?: string | null;
  status: 'pending' | 'completed' | 'rejected';
  matched_legacy_user_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointSettings {
  singleton: 'default';
  is_enabled: boolean;
  base_points_per_unit: number;
  yen_per_point_unit: number;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointCampaign {
  id: string;
  name: string;
  multiplier: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_enabled: boolean;
  apply_immediately: boolean;
  note?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason_type: PointTransactionReason;
  charge_request_id?: string | null;
  order_id?: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
}

// カート（クライアントサイドのみ）
export interface CartItem {
  item: Item;
  quantity: number;
}
