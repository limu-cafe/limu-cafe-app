import {isObjectId} from './admin-objects';
import {parseStockReceipt,parsePurchaseExpenses,type StockReceipt,type StockReceiptInput} from './stock-receipts';
import {changeLinePrice,linePrice,linePriceValue,lineSubtotal,purchaseQuantity,resolvePurchaseEntries,type PurchaseEntry,type PurchaseLineDraft} from './purchase-lines';
import {readIntegerInput} from './numeric-input';
export type StockIntakeInput={receipts:({receipt_id:string}&StockReceiptInput)[]};
export type StockIntakeResult={ok:true;request_id:string;created_at:string;receipts:StockReceipt[];stock_totals:{item_id:string;item_name:string;quantity:number;stock_before:number;stock_after:number}[];total_amount:number};
/** Bulk entry is a container of purchases, never a shared supplier/date/payment. */
export function parseStockIntake(body:any):StockIntakeInput{
 if(!body||!Array.isArray(body.receipts)||!body.receipts.length||body.receipts.length>50)throw new Error('買い物を1〜50件入力してください');
 let count=0;
 const receipts=body.receipts.map((receipt:any,index:number)=>{try{
  if(!receipt||!isObjectId(receipt.receipt_id)||!Array.isArray(receipt.rows)||!receipt.rows.length&&!receipt.expenses?.length)throw new Error('買い物ごとの商品を入力してください');
  if('purchase_lines' in receipt){const resolved=resolvePurchaseEntries(receipt.purchase_lines);receipt={...receipt,purchase_lines:resolved.entries};}
  const expenses='expenses' in receipt?parsePurchaseExpenses(receipt.expenses):[];
  count+=receipt.purchase_lines?.length??receipt.rows.length+expenses.length;if(count>200)throw new Error('一度に登録できる明細は200行までです');
  const merged=new Map<string,{item_id:string;quantity:number;subtotal:number|null}>();
  const costs=[...receipt.rows,...expenses];
  const known=costs.filter((r:any)=>r?.subtotal!=null).length;
  if(!receipt.purchase_lines&&known&&known!==costs.length)throw new Error('金額が不明な買い物は、レシート合計で入力してください');
  for(const row of receipt.rows){
   if(!row||!isObjectId(row.item_id)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>2147483647||(row.subtotal!=null&&(!Number.isInteger(row.subtotal)||row.subtotal<0||row.subtotal>2147483647)))throw new Error('明細の数量と金額を確認してください');
   if('stock_quantity' in row&&(!receipt.purchase_lines||!Number.isInteger(row.stock_quantity)||row.stock_quantity<0||row.stock_quantity>row.quantity))throw new Error('在庫に追加する数を確認してください');
   const id=row.item_id.toLowerCase(),prior=merged.get(id)??{item_id:id,quantity:0,subtotal:row.subtotal==null?null:0};
   prior.quantity+=row.quantity;if('stock_quantity' in row)(prior as any).stock_quantity=((prior as any).stock_quantity??0)+row.stock_quantity;prior.subtotal=prior.subtotal===null||row.subtotal==null?null:prior.subtotal+row.subtotal;
   if(prior.quantity>2147483647||(prior.subtotal??0)>2147483647)throw new Error('数量または金額が大きすぎます');merged.set(id,prior);
  }
  return {receipt_id:receipt.receipt_id.toLowerCase(),...parseStockReceipt({...receipt,rows:Array.from(merged.values()),purchased_on:receipt.purchased_on??null,received_on:receipt.received_on??null,add_stock:receipt.add_stock??true})};
 }catch(e){throw new PurchaseInputError(`${index+1}件目の買い物：${(e as Error).message}`,receipt?.receipt_id);}}).sort((a:StockIntakeInput['receipts'][number],b:StockIntakeInput['receipts'][number])=>a.receipt_id.localeCompare(b.receipt_id));
 if(new Set(receipts.map((r:StockIntakeInput['receipts'][number])=>r.receipt_id)).size!==receipts.length)throw new Error('同じ買い物が重複しています');
 return {receipts};
}
export type PurchaseDraft={id:string;lines:PurchaseLineDraft[];scope:'both'|'stock'|'purchase';pricing:'lines'|'unit'|'receipt';linePricing:'lines'|'unit';total:string;adjustment:string;vendor:string;purchasedOn:string;receivedOn:string;source:'cashbox'|'personal_advance';otherPayer:boolean;payer:string;note:string};
export type IntakeDraft={purchases:PurchaseDraft[]};
export const emptyIntakeLine=(itemId=''):PurchaseDraft['lines'][number]=>({id:crypto.randomUUID(),itemId,quantity:'1',amount:'',price:{mode:'total',unit:'',total:''}});
export const isBlankIntakeLine=(r:PurchaseDraft['lines'][number])=>!r.kind&&!r.itemId&&!linePriceValue({pricing:'lines'},r).trim()&&!r.amount.trim()&&!(r.price?.unit.trim()||r.price?.total.trim())&&(!r.quantity.trim()||readIntegerInput(r.quantity)===1);
export const emptyPurchase=(source:PurchaseDraft['source']='cashbox'):PurchaseDraft=>({id:crypto.randomUUID(),lines:[emptyIntakeLine()],scope:'both',pricing:'lines',linePricing:'lines',total:'',adjustment:'',vendor:'',purchasedOn:'',receivedOn:'',source,otherPayer:false,payer:'',note:''});
export const emptyIntake=(source:PurchaseDraft['source']='cashbox',itemId=''):IntakeDraft=>({purchases:[{...emptyPurchase(source),lines:[emptyIntakeLine(itemId)]}]});
export const intakeLineAmount=lineSubtotal;
export {linePrice,linePriceValue,changeLinePrice,purchaseQuantity};

export function purchaseAmount(p:PurchaseDraft){
 if(p.scope==='stock')return 0;
 if(p.pricing==='receipt')return readIntegerInput(p.total,'money');
 const lines=p.lines.filter(r=>!isBlankIntakeLine(r));
 if(lines.some(r=>intakeLineAmount(p,r)===null))return NaN;
 return lines.reduce((sum,r)=>sum+(intakeLineAmount(p,r)??0),0)+intakeAdjustment(p);
}
export function intakeAdjustment(p:PurchaseDraft){
 const lines=p.lines.filter(r=>!isBlankIntakeLine(r));
 if(p.pricing==='receipt'&&lines.length&&lines.every(r=>intakeLineAmount(p,r)!==null))return readIntegerInput(p.total,'money')-lines.reduce((sum,r)=>sum+intakeLineAmount(p,r)!,0);
 return p.adjustment.trim()?readIntegerInput(p.adjustment,'signed'):0;
}
export function intakePayload(draft:IntakeDraft):StockIntakeInput{
 return parseStockIntake({receipts:draft.purchases.map((p,index)=>{try{
  const lines=p.lines.filter(r=>!isBlankIntakeLine(r));
  if(p.scope==='stock'&&lines.some(r=>r.kind==='expense'))throw new Error('備品・雑費には支払元の記録が必要です');
  if(p.scope!=='stock'&&p.otherPayer&&p.source==='personal_advance'&&!p.payer)throw new Error('実際の立替者を選んでください');
  const entries:PurchaseEntry[]=lines.map(r=>{const price=linePrice(p,r),value=linePriceValue(p,r),unknown=p.scope==='stock'||p.pricing==='receipt'&&!value.trim()&&!price.unit.trim()&&!price.total.trim();
   if(!unknown&&intakeLineAmount(p,r)===null)throw new Error('金額と個数を正しい整数で入力してください');
   return {line_id:r.id,item_id:r.kind==='expense'?null:r.itemId,label:r.kind==='expense'?r.label??'':null,quantity:purchaseQuantity(r),package_unit:'piece',units_per_package:1,price_mode:unknown?'unknown':price.mode,price:unknown?null:readIntegerInput(value,'money'),add_stock:r.kind!=='expense'&&p.scope!=='purchase'&&(p.scope==='stock'||r.addStock!==false)};
  });
  const resolved=resolvePurchaseEntries(entries);
  return {receipt_id:p.id,rows:resolved.rows,expenses:resolved.expenses,purchase_lines:resolved.entries,
   purchased_on:p.purchasedOn,received_on:p.scope==='purchase'?null:p.receivedOn,add_stock:p.scope!=='purchase',note:p.note||(p.scope==='stock'?'入荷':'買い物'),
   purchase:p.scope==='stock'?null:{payment_source:p.source,total_amount:purchaseAmount(p),adjustment_amount:intakeAdjustment(p),vendor:p.vendor,note:p.note,purchased_by:p.source==='personal_advance'&&p.otherPayer?p.payer:null}};
 }catch(e){throw new PurchaseInputError(`${index+1}件目の買い物：${(e as Error).message}`,p.id);}})});
}

export function withPurchasePricing(p:PurchaseDraft,pricing:PurchaseDraft['pricing']):PurchaseDraft{
 if(pricing==='receipt')return {...p,pricing};
 const before=p.linePricing??'lines';
 return {...p,pricing,linePricing:pricing,lines:p.lines.map(row=>{
  if(row.price)return changeLinePrice(p,row,{mode:pricing==='unit'?'unit':'total'});
  if(before===pricing||row.amount.trim()==='')return row;
  const value=readIntegerInput(row.amount,'money'),quantity=readIntegerInput(row.quantity);
  const amount=pricing==='unit'?value/quantity:value*quantity;
  return {...row,amount:Number.isInteger(amount)&&amount>=0&&amount<=2147483647?String(amount):''};
 })};
}

export class PurchaseInputError extends Error{constructor(message:string,public receiptId?:string){super(message);}}
export function matchesStockIntake(result:any,input:StockIntakeInput,id:string):result is StockIntakeResult{
 if(!result?.ok||result.request_id!==id||!Array.isArray(result.receipts)||result.receipts.length!==input.receipts.length||new Set(result.receipts.map((r:any)=>r.request_id)).size!==result.receipts.length||result.total_amount!==input.receipts.reduce((sum,r)=>sum+(r.purchase?.total_amount??0),0))return false;
 const stock=new Map<string,number>();
 for(const r of input.receipts){
  const saved=result.receipts.find((s:any)=>s.request_id===r.receipt_id);
  if(r.purchase_lines){try{if(JSON.stringify(resolvePurchaseEntries(saved?.purchase_lines).entries)!==JSON.stringify(r.purchase_lines))return false;}catch{return false;}}
  const expenses=saved?.expenses??[],expected=r.expenses??[];if(!Array.isArray(expenses)||expenses.length!==expected.length||new Set(expenses.map((e:any)=>e.line_id)).size!==expected.length||expected.some(e=>!expenses.some((s:any)=>s.line_id===e.line_id&&s.label===e.label&&s.quantity===e.quantity&&s.subtotal===e.subtotal)))return false;
  if(!saved||saved.intake_id!==id||saved.add_stock!==r.add_stock||(saved.purchased_on??null)!==(r.purchased_on??null)||(saved.received_on??null)!==(r.received_on??null)||(saved.purchase?.total_amount??null)!==(r.purchase?.total_amount??null)||(saved.purchase?.payment_source??null)!==(r.purchase?.payment_source??null)||(r.purchase?.purchased_by&&saved.purchase?.purchased_by!==r.purchase.purchased_by)||!Array.isArray(saved.rows)||saved.rows.length!==r.rows.length||new Set(saved.rows.map((s:any)=>s.item_id)).size!==r.rows.length)return false;
  for(const row of r.rows){const s=saved.rows.find((s:any)=>s.item_id===row.item_id);if(!s||s.quantity!==row.quantity||!Number.isInteger(s.stock_before)||!Number.isInteger(s.stock_after)||s.stock_after-s.stock_before!==(r.add_stock?(row.stock_quantity??row.quantity):0))return false;if(r.add_stock&&(row.stock_quantity??row.quantity)>0)stock.set(row.item_id,(stock.get(row.item_id)??0)+(row.stock_quantity??row.quantity));}
 }
 if(!Array.isArray(result.stock_totals)||result.stock_totals.length!==stock.size||new Set(result.stock_totals.map((s:any)=>s.item_id)).size!==stock.size)return false;
 return result.stock_totals.every((s:any)=>stock.get(s.item_id)===s.quantity&&Number.isInteger(s.stock_before)&&Number.isInteger(s.stock_after)&&s.stock_after-s.stock_before===s.quantity);
}
