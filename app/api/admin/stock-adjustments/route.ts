import {runAdminPayment} from '@/lib/payment-api';
import {isObjectId} from '@/lib/admin-objects';
export async function POST(request:Request){
 return runAdminPayment(request,'record_stock_adjustment',async actor=>{
  const b=await request.json().catch(()=>null);
  if(!isObjectId(b?.request_id)||!isObjectId(b.item_id)||!['count','discard','return'].includes(b.kind)
    ||!Number.isInteger(b.value)||b.value<(b.kind==='count'?0:1)||b.value>2147483647
    ||!Number.isInteger(b.expected_stock)||b.expected_stock< -2147483648||b.expected_stock>2147483647
    ||typeof b.note!=='string'||!b.note.trim()||b.note.length>2000)throw Error('数量と調整の理由を確認してください');
  return {p_request_id:b.request_id.toLowerCase(),p_item_id:b.item_id.toLowerCase(),p_kind:b.kind,p_value:b.value,p_expected_stock:b.expected_stock,p_note:b.note.trim(),p_actor_id:actor};
 },{action:'在庫調整',extraViews:['/admin/items','/admin/stock']});
}
