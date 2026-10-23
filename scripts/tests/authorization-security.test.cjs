const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {test}=require('node:test');
const req=require('node:module').createRequire(root+'/package.json');const ts=req('typescript'),{PGlite}=req('@electric-sql/pglite');
const ids={user:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002',outsider:'30000000-0000-4000-8000-000000000003',admin:'30000000-0000-4000-8000-000000000004',item:'30000000-0000-4000-8000-000000000005',product:'30000000-0000-4000-8000-000000000006'};
const results=[];let authUser;let db;let context;
const member=id=>({id,identities:[{provider:'slack_oidc',identity_data:{provider_id:'U_'+id,custom_claims:{'https://slack.com/team_id':'T_FIXTURE'}}}]});
const id=x=>{if(!/^[a-z_][a-z0-9_]*$/.test(x))throw Error('Invalid fixture identifier');return '"'+x+'"'};
class Builder {
 constructor(table){this.table=table;this.op='select';this.fields='*';this.filters=[];this.params=[];this.one=false;}
 select(fields='*'){this.fields=fields;return this;} insert(data){this.op='insert';this.data=data;return this;}update(data){this.op='update';this.data=data;return this;}delete(){this.op='delete';return this;}
 eq(k,v){this.params.push(v);this.filters.push(id(k)+'=$'+this.params.length);return this;}
 neq(k,v){this.params.push(v);this.filters.push(id(k)+'<>$'+this.params.length);return this;}
 in(k,vs){this.params.push(vs);this.filters.push(id(k)+'=any($'+this.params.length+')');return this;}
 order(k,opt={}){this.sort=id(k)+(opt.ascending===false?' desc':' asc');return this;}
 limit(n){this.cap=Number(n);return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
 then(resolve,reject){return this.run().then(resolve,reject);}
 async run(){try{
  const where=this.filters.length?' where '+this.filters.join(' and '):'';
  const fields=this.fields==='*'?'*':this.fields.split(',').map(x=>id(x.trim())).join(',');
  let sql,params=[...this.params];
  if(this.op==='select')sql='select '+fields+' from '+id(this.table)+where+(this.sort?' order by '+this.sort:'')+(Number.isFinite(this.cap)?' limit '+this.cap:'');
  if(this.op==='insert'){const keys=Object.keys(this.data);params=keys.map(k=>this.data[k]);sql='insert into '+id(this.table)+' ('+keys.map(id).join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') returning '+fields;}
  if(this.op==='update'){const keys=Object.keys(this.data);sql='update '+id(this.table)+' set '+keys.map(k=>{params.push(this.data[k]);return id(k)+'=$'+params.length}).join(',')+where+' returning '+fields;}
  if(this.op==='delete')sql='delete from '+id(this.table)+where+' returning '+fields;
  const r=await db.query(sql,params);return {data:this.one?(r.rows[0]??null):r.rows,error:null};
 }catch(e){return {data:null,error:{message:e.message,code:e.code}};}}
}
const client={from:t=>new Builder(t),async rpc(name,args){await db.exec('savepoint fixture_rpc');try{const entries=Object.entries(args);const sql='select public.'+id(name)+'('+entries.map(([k],i)=>id(k)+'=> $'+(i+1)).join(',')+') as r';const p=entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v);const r=await db.query(sql,p);await db.exec('release savepoint fixture_rpc');return {data:r.rows[0]?.r,error:null};}catch(e){await db.exec('rollback to savepoint fixture_rpc');return {data:null,error:{code:e.code,message:e.message}};}}};
function load(relative,env={ALLOWED_SLACK_WORKSPACE_ID:'T_FIXTURE'}){
 const modules=new Map();const response={json:(body,init={})=>({body,status:init.status??200}),redirect:url=>({location:String(url),status:307})};
 const mocks={'next/server':{NextResponse:response},'next/cache':{revalidatePath(){}},'react':{cache:f=>f},'next/navigation':{redirect:location=>{throw Error('redirect:'+location)}},'@/lib/supabase/server':{createAdminClient:()=>client,createClient:async()=>({...client,auth:{getUser:async()=>({data:{user:authUser}})}})},'@/lib/slack':new Proxy({},{get:()=>async()=>true})};
 function compile(file){if(modules.has(file))return modules.get(file).exports;const m={exports:{}};modules.set(file,m);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  function localRequire(n){if(n in mocks)return mocks[n];if(n.startsWith('@/'))return compile(path.join(root,n.slice(2))+'.ts');if(n.startsWith('.'))return compile(path.resolve(path.dirname(file),n)+'.ts');return require(n);}
  vm.runInNewContext(code,{module:m,exports:m.exports,require:localRequire,URL,Request,Response,TextEncoder,Uint8Array,crypto:require('node:crypto').webcrypto,console:{error(){},warn(){}},process:{env}},{filename:file});return m.exports;
 }return compile(path.join(root,relative));
}
const request=(route,body,headers={})=>new Request('https://cafe.test'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://cafe.test',...headers},body:JSON.stringify(body)});
const wallet=async user=>(await db.query('select is_active,is_approved,balance,deferred_balance,points_balance from users where id=$1',[user])).rows[0];
async function scenario(name,fn){return context.test(name,async()=>{await db.exec('begin');try{const detail=await fn();results.push({name,...detail});}finally{await db.exec('rollback');}});}
test('real API and PostgreSQL reject the previously successful attacks',async t=>{
 context=t;
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.identities(user_id uuid,provider text,identity_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 for(const f of fs.readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(root+'/supabase/migrations/'+f,'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i,'').replaceAll('uuid_generate_v4()','gen_random_uuid()'));
 await db.exec(`insert into auth.users values('${ids.user}'),('${ids.other}'),('${ids.outsider}'),('${ids.admin}');insert into auth.identities select id,'slack_oidc',jsonb_build_object('provider_id','U_'||id::text,'custom_claims',jsonb_build_object('https://slack.com/team_id','T_FIXTURE')) from auth.users where id<>'${ids.outsider}';insert into users(id,name,balance,points_balance,is_approved,role) values('${ids.user}','架空一般会員',1000,80,true,'member'),('${ids.other}','架空別会員',1000,0,true,'member'),('${ids.admin}','架空管理者',0,0,true,'admin');update users set slack_user_id='U_'||id::text;insert into items(id,name,price,stock)values('${ids.item}','検証専用お茶',130,50);insert into subscription_products(id,name,price,billing_interval_count,billing_interval_unit) values('${ids.product}','検証専用サブスク',200,1,'month');`);
 await scenario('email-provider sessions cannot create a profile or order',async()=>{
  authUser={id:ids.outsider,email:'fictional@example.invalid',app_metadata:{provider:'email',providers:['email']},identities:[{provider:'email',id:ids.outsider,identity_data:{email:'fictional@example.invalid'}}],user_metadata:{workspace_id:'T_FORGED_ALLOWED',provider_id:'U_FORGED',full_name:'架空部外者'}};
  const r=await load('app/api/subscriptions/route.ts').GET();assert.equal(r.status,403);
  assert.equal(await wallet(ids.outsider),undefined);
  const purchase=await load('app/api/orders/route.ts').POST(request('/api/orders',{items:[{item_id:ids.item,quantity:1}],total_amount:130,payment_method:'deferred',deferred_settlement_method:'cash',points_used:0}));assert.equal(purchase.status,403);
  return {denied:true};
 });
 await scenario('editable metadata cannot replace verified Slack identity',async()=>{
  const {syncUserProfile}=load('lib/supabase/sync-user.ts');
  await syncUserProfile({...member(ids.user),user_metadata:{provider_id:'U_FORGED_FIXTURE',workspace_id:'T_FORGED_FIXTURE'}});
  const after=(await db.query('select slack_user_id,slack_workspace_id from users where id=$1',[ids.user])).rows[0];
  assert.equal(after.slack_user_id,'U_'+ids.user);assert.equal(after.slack_workspace_id,'T_FIXTURE');return {denied:true};
 });
 await scenario('inactive user top-up is denied without changing balances',async()=>{
  await db.query('update users set is_active=false where id=$1',[ids.user]);authUser=member(ids.user);const before=await wallet(ids.user);
  const r=await load('app/api/charge/route.ts').POST(request('/api/charge',{amount:1000,method:'cash'}));assert.equal(r.status,403);const after=await wallet(ids.user);assert.deepEqual(after,before);
  return {denied:true};
 });
 await scenario('inactive user cannot create a paid subscription',async()=>{
  await db.query('update users set is_active=false where id=$1',[ids.user]);authUser=member(ids.user);const before=await wallet(ids.user);
  const r=await load('app/api/subscriptions/subscribe/route.ts').POST(request('/api/subscriptions/subscribe',{product_id:ids.product,end_month:'2027-12',payment_priority:['points','balance','cash'],allow_partial_payment:true}));assert.equal(r.status,403,JSON.stringify(r));assert.deepEqual(await wallet(ids.user),before);
  assert.equal((await db.query('select count(*)::int n from user_subscriptions where user_id=$1',[ids.user])).rows[0].n,0);return {denied:true};
 });
 await scenario('member cannot forge review fields; normal pending requests work',async()=>{
  await db.exec(`set local request.jwt.claim.sub='${ids.user}';set local role authenticated;`);
  await db.exec('savepoint review');
  await assert.rejects(db.query('insert into item_requests(user_id,item_name,status,admin_note,reviewed_by,reviewed_at)values($1,$2,$3,$4,$5,now())',[ids.user,'架空の承認偽装','approved','管理者コメント偽装',ids.admin]),e=>e.code==='42501');
  await db.exec('rollback to savepoint review');
  const normal=(await db.query('insert into item_requests(user_id,item_name)values($1,$2) returning status',[ids.user,'正常な要望'])).rows[0];assert.equal(normal.status,'pending');return {denied:true,normal_request:true};
 });
 await scenario('ordinary member cannot read another profile/order or call wallet RPC',async()=>{
  await db.query("select checkout_order($1,$2,130,'cash',null,0)",[ids.other,JSON.stringify([{item_id:ids.item,quantity:1}])]);
  await db.exec(`set local request.jwt.claim.sub='${ids.user}';set local role authenticated;`);
  const otherProfiles=(await db.query('select id from users where id=$1',[ids.other])).rows.length,otherOrders=(await db.query('select id from orders where user_id=$1',[ids.other])).rows.length;
  await db.exec('savepoint rpc');let code;try{await db.query('select add_user_wallet_balance($1,100000)',[ids.user]);}catch(e){code=e.code;await db.exec('rollback to savepoint rpc');}
  assert.equal(otherProfiles,0);assert.equal(otherOrders,0);assert.equal(code,'42501');return {vulnerable:false,other_profiles:otherProfiles,other_orders:otherOrders,wallet_rpc_error:code};
 });
 await scenario('checkout rejects negative quantities, forged prices and forged owner',async()=>{
  authUser=member(ids.user);const api=load('app/api/orders/route.ts'),before=await wallet(ids.user),out=[];
  for(const patch of [{items:[{item_id:ids.item,quantity:-1}],total_amount:-130},{items:[{item_id:ids.item,quantity:1}],total_amount:1}])out.push((await api.POST(request('/api/orders',{payment_method:'balance',points_used:0,...patch}))).status);
  assert.deepEqual(out,[400,409]);assert.deepEqual(await wallet(ids.user),before);
  const r=await api.POST(request('/api/orders',{user_id:ids.other,items:[{item_id:ids.item,quantity:1,item_price:1,subtotal:1}],total_amount:130,payment_method:'balance',points_used:0}));assert.equal(r.status,200);
  const stored=(await db.query('select user_id,total_amount from orders where id=$1',[r.body.order_id])).rows[0];assert.equal(stored.user_id,ids.user);assert.equal(stored.total_amount,130);
  return {vulnerable:false,statuses:out,wallet_unchanged_after_invalid_requests:true,forged_owner_ignored:true,stored_total:stored.total_amount};
 });
 await scenario('active verified members retain normal charge and subscription workflows',async()=>{
  authUser=member(ids.user);const before=await wallet(ids.user);
  const charge=await load('app/api/charge/route.ts').POST(request('/api/charge',{amount:1000,method:'cash'}));assert.equal(charge.status,200);
  const topped=await wallet(ids.user);assert.equal(topped.balance,before.balance+1000);assert.equal(topped.deferred_balance,1000);assert.equal(topped.points_balance,90);
  const subscription=await load('app/api/subscriptions/subscribe/route.ts').POST(request('/api/subscriptions/subscribe',{product_id:ids.product,end_month:'2027-12',payment_priority:['points','balance','cash'],allow_partial_payment:true}));assert.equal(subscription.status,200,JSON.stringify(subscription));
  const after=await wallet(ids.user);assert.equal(after.points_balance,0);assert.equal(after.balance,1890);return {normal_workflows:true};
 });
 await scenario('a verified new Slack member keeps automatic approval',async()=>{
  await db.query("insert into auth.identities values($1,'slack_oidc',$2)",[ids.outsider,JSON.stringify(member(ids.outsider).identities[0].identity_data)]);
  authUser=member(ids.outsider);assert.equal((await load('app/api/subscriptions/route.ts').GET()).status,200);assert.equal((await wallet(ids.outsider)).is_approved,true);return {normal_workflow:true};
 });
 await scenario('database rejects stopped-member inserts and wallet top-ups even through the service client',async()=>{
  await db.query('update users set is_active=false where id=$1',[ids.user]);
  await db.exec('savepoint denied');await assert.rejects(db.query("insert into charge_requests(user_id,amount,method)values($1,1000,'cash')",[ids.user]),e=>e.code==='42501');await db.exec('rollback to savepoint denied');
  await assert.rejects(db.query('select apply_immediate_charge_to_deferred($1,1000)',[ids.user]),e=>e.code==='42501');await db.exec('rollback to savepoint denied');return {denied:true};
 });
 await scenario('wrong workspace and unapproved members are rejected without writes',async()=>{
  authUser=member(ids.user);authUser.identities[0].identity_data.custom_claims['https://slack.com/team_id']='T_OTHER';
  assert.equal((await load('app/api/subscriptions/route.ts').GET()).status,403);
  authUser=member(ids.user);await db.query('update users set is_approved=false where id=$1',[ids.user]);const before=await wallet(ids.user);
  const r=await load('app/api/charge/route.ts').POST(request('/api/charge',{amount:1000,method:'cash'}));assert.equal(r.status,403);assert.deepEqual(await wallet(ids.user),before);return {denied:true};
 });
 await scenario('stopped members cannot read or write the discussion board directly',async()=>{
  await db.query('update users set is_active=false where id=$1',[ids.user]);await db.exec(`set local request.jwt.claim.sub='${ids.user}';set local role authenticated;`);
  assert.equal((await db.query('select * from item_requests')).rows.length,0);
  await assert.rejects(db.query('insert into item_requests(user_id,item_name)values($1,$2)',[ids.user,'停止後の要望']),e=>e.code==='42501');return {denied:true};
 });
 const identityModule=load('lib/slack-identity.ts');assert.equal(identityModule.safeNextPath('//attacker.invalid'),'/');assert.equal(identityModule.safeNextPath('/checkout'),'/checkout');
 assert.equal(load('lib/slack-identity.ts',{}).verifiedSlackIdentity(member(ids.user)),null);
 const cronAuth=load('lib/cron-auth.ts',{CRON_SECRET:'configured-only'});assert.equal(cronAuth.isAuthorizedCron(new Request('https://cafe.test',{headers:{Authorization:'Bearer configured-only'}})),true);assert.equal(cronAuth.isAuthorizedCron(new Request('https://cafe.test',{headers:{Authorization:'Bearer wrong'}})),false);
 const proof=load('lib/admin-proof.ts');const secret='isolated-test-secret';const token=await proof.createAdminProof(ids.admin,Date.now()+100000,secret);
 assert.equal(await proof.verifyAdminProof(token,ids.user,secret),false);results.push({name:'signed admin proof cannot transfer to another user',vulnerable:false});
 const cron=load('app/api/cron/price-check/route.ts',{});const cronResponse=await cron.GET(new Request('https://cafe.test/api/cron/price-check',{headers:{Authorization:'Bearer undefined'}}));assert.equal(cronResponse.status,401);results.push({name:'cron missing secret denied',denied:true});
 await db.close();
});
