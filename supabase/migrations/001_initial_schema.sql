-- ============================================================
-- LIMU喫茶 データベース設計
-- Supabase (PostgreSQL) マイグレーションファイル
-- ============================================================

-- 拡張機能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ユーザーテーブル
-- Supabase AuthのユーザーとSlack情報を紐付け
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_user_id TEXT UNIQUE,           -- SlackのユーザーID
  slack_workspace_id TEXT,             -- SlackのワークスペースID（研究室のもの）
  name TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT,
  balance INTEGER NOT NULL DEFAULT 0,  -- 残高（円単位）
  deferred_balance INTEGER NOT NULL DEFAULT 0, -- 後払い残高（円単位）
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  is_approved BOOLEAN NOT NULL DEFAULT false, -- 管理者承認フラグ
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- カテゴリテーブル
-- ============================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,           -- 例: 飲み物, お菓子, 食器, 備品
  icon TEXT,                           -- 絵文字アイコン
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 商品テーブル
-- ============================================================
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,              -- 円単位
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_alert_threshold INTEGER NOT NULL DEFAULT 3, -- アラートを出す在庫数
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 注文テーブル
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_amount INTEGER NOT NULL,       -- 合計金額（円）
  payment_method TEXT NOT NULL CHECK (payment_method IN ('balance', 'deferred', 'cash', 'stripe')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed', 'cancelled', 'refunded')),
  cash_confirmed_at TIMESTAMPTZ,       -- 現金支払い確認日時
  cash_confirmed_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 注文明細テーブル
-- ============================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_name TEXT NOT NULL,             -- 注文時の商品名（後で商品が変わっても記録が残る）
  item_price INTEGER NOT NULL,         -- 注文時の単価
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- チャージ申請テーブル（前払い残高のチャージ）
-- ============================================================
CREATE TABLE charge_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'stripe')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  stripe_payment_intent_id TEXT,       -- Stripeの場合
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 精算テーブル（後払いの月次精算）
-- ============================================================
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,             -- 精算金額
  period_start DATE NOT NULL,          -- 精算対象期間（開始）
  period_end DATE NOT NULL,            -- 精算対象期間（終了）
  method TEXT NOT NULL CHECK (method IN ('cash', 'stripe', 'balance')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  settled_by UUID REFERENCES users(id),
  settled_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 商品要望テーブル
-- ============================================================
CREATE TABLE item_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  reason TEXT,
  desired_price INTEGER,               -- 希望価格
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,                     -- 管理者コメント
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 在庫履歴テーブル（入荷・消費の記録）
-- ============================================================
CREATE TABLE stock_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  change_amount INTEGER NOT NULL,      -- 正=入荷, 負=消費
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'purchase', 'adjustment', 'discard')),
  order_id UUID REFERENCES orders(id), -- 購入の場合
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 価格監視テーブル
-- ============================================================
CREATE TABLE price_watches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name TEXT NOT NULL,             -- 監視対象の商品名（メモ用）
  url TEXT NOT NULL,                   -- 商品URL
  platform TEXT NOT NULL CHECK (platform IN ('amazon', 'rakuten', 'yahoo', 'other')),
  target_price INTEGER NOT NULL,       -- 目標価格（これ以下になったら通知）
  current_price INTEGER,               -- 最後に取得した価格
  last_checked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notified_at TIMESTAMPTZ,             -- 最後に通知した日時
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_charge_requests_user_id ON charge_requests(user_id);
CREATE INDEX idx_charge_requests_status ON charge_requests(status);
CREATE INDEX idx_settlements_user_id ON settlements(user_id);
CREATE INDEX idx_stock_history_item_id ON stock_history(item_id);
CREATE INDEX idx_item_requests_user_id ON item_requests(user_id);
CREATE INDEX idx_item_requests_status ON item_requests(status);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER charge_requests_updated_at BEFORE UPDATE ON charge_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER item_requests_updated_at BEFORE UPDATE ON item_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER price_watches_updated_at BEFORE UPDATE ON price_watches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS) ポリシー
-- ============================================================

-- usersテーブル
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "admin_all_users" ON users FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- itemsテーブル（誰でも閲覧可、管理者のみ変更可）
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_select_all" ON items FOR SELECT USING (true);
CREATE POLICY "admin_all_items" ON items FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- ordersテーブル
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_own" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_all_orders" ON orders FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- order_itemsテーブル
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select_own" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE id = order_id AND user_id = auth.uid())
);
CREATE POLICY "admin_all_order_items" ON order_items FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- charge_requestsテーブル
ALTER TABLE charge_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charge_select_own" ON charge_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "charge_insert_own" ON charge_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_all_charges" ON charge_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- item_requestsテーブル
ALTER TABLE item_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_req_select_own" ON item_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "item_req_insert_own" ON item_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_all_item_requests" ON item_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- categoriesテーブル
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select_all" ON categories FOR SELECT USING (true);
CREATE POLICY "admin_all_categories" ON categories FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- 初期データ
-- ============================================================
INSERT INTO categories (name, icon, sort_order) VALUES
  ('飲み物', '☕', 1),
  ('お菓子', '🍫', 2),
  ('食事', '🍱', 3),
  ('食器', '🍽️', 4),
  ('備品', '📦', 5);
