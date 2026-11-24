import { isObjectId } from './admin-objects';
import { readIntegerInput } from './numeric-input';

const maxStock = 2_147_483_647;
const maxStocktakeItems = 200;

export type StocktakeItem = { id: string; name: string; stock: number; is_available: boolean };
export type StocktakeEntry = { item_id: string; expected_stock: number; actual_count: number };
export type StocktakeInput = { note: string; entries: StocktakeEntry[] };
export type StocktakeRow = { item_id: string; item_name: string; stock_before: number; stock_after: number };
export type StocktakeSummary = {
  request_id: string; created_at: string; actor_name: string; item_count: number; changed_count: number;
};
export type StocktakeResult = StocktakeSummary & { ok: true; note: string; entries: StocktakeRow[] };

const integer = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= maxStock;

/** Blank is uncounted. Zero is a count; invalid input is kept for correction. */
export function readStockCount(value: string): number | null | undefined {
  if (!value.trim()) return undefined;
  const count = readIntegerInput(value);
  return integer(count) ? count : null;
}

export function parseStocktake(input: unknown): StocktakeInput {
  if (!input || typeof input !== 'object') throw Error('棚卸の内容を確認してください');
  const { entries, note } = input as Record<string, unknown>;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > maxStocktakeItems) {
    throw Error(`棚卸に記録する商品は1〜${maxStocktakeItems}件です`);
  }
  if (typeof note !== 'string' || note.trim().length > 2000) throw Error('棚卸メモは2000文字までです');
  const ids = new Set<string>();
  const canonical = entries.map((value: unknown): StocktakeEntry => {
    if (!value || typeof value !== 'object') throw Error('商品ごとの実数を確認してください');
    const { item_id, expected_stock, actual_count } = value as Record<string, unknown>;
    if (!isObjectId(item_id) || !integer(expected_stock, -maxStock - 1) || !integer(actual_count)) {
      throw Error('商品と棚卸の数量を確認してください');
    }
    const id = item_id.toLowerCase();
    if (ids.has(id)) throw Error('棚卸に同じ商品が重複しています');
    ids.add(id);
    return { item_id: id, expected_stock, actual_count };
  }).sort((a,b) => a.item_id.localeCompare(b.item_id));
  return { note: note.trim(), entries: canonical };
}

export function matchesStocktake(value: unknown, input: StocktakeInput, requestId: string): value is StocktakeResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<StocktakeResult>;
  if (result.ok !== true || result.request_id !== requestId || result.note !== input.note
    || !Array.isArray(result.entries) || result.entries.length !== input.entries.length
    || result.item_count !== input.entries.length
    || result.changed_count !== input.entries.filter(row => row.actual_count !== row.expected_stock).length
    || typeof result.actor_name !== 'string' || typeof result.created_at !== 'string'
    || !Number.isFinite(Date.parse(result.created_at))) return false;
  return input.entries.every(row => {
    const saved = result.entries!.find(entry => entry?.item_id === row.item_id);
    return saved && typeof saved.item_name === 'string' && saved.stock_before === row.expected_stock && saved.stock_after === row.actual_count;
  });
}
