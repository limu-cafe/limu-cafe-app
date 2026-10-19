import type { Item } from '@/types';
import { isItemLowStock, isItemOutOfStock } from '@/lib/item-stock';

export class Product {
  constructor(readonly data: Item) {}
  get needsRestock() { return isItemLowStock(this.data); }
  get status() {
    if (!this.data.is_available) return '非表示';
    if (this.data.is_unlimited_stock) return '在庫管理なし';
    if (isItemOutOfStock(this.data)) return '売り切れ';
    return this.needsRestock ? '要補充' : '販売中';
  }
}

/** A metadata change cannot change stock, identifiers, balances or historical timestamps. */
export class ProductDetailsChange {
  readonly patch: Record<string, unknown> = {};
  readonly expectedUpdatedAt?: string;
  constructor(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('商品情報が不正です');
    const body = input as Record<string, unknown>;
    for (const field of ['name', 'english_name', 'description', 'image_url', 'category_id'] as const) {
      if (!(field in body)) continue;
      const value = body[field];
      if (field === 'name' && (typeof value !== 'string' || !value.trim())) throw new Error('商品名を入力してください');
      if (value !== null && typeof value !== 'string') throw new Error('商品情報の形式が不正です');
      this.patch[field] = typeof value === 'string' ? value.trim() || null : null;
    }
    for (const field of ['price', 'stock_alert_threshold'] as const) {
      if (!(field in body)) continue;
      const value = body[field];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error('価格と補充目安は0以上の整数で入力してください');
      this.patch[field] = value;
    }
    for (const field of ['is_available', 'is_unlimited_stock'] as const) {
      if (!(field in body)) continue;
      if (typeof body[field] !== 'boolean') throw new Error('表示設定が不正です');
      this.patch[field] = body[field];
    }
    for (const field of ['popular_override', 'new_arrival_override'] as const) {
      if (!(field in body)) continue;
      if (!['auto', 'show', 'hide'].includes(String(body[field]))) throw new Error('表示設定が不正です');
      this.patch[field] = body[field];
    }
    if (body.expected_updated_at !== undefined) {
      if (typeof body.expected_updated_at !== 'string' || !Number.isFinite(Date.parse(body.expected_updated_at))) throw new Error('商品を再読み込みしてください');
      this.expectedUpdatedAt = body.expected_updated_at;
    }
    if (!Object.keys(this.patch).length) throw new Error('変更する商品情報がありません');
  }
}

export class ProductCreation extends ProductDetailsChange {
  readonly initialStock: number;
  constructor(input: unknown) {
    super(input);
    if (!this.patch.name || this.patch.price === undefined) throw new Error('商品名と価格を入力してください');
    const stock = (input as Record<string, unknown>).stock ?? 0;
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > 2147483647) throw new Error('初期在庫は0以上の整数で入力してください');
    this.initialStock = stock;
  }
}
