const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,text,flush}=require('./helpers/ui-fixture.cjs');
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const items=[{id:id(10),name:'水',stock:12,price:100,is_available:true,is_unlimited_stock:false},{id:id(11),name:'緑茶',stock:15,price:130,is_available:true,is_unlimited_stock:false}];
const purchase=n=>({id:id(n),lines:[{id:id(n+1000),itemId:'',quantity:'1',amount:''}],scope:'both',pricing:'unit',linePricing:'unit',total:'',adjustment:'',vendor:'',purchasedOn:'',receivedOn:'',source:'cashbox',otherPayer:false,payer:'',note:''});
function editor(){const props={items,draft:{purchases:[purchase(201)]},onChange:d=>props.draft=d,onBusyChange:b=>props.busy=b,onRecorded:r=>props.receipt=r,submission:{id:null,requestId(){return this.id??=id(100)},complete(){this.id=null;}}};return{props,h:fixture('components/admin/StockReceiptEditor.tsx',props)}};
const label=(row,field,p=1)=>`買い物${p} 明細${row}の${field}`;
const ariaButton=(h,label)=>h.all().find(n=>n.type==='button'&&n.props['aria-label']===label);
async function add(h,p=1){ariaButton(h,`買い物${p}に商品を追加`).props.onClick();await flush();}
function row(h,n,item,price,quantity='1',p=1){h.change(label(n,'商品',p),id(item));h.change(label(n,'単価',p),price);h.change(label(n,'個数',p),quantity);}
async function two(h){row(h,1,10,'60','2');await add(h);row(h,2,11,'70','3');}
function key(h,field,value){let prevented=false;h.field(field).props.onKeyDown({key:value,nativeEvent:{isComposing:false},preventDefault(){prevented=true;}});return prevented;}
function response(call){const stocks=Object.fromEntries(items.map(i=>[i.id,i.stock])),totals=new Map();const receipts=call.body.receipts.map(r=>({ok:true,request_id:r.receipt_id,intake_id:call.body.request_id,created_at:'2026-11-20T00:00:00Z',add_stock:r.add_stock,purchased_on:r.purchased_on,received_on:r.received_on,expenses:r.expenses,purchase_lines:r.purchase_lines,purchase:r.purchase?{...r.purchase,id:id(500),purchased_by:r.purchase.purchased_by??id(1),payer_name:'立替者'}:null,rows:r.rows.map(row=>{const before=stocks[row.item_id];if(r.add_stock&&(row.stock_quantity??row.quantity)>0){stocks[row.item_id]+=row.stock_quantity??row.quantity;totals.set(row.item_id,(totals.get(row.item_id)??0)+(row.stock_quantity??row.quantity));}return{...row,item_name:items.find(i=>i.id===row.item_id).name,stock_before:before,stock_after:stocks[row.item_id]};})}));return{ok:true,status:200,json:async()=>({ok:true,request_id:call.body.request_id,created_at:'2026-11-20',receipts,total_amount:receipts.reduce((sum,r)=>sum+(r.purchase?.total_amount??0),0),stock_totals:Array.from(totals,([item_id,quantity])=>({item_id,item_name:items.find(i=>i.id===item_id).name,quantity,stock_before:items.find(i=>i.id===item_id).stock,stock_after:stocks[item_id]}))})};}
test('total, unit and receipt amounts can be entered directly with optional metadata closed',()=>{
 const {h}=editor();assert.equal(h.field(label(1,'個数')).props.value,'1');assert.equal(h.field(label(1,'合計金額')).props.value,'');assert.equal(h.field(label(1,'単価')).props.value,'');assert.equal(h.field('買い物1のレシート合計').props.value,'');assert.equal(h.field(label(1,'単価')).props.inputMode,'numeric');assert.equal(h.all().find(n=>n.type==='details').props.open,undefined);assert.ok(text(h.render()).includes('金庫払い'));assert.equal(h.calls.length,0);
});
test('full-width prices and comma yen input calculate exactly, keyboard quantity changes clamp at one and focus selects all',async()=>{
 const {h,props}=editor();row(h,1,10,'￥１，２００円','２');let selected=0;h.field(label(1,'単価')).props.onFocus({currentTarget:{select(){selected++;}}});h.field(label(1,'個数')).props.onFocus({currentTarget:{select(){selected++;}}});assert.equal(selected,2);assert.ok(text(h.render()).includes('¥2,400'));
 assert.equal(key(h,label(1,'個数'),'ArrowUp'),true);assert.equal(h.field(label(1,'個数')).props.value,'3');assert.ok(text(h.render()).includes('¥3,600'));
 for(let i=0;i<3;i++)assert.equal(key(h,label(1,'個数'),'ArrowDown'),true);
 assert.equal(h.field(label(1,'個数')).props.value,'1');
 h.field(label(1,'単価')).props.onBlur({target:{value:'￥１，２００円'}});assert.equal(h.field(label(1,'単価')).props.value,'1200');await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(props.receipt.total_amount,1200);assert.equal(h.calls[0].body.receipts[0].rows[0].quantity,1);
});
test('Enter advances without saving and appends an untouched row that does not block registration',async()=>{
 const {h,props}=editor();row(h,1,10,'120','2');assert.equal(key(h,label(1,'単価'),'Enter'),true);assert.equal(key(h,label(1,'個数'),'Enter'),true);assert.equal(props.draft.purchases[0].lines.length,2);assert.equal(h.field(label(2,'個数')).props.value,'1');assert.equal(h.calls.length,0);await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(h.calls[0].body.receipts[0].rows.length,1);assert.equal(props.receipt.total_amount,240);
});
test('partially completed rows and invalid integers never silently enter inventory or money records',async()=>{
 for(const invalid of ['0.5','1e3','1,20','-1','9007199254740993']){const {h}=editor();row(h,1,10,invalid,'2');await h.click('登録内容を確認');assert.equal(h.calls.length,0);assert.ok(text(h.render()).includes('整数'));}
 const {h}=editor();row(h,1,10,'120');await add(h);h.change(label(2,'個数'),'2');await h.click('登録内容を確認');assert.equal(h.calls.length,0);assert.ok(text(h.render()).includes('商品を選んで'));
});
test('different stores and dates keep separate records and automatically aggregate repeated product inventory',async()=>{
 const {h,props}=editor();await two(h);h.change('買い物1の購入先','A店');h.change('買い物1の購入日','2026-10-01');h.change('買い物1の入荷日','2026-10-02');await h.click('＋ 別の店・日付の買い物');row(h,1,10,'60','5',2);h.change('買い物2の購入先','B店');h.change('買い物2の購入日','2026-10-05');h.change('買い物2の入荷日','2026-10-06');assert.ok(text(h.render()).includes('¥630'));await h.click('登録内容を確認');assert.equal(h.calls.length,0);assert.ok(text(h.render()).includes('＋7個'));assert.ok(text(h.render()).includes('A店 · 2026-10-01'));assert.ok(text(h.render()).includes('B店 · 2026-10-05'));
 h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.receipts.length,2);assert.equal(props.receipt.total_amount,630);assert.equal(props.receipt.stock_totals.find(r=>r.item_id===id(10)).quantity,7);
 assert.equal(props.draft.purchases.map(purchase=>h.calls[0].body.receipts.find(receipt=>receipt.receipt_id===purchase.id).purchase.payment_source).join(','),'cashbox,personal_advance');
});
test('repeated products retain independent unit prices and coalesce exact costs and quantities in one receipt',async()=>{
 const {h}=editor();row(h,1,10,'50','2');await add(h);row(h,2,10,'60','3');await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.deepEqual(h.calls[0].body.receipts[0].rows,[{item_id:id(10),quantity:5,subtotal:280,stock_quantity:5}]);
});
test('discounts and alternate receipt total remain available without losing the unit-price draft',async()=>{
 const {h}=editor();row(h,1,10,'60','3');h.change('買い物1の送料・値引き','－１０');assert.ok(text(h.render()).includes('¥170'));await h.click('登録内容を確認');h.setResponder(async()=>({ok:false,status:409,json:async()=>({error:'conflict'})}));await h.click('まとめて登録');assert.equal(h.calls[0].body.receipts[0].purchase.total_amount,170);assert.equal(h.calls[0].body.receipts[0].purchase.adjustment_amount,-10);
 await h.click('入力に戻る');assert.equal(h.field(label(1,'合計金額')).props.placeholder,'180');
 h.change('買い物1のレシート合計','500');h.change('買い物1のレシート合計','');
 assert.ok(text(h.render()).includes('¥170'));assert.equal(h.field(label(1,'単価')).props.value,'60');h.change('買い物1のレシート合計','４００円');await h.click('登録内容を確認');await h.click('まとめて登録');assert.equal(h.calls[1].body.receipts[0].purchase.total_amount,400);assert.equal(h.calls[1].body.receipts[0].rows[0].subtotal,180);assert.equal(h.calls[1].body.receipts[0].purchase.adjustment_amount,220);
});
test('invalid dates stay attached to the correct purchase for correction',async()=>{
 const {h,props}=editor();await two(h);h.change('買い物1の購入日','2026-02-30');await h.click('＋ 別の店・日付の買い物');row(h,1,10,'100','2',2);await h.click('登録内容を確認');assert.equal(h.calls.length,0);assert.ok(text(h.render()).includes('1件目の買い物'));assert.equal(h.field('買い物1の購入日').props.value,'2026-02-30');assert.equal(props.draft.purchases.length,2);
});
test('purchase-only never adds stock; inventory-only never creates an expense and scope changes retain prices',async()=>{
 const {h}=editor();await two(h);h.change('買い物1の記録内容','purchase');await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(h.calls[0].body.receipts[0].add_stock,false);
 const second=editor();await two(second.h);second.h.change('買い物1の記録内容','stock');second.h.change('買い物1の記録内容','both');assert.equal(second.h.field(label(1,'単価')).props.value,'60');second.h.change('買い物1の記録内容','stock');await second.h.click('登録内容を確認');second.h.setResponder(async call=>response(call));await second.h.click('まとめて登録');assert.equal(second.h.calls[0].body.receipts[0].purchase,null);
});
test('actual payer stays explicit and independent of the recorder',async()=>{
 const {h,props}=editor();await two(h);h.change('買い物1の支払元','personal_advance');h.change('別の人が立て替えた買い物',true);await h.click('登録内容を確認');assert.equal(h.calls.length,0);props.draft.purchases[0].payer=id(2);await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(h.calls[0].body.receipts[0].purchase.purchased_by,id(2));
});
test('uncertain results freeze edits and retry the identical operation without duplicate registration',async()=>{
 const {h,props}=editor();await two(h);await h.click('登録内容を確認');let reply;h.setResponder(()=>new Promise(resolve=>reply=resolve));h.button('まとめて登録').props.onClick();h.button('登録中…').props.onClick();assert.equal(h.calls.length,1);reply({ok:true,status:200,json:async()=>{throw Error('lost')}});await flush();assert.equal(props.busy,true);assert.equal(h.button('入力に戻る').props.disabled,true);const original=JSON.stringify(h.calls[0].body);h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(JSON.stringify(h.calls[1].body),original);assert.equal(props.busy,false);assert.equal(props.receipt.total_amount,330);
});
test('mismatched inventory results are not treated as confirmed success',async()=>{
 const {h,props}=editor();await two(h);await h.click('登録内容を確認');h.setResponder(async call=>{const r=response(call),body=await r.json();body.receipts[0].add_stock=false;return{...r,json:async()=>body};});await h.click('まとめて登録');assert.equal(props.receipt,undefined);assert.equal(props.busy,true);assert.ok(text(h.render()).includes('登録結果が未確認'));
});
test('purchase entry is centralized on reimbursements and closing retains mixed purchase drafts',async()=>{
 const h=fixture('app/admin/reimbursements/ReimbursementsClient.tsx',{items,purchaseRuns:[],miscExamples:[]});await h.click('買い物を記録');let component=h.all().find(n=>n.props?.draft&&n.props?.onRecorded);const d=component.props.draft;assert.equal(d.purchases[0].source,'personal_advance');component.props.onChange({purchases:[{...d.purchases[0],vendor:'A店',lines:[{id:id(55),itemId:id(10),quantity:'12',amount:'600'},{id:id(56),itemId:'',kind:'expense',label:'ペーパータオル',quantity:'2',amount:'100'}]},purchase(202)]});h.all().find(n=>n.props?.closeLabel==='買い物入力を閉じる').props.onClose();await h.click('買い物を記録');component=h.all().find(n=>n.props?.draft&&n.props?.onRecorded);assert.equal(component.props.draft.purchases.length,2);assert.equal(component.props.draft.purchases[0].lines[1].label,'ペーパータオル');assert.equal(h.calls.length,0);
 const product=fixture('app/admin/items/ItemsClient.tsx',{items,categories:[]});
 assert.equal(product.all().some(n=>n.props?.draft),false);
 const entryLinks=product.all().filter(n=>n.props?.href?.startsWith('/admin/reimbursements?record=purchase'));
 assert.equal(entryLinks.length,3);
 for(const link of entryLinks){
  const query=new URL(link.props.href,'http://localhost').search;
  const target=fixture('app/admin/reimbursements/ReimbursementsClient.tsx',{items,purchaseRuns:[],miscExamples:[]},query);
  assert.equal(target.all().find(n=>n.props?.draft)?.props.draft.purchases[0].source,'personal_advance');
 }
});
test('an explicit cashbox entry seeds each new purchase independently of earlier choices',async()=>{
 const {h,props}=editor();
 props.defaultSource='cashbox';
 h.change('買い物1の支払元','personal_advance');
 await h.click('＋ 別の店・日付の買い物');
 assert.equal(h.field('買い物2の支払元').props.value,'cashbox');
 assert.equal(h.calls.length,0);
});
test('the product list opens its display-order editor in one action and restores the search on close',async()=>{
 const h=fixture('app/admin/items/ItemsClient.tsx',{items,categories:[],orderSettings:{revision:3,available:true,verified:true}},'?q=緑茶');
 assert.equal(h.field('商品名で検索').props.value,'緑茶');
 await h.click('表示順を並べ替え');
 const editor=h.all().find(node=>node.props.revision===3&&node.props.onClose);
 assert.ok(editor);assert.equal(editor.props.items.length,2);
 assert.equal(h.all().some(node=>node.props['aria-label']==='商品名で検索'),false);
 editor.props.onClose();assert.equal(h.field('商品名で検索').props.value,'緑茶');
 assert.equal(h.calls.length,0);
});
test('one purchase mixes product stock and named supplies with one automatic total and one request',async()=>{
 const {h,props}=editor();row(h,1,10,'１００','２');await add(h);h.change(label(2,'商品'),'__expense__');h.change(label(2,'備品・雑費名'),'ペーパータオル');h.change(label(2,'単価'),'１５０円');h.change(label(2,'個数'),'３');h.change('買い物1の支払元','personal_advance');assert.ok(text(h.render()).includes('¥650'));await h.click('登録内容を確認');assert.ok(text(h.render()).includes('ペーパータオル'));h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(h.calls.length,1);const saved=h.calls[0].body.receipts[0];assert.equal(h.calls[0].url,'/api/admin/purchases');assert.equal(saved.rows.length,1);assert.equal(saved.expenses[0].subtotal,450);assert.equal(saved.expenses[0].quantity,3);assert.equal(saved.purchase.total_amount,650);assert.equal(props.receipt.stock_totals.length,1);assert.equal(props.receipt.stock_totals[0].quantity,2);
});
test('supplies-only needs no product and never changes stock; missing names or amounts block the entire purchase',async()=>{
 const {h,props}=editor();h.change(label(1,'商品'),'__expense__');h.change(label(1,'備品・雑費名'),'ペーパータオル');h.change(label(1,'個数'),'2');await h.click('登録内容を確認');assert.equal(h.calls.length,0);h.change(label(1,'単価'),'150');await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');assert.equal(props.receipt.total_amount,300);assert.equal(props.receipt.stock_totals.length,0);assert.equal(h.calls[0].body.receipts[0].rows.length,0);
 const second=editor();second.h.change(label(1,'商品'),'__expense__');second.h.change(label(1,'単価'),'150');await second.h.click('登録内容を確認');assert.equal(second.h.calls.length,0);assert.ok(text(second.h.render()).includes('備品・雑費'));second.h.change(label(1,'備品・雑費名'),'洗剤');second.h.change('買い物1の記録内容','stock');await second.h.click('登録内容を確認');assert.ok(text(second.h.render()).includes('支払元'));
});
test('a response that loses a supplies line cannot report successful registration',async()=>{
 const {h,props}=editor();h.change(label(1,'商品'),'__expense__');h.change(label(1,'備品・雑費名'),'洗剤');h.change(label(1,'単価'),'200');await h.click('登録内容を確認');h.setResponder(async call=>{const r=response(call),body=await r.json();body.receipts[0].expenses=[];return{...r,json:async()=>body};});await h.click('まとめて登録');assert.equal(props.receipt,undefined);assert.equal(props.busy,true);
});
test('disposals require a reason and retain the original quote when retrying',async()=>{
 const h=fixture('components/admin/StockAdjustment.tsx',{item:items[0]});h.change('在庫調整の個数','2');assert.equal(h.button('この在庫調整を記録').props.disabled,true);h.change('在庫調整の理由','破損');h.setResponder(async()=>{throw Error('lost');});await h.click('この在庫調整を記録');assert.equal(h.calls[0].body.expected_stock,12);assert.equal(h.calls[0].body.value,2);await h.click('この在庫調整を記録');assert.equal(h.calls[0].body.request_id,h.calls[1].body.request_id);
});
test('cashbox totals stay independent of archive pages; audit links retrieve old exact records and read failures never look like zero',async()=>{
 const totals={expectedAmount:5200,pendingCashOrdersCount:0,pendingCashOrderAmount:0,totalCashCollectionAmount:520,unreimbursedAdvanceAmount:800,advancePeople:[{id:id(2),name:'A',count:2,total:800}]};
 const db={rpc:async()=>({data:totals}),from(table){const q={select(){return q},order(){return q},range(from,to){return Promise.resolve({data:Array.from({length:to-from+1},(_,i)=>({id:'recent'+i,actual_amount:50}))})},limit(){return Promise.resolve({data:[{id:'latest',actual_amount:900}]})},eq(){return q},maybeSingle:async()=>({data:{id:id(999),actual_amount:10}})};return q;}};
 const mocks={'@/lib/admin-page-session':{requireAdminPage:async()=>{}},'@/lib/supabase/server':{createAdminClient:()=>db}};
 const h=fixture('app/admin/cashbox/page.tsx',{searchParams:Promise.resolve({ledgerPage:'2',countPage:'2',entry:id(999)})},'',mocks);const result=await h.render();assert.equal(result.props.expectedAmount,5200);assert.equal(result.props.entries.length,31);assert.equal(result.props.entries[0].id,id(999));assert.equal(result.props.latestCount.actual_amount,900);assert.equal(result.props.counts[0].actual_amount,50);assert.equal(result.props.hasMoreEntries,true);assert.equal(result.props.hasMoreCounts,true);
 db.rpc=async()=>({error:new Error('unavailable')});await assert.rejects(()=>h.render(),/unavailable/);
});

test('purchase, arrival and registration dates remain distinct when viewing an old receipt',()=>{
 const receipt={request_id:id(501),created_at:'2026-11-20T00:00:00Z',purchased_on:'2026-11-12',received_on:'2026-11-19',add_stock:true,rows:[],purchase:null};
 const h=fixture('components/admin/StockReceiptHistory.tsx',{receipt},'',{},'StockReceiptSummary');const value=text(h.render());assert.ok(value.includes('購入日 2026-11-12'));assert.ok(value.includes('入荷日 2026-11-19'));assert.ok(value.includes('登録 2026/11/20'));assert.equal(value.includes('登録 2026-11-12'),false);
});

test('each purchase line has one sales-unit quantity and keeps exact cost and stock disposition',async()=>{
 const {h,props}=editor();
 h.change(label(1,'商品'),id(11));h.change(label(1,'合計金額'),'1800');h.change(label(1,'個数'),'12');
 assert.ok(text(h.render()).includes('在庫へ＋12個'));
 await add(h);row(h,2,11,'130','3');h.change('買い物1 明細2を在庫に追加',false);
 await add(h);h.change(label(3,'商品'),'__expense__');h.change(label(3,'備品・雑費名'),'ペーパータオル');
 h.change(label(3,'単価'),'350');h.change(label(3,'個数'),'2');
 assert.equal(h.all().filter(node=>node.props['data-field']==='quantity').length,3);
 assert.equal(h.all().some(node=>/購入単位|入数/.test(node.props['aria-label']??'')),false);
 assert.ok(text(h.render()).includes('¥2,890'));
 await h.click('登録内容を確認');assert.ok(text(h.render()).includes('緑茶 · 12個'));assert.ok(text(h.render()).includes('＋12個'));
 h.setResponder(async call=>response(call));await h.click('まとめて登録');
 const saved=h.calls[0].body.receipts[0];
 assert.equal(props.receipt.total_amount,2890);assert.equal(props.receipt.stock_totals[0].quantity,12);
 assert.equal(saved.rows[0].quantity,15);assert.equal(saved.rows[0].stock_quantity,12);
 assert.equal(saved.purchase_lines.length,3);
 assert.equal(saved.purchase_lines.every(line=>line.package_unit==='piece'&&line.units_per_package===1),true);
});
test('receipt total keeps known line prices and unknown costs unallocated; all-known differences are calculated automatically',async()=>{
 const {h}=editor();row(h,1,10,'100','2');await add(h);h.change(label(2,'商品'),'__expense__');h.change(label(2,'備品・雑費名'),'紙');h.change('買い物1のレシート合計','500');await h.click('登録内容を確認');h.setResponder(async call=>response(call));await h.click('まとめて登録');const saved=h.calls[0].body.receipts[0];assert.equal(saved.rows[0].subtotal,200);assert.equal(saved.expenses[0].subtotal,null);assert.equal(saved.purchase.total_amount,500);assert.equal(saved.purchase.adjustment_amount,0);
});
test('stock-only intake needs one positive count per selected product and creates no payment',async()=>{
 const {h}=editor();
 h.change('買い物1の記録内容','stock');h.change(label(1,'商品'),id(11));
 assert.equal(h.all().filter(node=>node.props['data-field']==='quantity').length,1);
 assert.equal(h.all().some(node=>node.props['data-field']==='price'),false);
 h.change(label(1,'個数'),'0');await h.click('登録内容を確認');assert.equal(h.calls.length,0);
 h.change(label(1,'個数'),'7');await h.click('登録内容を確認');
 h.setResponder(async call=>response(call));await h.click('まとめて登録');
 const receipt=h.calls[0].body.receipts[0];
 assert.equal(receipt.rows[0].stock_quantity,7);assert.equal(receipt.purchase,null);
});

test('history shows original box/loose price bases and all source lines while stock uses only the actual delta',()=>{
 const base={line_id:id(801),item_id:id(10),label:null,quantity:2,package_unit:'box',units_per_package:6,price_mode:'total',price:1800,add_stock:true};
 const receipt={request_id:id(800),created_at:'2026-11-20T00:00:00Z',add_stock:true,rows:[{item_id:id(10),item_name:'水',quantity:15,stock_quantity:12,stock_before:17,stock_after:29,subtotal:2190}],expenses:[{line_id:id(803),label:'紙',quantity:20,subtotal:700}],purchase_lines:[base,{...base,line_id:id(802),quantity:3,package_unit:'piece',units_per_package:1,price_mode:'unit',price:130,add_stock:false},{...base,line_id:id(803),item_id:null,label:'紙',quantity:2,package_unit:'pack',units_per_package:10,price_mode:'unit',price:350,add_stock:false}],purchase:{id:id(804),total_amount:2800,payment_source:'personal_advance',payer_name:'A',adjustment_amount:-90}};
 const h=fixture('components/admin/StockReceiptHistory.tsx',{receipt},'',{},'StockReceiptSummary'),value=text(h.render());assert.ok(value.includes('3明細'));assert.ok(value.includes('2箱'));assert.ok(value.includes('単価 ¥130'));assert.ok(value.includes('在庫＋12個'));assert.ok(value.includes('明細との差額'));assert.equal(h.calls.length,0);
});
