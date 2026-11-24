// Isolated PGlite only; single-connection operation-order checks do not prove
// multi-connection load/deadlock behavior. No live database is used.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const [payer,other,actor,a,b,c,op]=[1,2,3,10,11,12,20].map(id);
test('person-level advance settlement is atomic, replay-safe and compatible with historical ledgers',{skip:!process.env.PGLITE_MODULE},async t=>{
  const {PGlite}=require(process.env.PGLITE_MODULE),db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE users(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true,is_approved boolean DEFAULT true,balance integer DEFAULT 1000);
    CREATE TABLE items(id uuid PRIMARY KEY,stock integer DEFAULT 12);
    CREATE TABLE purchase_runs(id uuid PRIMARY KEY,total_amount integer NOT NULL CHECK(total_amount>0),payment_source text,reimbursement_status text,vendor text,note text,purchased_by uuid REFERENCES users(id),reimbursed_by uuid REFERENCES users(id),reimbursed_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE purchase_run_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_run_id uuid REFERENCES purchase_runs(id),item_name text,quantity integer);
    CREATE TABLE cashbox_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_type text,direction text,amount integer CHECK(amount>0),note text,purchase_run_id uuid REFERENCES purchase_runs(id),created_by uuid REFERENCES users(id));
    CREATE UNIQUE INDEX cash_unique ON cashbox_entries(purchase_run_id,entry_type) WHERE purchase_run_id IS NOT NULL;
    CREATE TABLE admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action_type text,target_type text,target_id text,summary text,metadata jsonb);
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    INSERT INTO users(id,name) VALUES('${payer}','同じ表示名'),('${other}','同じ表示名'),('${actor}','管理担当');
    INSERT INTO items(id) VALUES('${id(99)}');
    INSERT INTO purchase_runs(id,total_amount,payment_source,reimbursement_status,purchased_by,note) VALUES
      ('${a}',600,'personal_advance','pending_reimbursement','${payer}','緑茶'),
      ('${b}',200,'personal_advance','pending_reimbursement','${payer}','紙コップ'),
      ('${c}',500,'personal_advance','pending_reimbursement','${other}','別人の立替');`);
  const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261120062027_batch_advance_reimbursements.sql'),'utf8');
  await db.exec(migration);
  const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const call=async(opId=op,recipient=payer,runs=[{id:a,expected_amount:600},{id:b,expected_amount:200}],who=actor)=>(await query('SELECT public.admin_reimburse_advances($1,$2,$3::jsonb,$4) result',[opId,recipient,JSON.stringify(runs),who]))[0].result;
  const snap=async()=>JSON.stringify(await query(`SELECT (SELECT jsonb_agg(r ORDER BY id) FROM purchase_runs r) purchases,(SELECT jsonb_agg(e ORDER BY id) FROM cashbox_entries e) ledger,(SELECT count(*) FROM advance_reimbursement_batches) batches,(SELECT count(*) FROM admin_audit_logs) audits`));
  const initial=await snap();
  await t.test('migration is additive and grants neither public execution nor receipt edits',async()=>{
    assert.equal((await query('SELECT count(*) n FROM purchase_runs'))[0].n,3);
    assert.equal((await query('SELECT count(*) n FROM advance_reimbursement_batches'))[0].n,0);
    for(const role of ['anon','authenticated']){
      for(const signature of ['admin_reimburse_advances(uuid,uuid,jsonb,uuid)','admin_reimburse_advance(uuid,uuid)']) assert.equal((await query(`SELECT has_function_privilege($1,$2,'execute') allowed`,[role,'public.'+signature]))[0].allowed,false);
      for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await query('SELECT has_table_privilege($1,$2,$3) allowed',[role,'public.advance_reimbursement_batches',privilege]))[0].allowed,false);
    }
    assert.equal((await query("SELECT has_table_privilege('service_role','public.advance_reimbursement_batches','UPDATE') allowed"))[0].allowed,false);
    assert.equal((await query("SELECT has_table_privilege('service_role','public.advance_reimbursement_batches','DELETE') allowed"))[0].allowed,false);
  });
  await t.test('mixed payer, stale amount, duplicate, missing, cashbox and disabled actor fail without partial writes',async()=>{
    for(const runs of [[{id:a,expected_amount:600},{id:c,expected_amount:500}],[{id:a,expected_amount:600},{id:b,expected_amount:201}],[{id:a,expected_amount:600},{id:a,expected_amount:600}],[{id:a,expected_amount:600},{id:id(999),expected_amount:1}]]){
      await assert.rejects(()=>call(op,payer,runs));assert.equal(await snap(),initial);
    }
    await db.exec(`UPDATE purchase_runs SET payment_source='cashbox' WHERE id='${b}'`);const before=await snap();await assert.rejects(()=>call());assert.equal(await snap(),before);await db.exec(`UPDATE purchase_runs SET payment_source='personal_advance' WHERE id='${b}'`);
    await db.exec(`UPDATE users SET is_active=false WHERE id='${actor}'`);await assert.rejects(()=>call());assert.equal(await snap(),initial);await db.exec(`UPDATE users SET is_active=true WHERE id='${actor}'`);
  });
  await t.test('an audit failure rolls back the payout receipt, every cash entry and all purchase updates',async()=>{
    await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced audit failure';END$$;CREATE TRIGGER fail BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();`);
    await assert.rejects(()=>call(),/forced audit failure/);assert.equal(await snap(),initial);await db.exec('DROP TRIGGER fail ON admin_audit_logs');
  });
  await t.test('an existing ledger outflow with a pending purchase is a conflict, not a second outflow',async()=>{
    await db.exec(`INSERT INTO cashbox_entries(entry_type,direction,amount,purchase_run_id,created_by) VALUES('advance_reimbursement','out',200,'${b}','${actor}')`);const before=await snap();await assert.rejects(()=>call());assert.equal(await snap(),before);await db.exec(`DELETE FROM cashbox_entries WHERE purchase_run_id='${b}'`);
  });
  await t.test('one person receives one receipt for both purchases; other person, stock and wallets stay unchanged',async()=>{
    await db.exec('SET ROLE service_role');const result=await call();await db.exec('RESET ROLE');
    assert.equal(result.amount,800);assert.equal(result.count,2);assert.equal(result.recipient_id,payer);assert.equal(result.items.length,2);
    assert.equal((await query('SELECT sum(amount)::integer amount FROM cashbox_entries'))[0].amount,800);
    assert.equal((await query('SELECT count(*) n FROM admin_audit_logs'))[0].n,1);
    assert.equal((await query(`SELECT reimbursement_status status FROM purchase_runs WHERE id='${c}'`))[0].status,'pending_reimbursement');
    assert.deepEqual(await query('SELECT balance FROM users'),[{balance:1000},{balance:1000},{balance:1000}]);assert.equal((await query('SELECT stock FROM items'))[0].stock,12);
  });
  await t.test('reordered replay returns original receipt; changed operation and single-after-batch cannot double-pay',async()=>{
    const before=await snap();const r=await call(op,payer,[{id:b,expected_amount:200},{id:a,expected_amount:600}]);assert.equal(r.already_recorded,true);assert.equal(await snap(),before);
    await assert.rejects(()=>call(op,payer,[{id:a,expected_amount:600}]));await assert.rejects(()=>call(id(21)));await assert.rejects(()=>query('SELECT public.admin_reimburse_advance($1,$2)',[a,actor]));assert.equal(await snap(),before);
  });
  await t.test('single-before-batch remains compatible and excludes double-payment',async()=>{
    const r=(await query('SELECT public.admin_reimburse_advance($1,$2) result',[c,actor]))[0].result;assert.equal(r.amount,500);const before=await snap();await assert.rejects(()=>call(id(22),other,[{id:c,expected_amount:500}]));assert.equal(await snap(),before);const replay=(await query('SELECT public.admin_reimburse_advance($1,$2) result',[c,actor]))[0].result;assert.equal(replay.already_recorded,true);assert.equal(await snap(),before);
  });
});
