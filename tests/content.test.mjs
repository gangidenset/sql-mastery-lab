// 教材の自動テスト（開発者向け）
// すべての模範解答を「アプリと同じ採点ロジック」で実際のPostgreSQLに実行し、合格することを確認します。
// あわせて、誤答例が不合格になること（採点が甘すぎないこと）も確認します。
// 実行: 検証用PostgreSQLを起動してから  node tests/content.test.mjs
import { NodeEngine, createDatabase } from '../tools/node-engine.mjs';
import { grade, compareResultSets, canon } from '../js/grader.js';
import { analyzeSafety, splitStatements } from '../js/safety.js';
import { explainError } from '../js/errors.js';
import { LESSONS, CAPSTONES, lessonExerciseSpec, groupStepSpec } from '../js/content/index.js';
import { SCENARIOS } from '../js/content/scenarios.js';
import { EXAM_TASKS, EXAM_SETUP } from '../js/content/capstones.js';
import { TEMPLATES, toMarkdown, toCsv } from '../js/content/templates.js';
import { MIG_CUSTOMERS, MIG_ORDERS_BASIC } from '../js/content/migration-sql.js';

let pass = 0, fail = 0; const failures = [];
const ok = (cond, name, detail = '') => { if (cond) pass++; else { fail++; failures.push(`${name} ${detail}`); console.log('  ✗', name, detail); } };
const only = process.argv[2];

const fillAnswer = (tpl) => tpl.replace(/\{\{(.*?)\}\}/g, '$1');

async function main() {
  const db = 'sml_test_' + process.pid;
  await createDatabase(db);
  const engine = new NodeEngine(db); await engine.init();
  console.log('engine:', engine.info.version.slice(0, 40));

  // ---- 単体テスト：比較・安全性・エラー説明 ----
  console.log('\n[unit]');
  const fs = (n) => Array.from({ length: n }, (_, i) => ({ name: 'c' + i }));
  ok(compareResultSets({ fields: fs(1), rows: [['10']] }, { fields: fs(1), rows: [['10.000']] }).pass, 'numeric canonical equality');
  ok(!compareResultSets({ fields: fs(1), rows: [['1'], ['2']] }, { fields: fs(1), rows: [['2'], ['1']] }, { ordered: true }).pass, 'ordered comparison detects order');
  ok(compareResultSets({ fields: fs(1), rows: [['1'], ['2']] }, { fields: fs(1), rows: [['2'], ['1']] }).pass, 'unordered comparison ignores order');
  ok(!compareResultSets({ fields: fs(2), rows: [] }, { fields: fs(1), rows: [] }).pass, 'column count mismatch');
  ok(canon(null) !== canon('NULL'), 'NULL distinct from string NULL');
  ok(analyzeSafety('DELETE FROM orders').some((f) => f.level === 'danger'), 'safety: delete without where');
  ok(!analyzeSafety("DELETE FROM orders WHERE note = 'x; DELETE FROM y'").some((f) => f.level === 'danger'), 'safety: string literal not split');
  ok(analyzeSafety('UPDATE t SET a=1 WHERE 1=1').some((f) => f.level === 'danger'), 'safety: where 1=1');
  ok(analyzeSafety('TRUNCATE t').some((f) => f.level === 'warn'), 'safety: truncate warn');
  ok(splitStatements("select ';' ; -- c;\nselect 2").length === 2, 'split statements with literal/comment');
  ok(explainError({ code: '42703', message: 'column "is_active" does not exist' }).title.includes('列'), 'error explain 42703');
  ok(explainError({ code: 'XX999', message: 'weird' }).sure === false, 'unknown error not asserted');

  // ---- データセット ----
  console.log('\n[datasets]');
  await engine.reset('base');
  let r = await engine.query('select (select count(*) from customers),(select count(*) from orders),(select count(*) from order_items),(select count(*) from legacy_customers),(select count(*) from legacy_orders)');
  ok(r[0].rows[0].join(',') === '15,20,28,20,18', 'base counts', r[0].rows[0].join(','));
  await engine.reset('migration');
  r = await engine.query('select (select count(*) from customers),(select count(*) from orders)');
  ok(r[0].rows[0].join(',') === '0,0', 'migration target empty');
  await engine.reset('bulk', { bulkRows: 999999999 });
  r = await engine.query('select count(*) from legacy_sales');
  ok(r[0].rows[0][0] === '200000', 'bulk is clamped to 200000', r[0].rows[0][0]);
  // 学習者が作ったスキーマも初期化で消える
  await engine.run('CREATE SCHEMA myschema; CREATE TABLE myschema.t(a int);');
  await engine.reset('base');
  r = await engine.query("select count(*) from pg_namespace where nspname = 'myschema'");
  ok(r[0].rows[0][0] === '0', 'reset drops learner schemas');
  // タイムアウトで復旧
  const t = await engine.run('SELECT pg_sleep(3)', { timeoutMs: 500 });
  ok(t.timedOut, 'timeout detected');
  r = await engine.query('select count(*) from customers');
  ok(r[0].rows[0][0] === '15', 'restored after timeout');

  // ---- レッスン ----
  for (const lesson of LESSONS) {
    if (only && !lesson.id.startsWith(only)) continue;
    console.log(`\n[${lesson.id}] ${lesson.title}`);
    // 17項目の構成がそろっているか
    for (const k of ['goal', 'usage', 'terms', 'syntax', 'examples', 'explanation', 'exercises', 'mistakes', 'errorChecks', 'practice', 'quiz'])
      ok(lesson[k] !== undefined, `${lesson.id} has ${k}`);
    ok(lesson.exercises.length >= 3, `${lesson.id} has >=3 exercises`);
    await engine.reset(lesson.dataset || 'base', {}, lesson.setup);
    for (const [i, exm] of lesson.examples.entries()) {
      const res = await engine.run(exm.sql);
      ok(exm.expectError ? !res.ok : res.ok, `${lesson.id} example ${i + 1}`, res.error?.message || '');
      await engine.run('ROLLBACK');
    }
    for (const q of lesson.quiz) ok(q.answer >= 0 && q.answer < q.options.length, `${lesson.id} quiz answer index`);
    for (const ex of lesson.exercises) await checkExercise(engine, lessonExerciseSpec(lesson, ex), `${lesson.id}.${ex.id}`);
  }

  // ---- シナリオ ----
  for (const sc of SCENARIOS) {
    if (only && only !== 'S' + sc.id) continue;
    console.log(`\n[scenario ${sc.id}] ${sc.title}`);
    for (const st of sc.steps) await checkExercise(engine, groupStepSpec(sc, st, 20000), `scenario${sc.id}.${st.id}`);
  }
  // ---- 総合演習 ----
  for (const cap of CAPSTONES) {
    if (only && only !== cap.id) continue;
    console.log(`\n[${cap.id}] ${cap.title}`);
    for (const st of cap.steps) await checkExercise(engine, groupStepSpec(cap, st, 20000), `${cap.id}.${st.id}`);
  }
  // ---- 総合試験 ----
  if (!only || only === 'exam') {
    console.log('\n[exam]');
    for (const x of EXAM_TASKS) await checkExercise(engine, { ...x, dataset: 'migration', setup: EXAM_SETUP + '\n' + (x.setupExtra || '') }, `exam.${x.id}`);
  }

  // ---- 狙いどおりに不合格になるか（採点が甘すぎないことの確認） ----
  if (!only) {
    console.log('\n[negative]');
    const l3 = LESSONS.find((l) => l.id === 'ch03');
    let g = await grade(engine, lessonExerciseSpec(l3, l3.exercises[0]), 'DELETE FROM order_items WHERE order_id = 1001; SELECT name, email FROM customers;');
    ok(!g.pass && g.checks.some((c) => !c.ok && c.label.includes('副作用')), 'side effect detected in SELECT exercise');
    g = await grade(engine, lessonExerciseSpec(l3, l3.exercises[0]), 'SELECT name, phone FROM customers;');
    ok(!g.pass, 'wrong column values rejected');
    g = await grade(engine, lessonExerciseSpec(l3, l3.exercises[0]), 'SELECT email, name FROM customers;');
    ok(!g.pass, 'swapped columns rejected');
    g = await grade(engine, lessonExerciseSpec(l3, l3.exercises[0]), 'select c.name, c.email\nfrom customers c order by c.customer_id desc;');
    ok(g.pass, 'different but equivalent SQL accepted');
    const l17 = LESSONS.find((l) => l.id === 'ch17');
    g = await grade(engine, lessonExerciseSpec(l17, l17.exercises[3]), MIG_ORDERS_BASIC);
    ok(!g.pass, 'non-idempotent rerun rejected (duplicate key)');
    g = await grade(engine, lessonExerciseSpec(l17, l17.exercises[1]), MIG_CUSTOMERS.replace("WHERE l.del_flg = '0' AND l.sts_kbn <> '9'", "WHERE l.sts_kbn <> '9'"));
    ok(!g.pass, 'missing del_flg rule rejected');
    const l19 = LESSONS.find((l) => l.id === 'ch19');
    g = await grade(engine, lessonExerciseSpec(l19, l19.exercises[0]), "BEGIN;\nINSERT INTO products (product_id, product_name, category, price, stock) VALUES (21, 'ペンタブレット', '周辺機器', 9800, 10), (22, 'スピーカー', 'オーディオ', 5980, 25);");
    ok(!g.pass && g.checks.some((c) => c.label.includes('トランザクション')), 'uncommitted transaction detected');
    const l6 = LESSONS.find((l) => l.id === 'ch06');
    g = await grade(engine, lessonExerciseSpec(l6, l6.exercises[1]), 'UPDATE products SET stock = 30 WHERE product_id = 5 OR 1=1;');
    ok(!g.pass, 'over-broad update rejected');
    g = await grade(engine, lessonExerciseSpec(l6, l6.exercises[1]), 'SELECT FROM WHERE');
    ok(!g.pass && g.checks[0].label === 'SQLの実行', 'syntax error handled');
  }

  // ---- 成果物 ----
  console.log('\n[templates]');
  ok(TEMPLATES.length === 12, '12 templates');
  for (const t of TEMPLATES) {
    const md = toMarkdown(t, { fields: { [t.fields?.[0]?.[0]]: 'テスト|値' }, rows: [['a', 'b"c']] });
    ok(md.startsWith('# ' + t.title), `${t.id} markdown`);
    if (t.table) ok(toCsv(t, { rows: [['a', 'b"c']] }).includes('"b""c"'), `${t.id} csv escaping`);
  }

  engine.close();
  console.log(`\n結果: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
}

async function checkExercise(engine, ex, name) {
  if (ex.type === 'choice') { ok(ex.answerIndex >= 0 && ex.answerIndex < ex.options.length, `${name} choice`); return; }
  if (ex.type === 'deliverable') { ok(!!ex.template, `${name} deliverable template`); return; }
  if (ex.type === 'predict') {
    await engine.reset(ex.dataset, { bulkRows: ex.bulkRows }, ex.setup);
    const r = await engine.run(ex.predictSql);
    const v = r.ok ? r.results.at(-1).rows[0][0] : r.error?.message;
    ok(String(v) === ex.options[ex.answerIndex], `${name} predict answer`, `actual=${v} expected=${ex.options[ex.answerIndex]}`);
    return;
  }
  const answer = ex.type === 'fill' ? fillAnswer(ex.template) : ex.answer;
  const g = await grade(engine, ex, answer);
  ok(g.pass, `${name} model answer passes`, g.pass ? '' : JSON.stringify(g.checks.filter((c) => !c.ok)));
  const res = g.userResult?.results?.at(-1);
  if (g.pass && res?.fields?.length) console.log(`  ✓ ${name}  (${res.rows.length} rows)`);
  else if (g.pass) console.log(`  ✓ ${name}`);
  if (ex.type === 'fix' && ex.starter) {
    const gs = await grade(engine, ex, ex.starter);
    ok(!gs.pass, `${name} buggy starter is rejected`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
