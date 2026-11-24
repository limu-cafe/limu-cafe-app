import {resolvePurchaseEntries,entrySubtotal,type PurchaseEntry} from './purchase-lines';
import { isObjectId } from './admin-objects';

export type StockReceiptRow = { item_id: string; quantity: number; subtotal: number | null;stock_quantity?:number };
export type PurchaseExpense = {line_id:string;label:string;quantity:number;subtotal:number|null};
export type StockReceiptInput = { rows: StockReceiptRow[]; expenses?:PurchaseExpense[]; purchase_lines?:PurchaseEntry[]; note: string; purchase: {
  payment_source: 'cashbox' | 'personal_advance'; total_amount: number;
  vendor: string | null; note: string | null; purchased_by: string | null; adjustment_amount?:number;
} | null; purchased_on?:string|null; received_on?:string|null; add_stock?:boolean };
export type StockReceipt = { ok: true; request_id: string; created_at: string; note?: string;
  purchased_on?:string|null;received_on?:string|null;add_stock?:boolean;
  intake_id?:string;purchase_lines?:PurchaseEntry[];expenses?:PurchaseExpense[];
  rows: { item_id: string; item_name: string; quantity: number; stock_before: number; stock_after: number; subtotal: number | null;stock_quantity?:number }[];
  purchase: { id: string; payment_source: string; total_amount: number; vendor: string | null; purchased_by: string; payer_name: string; cashbox_entry_id?: string | null;adjustment_amount?:number } | null;
};
const integer = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= 2147483647;
const text = (value: unknown, limit: number) => {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error('購入先またはメモを短くしてください');
  return value.trim() || null;
};
/** One receipt owns its rows and payment. Never silently submit only valid rows. */
export function parseStockReceipt(body: any): StockReceiptInput {
  if (!body || !Array.isArray(body.rows) || body.rows.length > 200) throw new Error('入荷する商品を1〜200種類選んでください');
  const rows = body.rows.map((row: any) => {
    if (!row || !isObjectId(row.item_id) || !integer(row.quantity, 1) || (row.subtotal != null && !integer(row.subtotal, 0))) throw new Error('各商品の入荷数と仕入れ額を整数で入力してください');
    if('stock_quantity' in row&&(!('purchase_lines' in body)||!integer(row.stock_quantity,0)||row.stock_quantity>row.quantity))throw new Error('在庫に追加する数を確認してください');
    return { item_id: row.item_id.toLowerCase(), quantity: row.quantity, subtotal: row.subtotal ?? null,...('stock_quantity' in row?{stock_quantity:row.stock_quantity}:{}) };
  }).sort((a: StockReceiptRow,b: StockReceiptRow) => a.item_id.localeCompare(b.item_id));
  if (new Set(rows.map((r: StockReceiptRow) => r.item_id)).size !== rows.length) throw new Error('同じ商品は一行にまとめてください');
  const expenses = 'expenses' in body ? parsePurchaseExpenses(body.expenses) : [];
  if(!rows.length&&!expenses.length||rows.length+expenses.length>200)throw new Error('買ったものを1〜200行入力してください');
  const resolved='purchase_lines' in body?resolvePurchaseEntries(body.purchase_lines):null;
  if(resolved&&(JSON.stringify(rows)!==JSON.stringify(resolved.rows.map(r=>({item_id:r.item_id,quantity:r.quantity,subtotal:r.subtotal,stock_quantity:r.stock_quantity})))||JSON.stringify(expenses)!==JSON.stringify(resolved.expenses)))throw new Error('購入明細と在庫・金額の内訳が一致しません');
  const costs=resolved?resolved.entries.map(e=>({subtotal:entrySubtotal(e)})):[...rows,...expenses];
  let purchase: StockReceiptInput['purchase'] = null;
  if (body.purchase != null) {
    const p = body.purchase;
    if (!['cashbox','personal_advance'].includes(p.payment_source) || !integer(p.total_amount,1)
      || (p.purchased_by != null && !isObjectId(p.purchased_by))) throw new Error('支払元・立替者・レシート合計を確認してください');
    const known = costs.filter((r) => r.subtotal !== null);
    const adjustment=p.adjustment_amount??0;
    if(!Number.isInteger(adjustment)||Math.abs(adjustment)>2147483647)throw new Error('送料・値引きを整数で入力してください');
    const knownTotal=costs.reduce((sum: number,r) => sum + (r.subtotal ?? 0),0)+adjustment;
    if (known.length && (known.length===costs.length?knownTotal!==p.total_amount:!resolved||knownTotal>p.total_amount)) throw new Error('商品別の仕入れ額と送料・値引きの合計をレシート金額に合わせてください');
    purchase = {payment_source:p.payment_source,total_amount:p.total_amount,vendor:text(p.vendor,300),note:text(p.note,2000),purchased_by:p.payment_source==='personal_advance'&&p.purchased_by?p.purchased_by.toLowerCase():null};
    if('adjustment_amount' in p)purchase.adjustment_amount=adjustment;
  } else if (expenses.length || rows.some((r: StockReceiptRow) => r.subtotal !== null)) throw new Error('仕入れ額を記録する場合は支払元も指定してください');
  const result:StockReceiptInput={rows,note:text(body.note,2000)??'入荷',purchase};
  if('expenses' in body)result.expenses=expenses;
  if(resolved){if(body.add_stock===false&&resolved.entries.some(e=>e.add_stock))throw new Error('在庫を追加しない買い物の明細を確認してください');result.purchase_lines=resolved.entries;}
  for(const key of ['purchased_on','received_on'] as const)if(key in body)result[key]=stockDate(body[key]);
  if('add_stock' in body){if(typeof body.add_stock!=='boolean')throw new Error('在庫への反映方法を指定してください');result.add_stock=body.add_stock;}
  if(result.add_stock===false&&!purchase)throw new Error('在庫登録済みの場合は仕入れ情報を入力してください');
  return result;
}
export function stockDate(value:unknown):string|null{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31')throw new Error('日付を確認してください');
 const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('実在する日付を入力してください');return value;
}

export function parsePurchaseExpenses(value:unknown):PurchaseExpense[]{
 if(!Array.isArray(value)||value.length>200)throw new Error('備品・雑費の明細が不正です');
 const rows=value.map(row=>{if(!row||!isObjectId(row.line_id)||typeof row.label!=='string'||!row.label.trim()||row.label.length>300||!integer(row.quantity,1)||(row.subtotal!=null&&!integer(row.subtotal,0)))throw new Error('備品・雑費の名前・個数・金額を確認してください');return {line_id:row.line_id.toLowerCase(),label:row.label.trim(),quantity:row.quantity,subtotal:row.subtotal??null};}).sort((a,b)=>a.line_id.localeCompare(b.line_id));
 if(new Set(rows.map(r=>r.line_id)).size!==rows.length)throw new Error('備品・雑費の明細番号が重複しています');return rows;
}
