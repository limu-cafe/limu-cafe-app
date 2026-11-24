import {runAdminPayment} from '@/lib/payment-api';
import {isObjectId} from '@/lib/admin-objects';
import {parseStockIntake} from '@/lib/stock-intakes';

/** The common purchase editor requires the complete product-and-supplies contract. */
export async function POST(request:Request){
 const body=await request.json().catch(()=>null);
 const detailed=Array.isArray(body?.receipts)&&body.receipts.some((r:any)=>r&&typeof r==='object'&&'purchase_lines' in r);
 return runAdminPayment(request,detailed?'record_purchase_v2':'record_purchase',async actor=>{
  if(!isObjectId(body?.request_id))throw new Error('画面を再読み込みしてから買い物を記録してください');
  return {p_request_id:body.request_id.toLowerCase(),p_input:parseStockIntake(body),p_actor_id:actor};
 },{action:'買い物',extraViews:['/admin/items','/admin/stock']});
}
