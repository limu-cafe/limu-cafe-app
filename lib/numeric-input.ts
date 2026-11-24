/** Accept common Japanese keyboard/receipt formats without rounding or eval. */
export function readIntegerInput(raw:string,kind:'count'|'money'|'signed'='count'){
 let value=raw.normalize('NFKC').trim();
 if(kind!=='count')value=value.replace(/^¥\s*/,'').replace(/\s*円$/,'').trim();
 const sign=kind==='signed'?'[-+]?':'';
 if(!new RegExp(`^${sign}(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$`).test(value))return NaN;
 const number=Number(value.replaceAll(',',''));
 return Number.isSafeInteger(number)?number:NaN;
}
export function normalizeIntegerInput(raw:string,kind:'count'|'money'|'signed'='count'){
 const value=readIntegerInput(raw,kind);return Number.isFinite(value)?String(value):raw;
}
export function stepQuantity(raw:string,delta:number){
 const current=readIntegerInput(raw);return String(Math.max(1,Math.min(2147483647,(Number.isFinite(current)?current:0)+delta)));
}
