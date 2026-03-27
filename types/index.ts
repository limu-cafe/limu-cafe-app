export type UserRole = 'member' | 'admin';
export type PaymentMethod = 'balance' | 'deferred' | 'cash' | 'stripe';
export type PaymentStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';
export type ChargeMethod = 'cash' | 'stripe';
export type ChargeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ItemRequestStatus = 'pending' | 'approved' | 'rejected';
export type SettlementStatus = 'pending' | 'completed';
export type StockReason = 'restock' | 'purchase' | 'adjustment' | 'discard';
export type Platform = 'amazon' | 'rakuten' | 'yahoo' | 'other';

export interface User {
  id: string;
  slack_user_id?: string;
  slack_workspace_id?: string;
  name: string;
  avatar_url?: string;
  email?: string;
  balance: number;
  deferred_balance: number;
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
  description?: string;
  price: number;
  category_id?: string;
  category?: Category;
  image_url?: string;
  stock: number;
  stock_alert_threshold: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  user?: User;
  total_amount: number;
  payment_method: PaymentMethod;
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

// カート（クライアントサイドのみ）
export interface CartItem {
  item: Item;
  quantity: number;
}
