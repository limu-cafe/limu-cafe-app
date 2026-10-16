const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = (value: unknown, minimum: number) => typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 2147483647;
export type RestockInput = { item_id: string; quantity: number; note: string; purchase: { payment_source: 'cashbox' | 'personal_advance'; total_amount: number; vendor: string | null; note: string | null } | null };
function optionalText(value: unknown, limit: number) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > limit) throw new Error('入力した文字列が不正です');
  return value.trim() || null;
}
export function parseRestockInput(body: unknown): RestockInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('入荷情報が不正です');
  const input = body as Record<string, any>;
  if (typeof input.item_id !== 'string' || !UUID.test(input.item_id) || !integer(input.quantity, 1)) throw new Error('商品と1以上の整数の数量を指定してください');
  let purchase: RestockInput['purchase'] = null;
  if (input.purchase != null) {
    if (typeof input.purchase !== 'object' || Array.isArray(input.purchase)) throw new Error('仕入れ情報が不正です');
    if (input.purchase.record === true) {
      const p = input.purchase;
      if (!['cashbox', 'personal_advance'].includes(p.payment_source) || !integer(p.total_amount, 1)) throw new Error('支払い元と1円以上の整数の仕入れ合計額を指定してください');
      purchase = { payment_source: p.payment_source, total_amount: p.total_amount, vendor: optionalText(p.vendor, 300), note: optionalText(p.note, 2000) };
    }
  }
  return { item_id: input.item_id.toLowerCase(), quantity: input.quantity, note: optionalText(input.note, 2000) ?? '入荷', purchase };
}
export function validRestockRequestId(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
/** Retain an operation ID after an uncertain response so retrying cannot add stock twice. */
export class RestockSubmission {
  private readonly attempts = new Map<string, string>();
  requestId(input: unknown) {
    const fingerprint = JSON.stringify(input);
    let id = this.attempts.get(fingerprint);
    if (!id) { id = crypto.randomUUID(); this.attempts.set(fingerprint, id); }
    return id;
  }
  complete(input: unknown) { this.attempts.delete(JSON.stringify(input)); }
}
