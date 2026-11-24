import {isObjectId} from './admin-objects';
/** Every purchase shortcut leads to the same object editor. */
export function purchaseEntryHref(options:{itemId?:string;source?:'cashbox'|'personal_advance';misc?:boolean;returnTo?:string}={}){
 const params=new URLSearchParams({record:'purchase'});
 if(isObjectId(options.itemId))params.set('item',options.itemId!);
 if(options.source)params.set('source',options.source);
 if(options.misc)params.set('misc','1');
 if(purchaseReturnHref(options.returnTo))params.set('returnTo',options.returnTo!);
 return '/admin/reimbursements?'+params;
}
export function purchaseReturnHref(value:unknown){
 if(typeof value!=='string'||!/^\/admin\/(items|cashbox)(?:\?|$)/.test(value)||value.includes('\\'))return null;
 return value;
}
