// PAN464 fixed container job. No arbitrary SQL, paths or executable arguments.
// The host controller owns /state and admission; this job has no Docker socket.
// 'seed' is the only fresh-install path and exclusively uses released source.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';

const mode = process.argv[2];
assert(['seed','observe','migrate','new-write'].includes(mode), 'PAN464_PRODUCER_MODE_DENIED');
assert(process.argv.length === 3, 'PAN464_PRODUCER_ARGUMENTS_DENIED');
const root = mode === 'seed' ? '/source' : '/pan';
const load = path => import(pathToFileURL(`${root}/${path}`).href);
const h = await load('dist/packages/knowledge-solution/src/pg-harness.js');
const { readMarginContextFromPostgresV1 } = await load('dist/packages/knowledge-solution/src/postgres-source.js');
const database = {host:'127.0.0.1', port:h.PG_PORT, database:h.PG_DATABASE, user:h.PG_ADMIN_USER, password:h.PG_ADMIN_PASSWORD};
const dataDir = '/state/postgres';
const plan = JSON.parse(readFileSync('/admission/plan.json','utf8'));
let instance, admin, ro;
try {
  if (mode === 'seed') {
    assert(!existsSync(dataDir), 'PAN464_FRESH_SEED_OVERWRITE_DENIED');
    ({instance, admin, ro} = await h.startRealPostgres(dataDir));
    // A fixed synthetic installation marker for the existing PAN463 adapter;
    // source invoice rows come from the released harness, not this migration.
    await admin.query('CREATE TABLE pan463_native_state (installation_id text PRIMARY KEY,generation integer NOT NULL,lock_digest text NOT NULL,fence integer NOT NULL,migration_count integer NOT NULL,last_operation text,last_plan_digest text)');
    await admin.query('INSERT INTO pan463_native_state VALUES ($1,1,$2,1,0,NULL,NULL)',[plan.installationId, plan.checkPlan.fromLockDigest]);
  } else {
    assert(existsSync(`${dataDir}/PG_VERSION`), 'PAN464_RETAINED_DATABASE_REQUIRED');
    instance = new EmbeddedPostgres({databaseDir:dataDir,user:h.PG_ADMIN_USER,password:h.PG_ADMIN_PASSWORD,port:h.PG_PORT,persistent:true,postgresFlags:['-k',dataDir]});
    // Never initialise, purge or reseed an existing database on restart.
    await instance.start();
    admin = new Client(database); await admin.connect();
  }
  await admin.query('SET synchronous_commit = on');
  let migration = null;
  if (mode === 'migrate') {
    const {createNativeUpdateExecutorV1} = await load('src/pan463/native-update-executor.mjs');
    const journalRoot = '/state/pan453-owned-v2/pan463-native-v1';
    mkdirSync(journalRoot,{recursive:true});
    const executor = createNativeUpdateExecutorV1({root:journalRoot,ownedRoot:'/state',database,admittedPlan:plan,
      readGrant:()=>JSON.parse(readFileSync('/admission/grant.json','utf8')),
      observePhase:async phase=>{
        if (process.env.PAN464_CRASH_PHASE === phase) {
          // Deliberate actual process death in an explicitly synthetic job.
          process.kill(process.pid,'SIGKILL');
          await new Promise(()=>{});
        }
      }});
    migration = await executor.execute({plan,executorId:'pan464-executor',fence:1});
    assert.equal(migration.status,'PASS','PAN464_NATIVE_MIGRATION_HELD');
  }
  if (mode === 'new-write') {
    // A real post-activation transaction, not an expected-result annotation.
    await admin.query('BEGIN');
    await admin.query("INSERT INTO kts_invoices (kts_invoice_id,kts_order_id,kts_customer_id,betrag_eur,waehrung,faellig,grenzwert_eur) VALUES ('rechnung:104','bestellung:104','kunde:104',12.34,'EUR','2026-09-02',30.00)");
    await admin.query('COMMIT');
  }
  const conn = {...database,user:h.PG_RO_USER,password:h.PG_RO_PASSWORD};
  const observed = await readMarginContextFromPostgresV1({conn,schema:h.PG_SCHEMA,client:new Client(conn)});
  // An explicit PAN->native Superset SQLite projection of observed producer
  // records. This is separate from (and does not replace) the #346 pair checks.
  const rows = observed.pack.data.rows.map(row=>{
    assert(/^\d+\.\d{2}$/.test(row.betrag_eur), 'PAN464_MINOR_UNIT_DENIED');
    const [whole,fraction] = row.betrag_eur.split('.');
    const amountMinor = Number(whole)*100+Number(fraction);
    assert(Number.isSafeInteger(amountMinor), 'PAN464_MINOR_UNIT_DENIED');
    return {invoiceId:row.rechnung_nr, amountMinor};
  });
  const generation = (await admin.query('SELECT generation,migration_count FROM pan463_native_state')).rows;
  assert.equal(generation.length,1,'PAN464_STATE_UNKNOWN');
  writeFileSync('/state/producer-observed.json',JSON.stringify({rows,dataDigest:observed.pack.data.dataDigest,
    generation:generation[0].generation,migrationCount:generation[0].migration_count,migration})+'\n');
  await admin.query('CHECKPOINT');
} finally {
  if(ro)await ro.end();
  if(admin)await admin.end();
  // Do NOT call h.stop(): its fixture teardown intentionally deletes dataDir.
  if(instance)await instance.stop();
}
