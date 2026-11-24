const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),modules=new Map();
function load(file){if(modules.has(file))return modules.get(file).exports;const m={exports:{}};modules.set(file,m);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,crypto:require('node:crypto').webcrypto,require:n=>load(path.resolve(path.dirname(file),n)+'.ts')});return m.exports;}
const lines=load(path.join(root,'lib/purchase-lines.ts')),model=load(path.join(root,'lib/stock-intakes.ts'));
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const entry=(n,patch={})=>({line_id:id(n),item_id:id(1),label:null,quantity:2,package_unit:'piece',units_per_package:1,price_mode:'total',price:1000,add_stock:true,...patch});
test('pricing units, packaging units and stock disposition compose independently without multiplying a total',()=>{
 for(const mode of ['total','unit'])for(const unit of ['piece','box','pack'])for(const stock of [true,false])for(const kind of ['product','expense']){
  const e=entry(10,{price_mode:mode,package_unit:unit,units_per_package:unit==='piece'?1:6,add_stock:kind==='product'&&stock,...(kind==='expense'?{item_id:null,label:'紙'}:{})});const result=lines.resolvePurchaseEntries([e]);assert.equal(result.knownAmount,mode==='total'?1000:2000);const row=kind==='product'?result.rows[0]:result.expenses[0];assert.equal(row.quantity,unit==='piece'?2:12);if(kind==='product')assert.equal(row.stock_quantity,stock?row.quantity:0);
 }
});
test('a non-divisible total survives switching price modes and never becomes a rounded quote',()=>{
 const p={pricing:'lines'},r={id:id(10),itemId:id(1),quantity:'6',amount:'',price:{mode:'total',unit:'',total:'1000'}};const unit=lines.changeLinePrice(p,r,{mode:'unit'});assert.equal(lines.linePriceValue(p,unit),'');assert.equal(unit.price.total,'1000');assert.equal(lines.lineSubtotal(p,unit),null);const total=lines.changeLinePrice(p,unit,{mode:'total'});assert.equal(lines.lineSubtotal(p,total),1000);const changed=lines.changeLinePrice(p,unit,{value:'200'});assert.equal(changed.price.total,'1200');assert.equal(lines.lineSubtotal(p,changed),1200);
});
test('same product bought as boxes and loose units retains both quotes and a separate stock delta',()=>{
 const result=lines.resolvePurchaseEntries([entry(10,{package_unit:'box',units_per_package:6,price:1800}),entry(11,{quantity:3,price_mode:'unit',price:130,add_stock:false})]);assert.equal(result.entries.length,2);assert.equal(result.knownAmount,2190);assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[{item_id:id(1),quantity:15,stock_quantity:12,subtotal:2190}]);
});
test('partial knowledge stays unknown instead of being treated as zero or allocated arbitrarily',()=>{
 const result=lines.resolvePurchaseEntries([entry(10),entry(11,{price_mode:'unknown',price:null})]);assert.equal(result.rows[0].subtotal,null);assert.equal(result.knownAmount,1000);assert.equal(result.unknownCount,1);
});
test('blank trailing rows are ignored and invalid legacy receipts cannot change stock',()=>{
 assert.equal(model.emptyIntakeLine().price.mode,'total');assert.equal(model.isBlankIntakeLine(model.emptyIntakeLine()),true);assert.equal(model.isBlankIntakeLine({...model.emptyIntakeLine(),quantity:'12'}),false);assert.equal(model.isBlankIntakeLine({...model.emptyIntakeLine(),quantity:'',price:{mode:'unit',unit:'',total:'1000'}}),false);
 for(const patch of [{units_per_package:0},{package_unit:'piece',units_per_package:6},{quantity:1.5},{quantity:2147483647,units_per_package:2,package_unit:'box'},{price_mode:'unit',price:2147483647},{item_id:null,label:'',add_stock:false},{item_id:null,label:'紙',add_stock:true}])assert.throws(()=>lines.resolvePurchaseEntries([entry(10,patch)]));
});
