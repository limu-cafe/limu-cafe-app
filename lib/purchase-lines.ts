import {isObjectId} from './admin-objects';
import {readIntegerInput} from './numeric-input';
export type PackageUnit='piece'|'box'|'pack';
export type PriceMode='unit'|'total';
export type PurchaseLineDraft={id:string;itemId:string;quantity:string;amount:string;kind?:'expense';label?:string;addStock?:boolean;price?:{mode:PriceMode;unit:string;total:string}};
export type PurchaseEntry={line_id:string;item_id:string|null;label:string|null;quantity:number;package_unit:PackageUnit;units_per_package:number;price_mode:PriceMode|'unknown';price:number|null;add_stock:boolean};
type Pricing={pricing:'unit'|'lines'|'receipt'};
const limit=2147483647;
const integer=(n:unknown,min=0):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=limit;
export const packageLabel=(unit:PackageUnit|undefined)=>unit==='box'?'箱':unit==='pack'?'パック':'個・本';
export function linePrice(p:Pricing,r:PurchaseLineDraft){return r.price??{mode:p.pricing==='unit'?'unit':'total',unit:p.pricing==='unit'?r.amount:'',total:p.pricing==='unit'?'':r.amount};}
export function linePriceValue(p:Pricing,r:PurchaseLineDraft){const price=linePrice(p,r);return price[price.mode];}
/** The active price is authoritative. A non-divisible total is never rounded into a unit quote. */
export function changeLinePrice(p:Pricing,r:PurchaseLineDraft,patch:{mode?:PriceMode;value?:string;quantity?:string}):PurchaseLineDraft{
 const price={...linePrice(p,r)},quantity=patch.quantity??r.quantity,q=readIntegerInput(quantity);
 if(patch.value!==undefined)price[price.mode]=patch.value;
 const value=readIntegerInput(price[price.mode],'money');
 if(integer(value)&&integer(q,1)){
  const derived=price.mode==='unit'?value*q:value/q;
  price[price.mode==='unit'?'total':'unit']=integer(derived)?String(derived):'';
 }
 if(patch.mode)price.mode=patch.mode;
 return {...r,quantity,amount:'',price};
}
export function purchaseQuantity(r:PurchaseLineDraft){
 const quantity=readIntegerInput(r.quantity);
 return integer(quantity,1)?quantity:NaN;
}
export function lineSubtotal(p:Pricing,r:PurchaseLineDraft):number|null{
 const price=linePrice(p,r),amount=readIntegerInput(price[price.mode],'money'),q=purchaseQuantity(r);
 if(!integer(amount)||!Number.isFinite(q))return null;
 const total=price.mode==='unit'?amount*q:amount;return integer(total)?total:null;
}
export function entrySubtotal(e:PurchaseEntry){return e.price_mode==='unknown'?null:e.price_mode==='unit'?e.price!*e.quantity:e.price;}
export function entryQuantityLabel(e:PurchaseEntry){return e.package_unit==='piece'?`${e.quantity}個`: `${e.quantity}${packageLabel(e.package_unit)} × ${e.units_per_package}個入（計${e.quantity*e.units_per_package}個）`;}
/** Normalize stored purchase lines, including older records with box or pack quantities. */
export function resolvePurchaseEntries(value:unknown){
 if(!Array.isArray(value)||!value.length||value.length>200)throw Error('買ったものを1〜200行入力してください');
 const entries:PurchaseEntry[]=value.map(e=>{
  if(!e||!isObjectId(e.line_id)||(e.item_id!==null&&!isObjectId(e.item_id))||!integer(e.quantity,1)||!['piece','box','pack'].includes(e.package_unit)||!integer(e.units_per_package,1)||e.package_unit==='piece'&&e.units_per_package!==1||!integer(e.quantity*e.units_per_package,1)||!['unit','total','unknown'].includes(e.price_mode)||e.price_mode==='unknown'&&e.price!==null||e.price_mode!=='unknown'&&!integer(e.price)||typeof e.add_stock!=='boolean'||e.item_id===null&&(typeof e.label!=='string'||!e.label.trim()||e.label.length>300||e.add_stock))throw Error('買ったものの数量・入数・金額を確認してください');
  const result:PurchaseEntry={line_id:e.line_id.toLowerCase(),item_id:e.item_id?.toLowerCase()??null,label:e.item_id===null?e.label.trim():null,quantity:e.quantity,package_unit:e.package_unit,units_per_package:e.units_per_package,price_mode:e.price_mode,price:e.price,add_stock:e.add_stock};
  const subtotal=entrySubtotal(result);if(subtotal!==null&&!integer(subtotal))throw Error('明細の金額が大きすぎます');return result;
 }).sort((a,b)=>a.line_id.localeCompare(b.line_id));
 if(new Set(entries.map(e=>e.line_id)).size!==entries.length)throw Error('明細番号が重複しています');
 const products=new Map<string,{item_id:string;quantity:number;stock_quantity:number;subtotal:number|null}>();
 const expenses:{line_id:string;label:string;quantity:number;subtotal:number|null}[]=[];
 let knownAmount=0,unknownCount=0;
 for(const e of entries){
  const quantity=e.quantity*e.units_per_package,subtotal=entrySubtotal(e);
  if(subtotal===null)unknownCount++;else knownAmount+=subtotal;
  if(e.item_id){const row=products.get(e.item_id)??{item_id:e.item_id,quantity:0,stock_quantity:0,subtotal:0};row.quantity+=quantity;row.stock_quantity+=e.add_stock?quantity:0;row.subtotal=row.subtotal===null||subtotal===null?null:row.subtotal+subtotal;if(!integer(row.quantity,1)||!integer(row.stock_quantity)||(row.subtotal!==null&&!integer(row.subtotal)))throw Error('合計した数量または金額が大きすぎます');products.set(e.item_id,row);}
  else expenses.push({line_id:e.line_id,label:e.label!,quantity,subtotal});
 }
 return {entries,rows:Array.from(products.values()).sort((a,b)=>a.item_id.localeCompare(b.item_id)),expenses,knownAmount,unknownCount};
}
