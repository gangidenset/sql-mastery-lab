// ブラウザでの動作確認（開発者向けE2Eテスト）
// 前提: 検証用PostgreSQL（tests/README参照）と Playwright。アプリは「ブリッジ」モード（?engine=bridge）で
// ローカルPostgreSQLを使って動かします（PGlite本体の読み込み以外の画面・採点・保存の流れをすべて確認）。
//   node tools/server.mjs --bridge &   （PORT=8099）
//   node tests/e2e.test.mjs
import { LESSONS } from '../js/content/index.js';
import { SCENARIOS } from '../js/content/scenarios.js';

// Playwright の場所が標準と違う場合は PLAYWRIGHT_MODULE に index.mjs のパスを指定してください
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.SML_URL || 'http://localhost:8099/';
const exe = process.env.CHROME_PATH || undefined;
let pass = 0, fail = 0; const fails = [];
const ok = (c, name, d = '') => { if (c) { pass++; console.log('  ✓', name); } else { fail++; fails.push(name + ' ' + d); console.log('  ✗', name, d); } };

const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
const errors = []; const requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => requests.push(r.url()));

const go = async (hash) => { await page.goto(BASE + '?engine=bridge#' + hash); await page.waitForSelector('#engine-pill[data-state="ready"]', { timeout: 30000 }); await page.waitForTimeout(300); };
const nav = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(600); };
const lastTableRows = (scope) => page.locator(scope + ' table.grid tbody tr').count();
async function typeSql(locator, sql) { await locator.fill(sql); }
async function gradeExercise(exSel, sql) {
  const ex = page.locator(exSel);
  await typeSql(ex.locator('textarea.sql'), sql);
  await ex.locator('button', { hasText: '✓ 判定' }).click();
  await ex.locator('.verdict').waitFor({ timeout: 30000 });
  return (await ex.locator('.verdict').getAttribute('class')).includes('pass');
}

try {
  console.log('[1] 起動');
  await go('dashboard');
  ok(await page.locator('.stats').isVisible(), 'アプリが起動しダッシュボードが表示される');
  ok((await page.locator('#engine-pill').getAttribute('data-state')) === 'ready', 'SQLエンジンが準備完了');

  console.log('[2-3] カリキュラムとレッスン');
  await go('curriculum');
  ok((await page.locator('a.lesson-card[href^="#lesson-"]').count()) === 25, 'カリキュラム25章が表示される');
  ok((await page.locator('a.lesson-card[href^="#capstone-"]').count()) === 5, '総合演習5課題が表示される');
  await go('lesson-ch03');
  ok(await page.locator('#sec-1').isVisible() && await page.locator('#sec-7 .prose').isVisible(), 'レッスンの説明（学習目標・解説）が表示される');
  ok((await page.locator('.lesson-sec').count()) === 17, 'レッスンが17項目で構成されている');

  console.log('[4-7] SQLエディタ');
  const scratch = page.locator('#sec-6 .runner');
  await typeSql(scratch.locator('textarea.sql'), 'SELECT customer_id, name FROM customers ORDER BY customer_id;');
  await scratch.locator('button', { hasText: '▶ 実行' }).click();
  await scratch.locator('table.grid').waitFor();
  ok((await lastTableRows('#sec-6 .runner')) === 15, 'SQLを入力・実行して結果（15行）が表示される');
  ok(/成功/.test(await scratch.locator('.meta').textContent()), '実行時間・件数が表示される');
  await typeSql(scratch.locator('textarea.sql'), 'SELECT is_active FROM customers;');
  await scratch.locator('button', { hasText: '▶ 実行' }).click();
  await scratch.locator('.err').waitFor();
  ok((await scratch.locator('.err').textContent()).includes('列（カラム）が存在しません'), 'エラーが初心者向けの説明付きで表示される');
  await typeSql(scratch.locator('textarea.sql'), 'SELECT COUNT(*) FROM products;');
  await scratch.locator('button', { hasText: '▶ 実行' }).click();
  await page.waitForTimeout(500);
  ok((await scratch.locator('td').first().textContent()) === '10', 'エラーの後も続けて実行できる（アプリが停止しない）');
  await typeSql(scratch.locator('textarea.sql'), 'DELETE FROM order_items;');
  await scratch.locator('button', { hasText: '▶ 実行' }).click();
  ok(await scratch.locator('.confirm-bar').isVisible(), 'WHEREのないDELETEで確認画面が表示される');
  await scratch.locator('.confirm-bar button', { hasText: 'このまま実行する' }).click();
  await page.waitForTimeout(600);
  await scratch.locator('button', { hasText: 'DBを初期化' }).click();
  await page.waitForTimeout(800);
  await typeSql(scratch.locator('textarea.sql'), 'SELECT COUNT(*) FROM order_items;');
  await scratch.locator('button', { hasText: '▶ 実行' }).click();
  await page.waitForTimeout(500);
  ok((await scratch.locator('td').first().textContent()) === '28', '問題ごとのDB初期化で削除したデータが元に戻る');

  console.log('[採点・進捗保存]');
  const l3 = LESSONS.find((l) => l.id === 'ch03');
  ok(await gradeExercise('#ex-e1', 'select c.name, c.email from customers c order by 1;'), '模範解答と書き方が違っても結果が同じなら正解');
  ok(!(await gradeExercise('#ex-e5', 'SELECT product_name, price FROM products ORDER BY price LIMIT 3;')), '誤ったSQLは不正解と判定される');
  ok(await gradeExercise('#ex-e5', l3.exercises[4].answer), '模範解答は正解と判定される');
  await page.locator('#ex-e2 input').nth(0).fill('FROM'); await page.locator('#ex-e2 input').nth(1).fill('ORDER'); await page.locator('#ex-e2 input').nth(2).fill('DESC');
  await page.locator('#ex-e2 button', { hasText: '✓ 判定' }).click();
  await page.locator('#ex-e2 .verdict').waitFor();
  ok((await page.locator('#ex-e2 .verdict').getAttribute('class')).includes('pass'), '穴埋め問題を判定できる');
  await page.reload(); await page.waitForSelector('#engine-pill[data-state="ready"]'); await page.waitForTimeout(400);
  ok((await page.locator('#ex-e1 .ex-head .chip.ok').count()) === 1, 'ページ再読み込み後も正解状況が保持される');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sml.progress.v1')));
  ok(stored.lessons.ch03.exercises.e1.correct && stored.history.length > 0, 'localStorage に進捗と実行履歴が保存される');

  console.log('[8-9] 構造ビューア');
  await go('schema');
  await page.locator('.tbl-item', { hasText: 'customers' }).first().waitFor();
  ok(await page.locator('table.cols').first().isVisible(), 'テーブル構造（列・型・NULL・キー）が表示される');
  ok((await page.locator('.with-left .stack table.grid').last().locator('tbody tr').count()) > 0, 'サンプルデータが存在し表示される');
  ok((await page.locator('text=を参照').count()) >= 3, 'テーブル間の関連（外部キー）が表示される');

  console.log('[10-12] DB移行ラボ');
  const sc = SCENARIOS.find((s) => s.id === 'G');
  await go('lab-G');
  ok(await gradeExercise('#ex-s2', sc.steps[1].answer), 'シナリオG：3テーブルの移行を実行・採点できる');
  await nav('lab-verify'); // アプリ内の移動（再読み込みしない）なので、シナリオGで移行した状態のまま検証できる
  await page.selectOption('#pair-src', 'legacy_customers'); await page.selectOption('#pair-dst', 'customers');
  await page.locator('button', { hasText: '検証を実行' }).click();
  await page.locator('text=記録しました').waitFor({ timeout: 20000 });
  const verifyText = await page.locator('.page').textContent();
  ok(/不一致（元 18 \/ 先 16）/.test(verifyText), '移行結果を検証できる（件数の差を検出）');
  ok(/要確認（2件）/.test(verifyText), '移行漏れ（2件）を検出できる');
  const scI = SCENARIOS.find((s) => s.id === 'I');
  await go('lab-I');
  ok(await gradeExercise('#ex-s2', scI.steps[1].answer), 'シナリオI：件数一致・内容不一致の不整合を検出できる');
  await go('lab-compare');
  await page.waitForTimeout(800);
  ok((await page.locator('.chip', { hasText: '列名の変更' }).count()) >= 3, '構造比較でカラム名の差分が表示される');
  await go('lab-mapping'); await page.waitForTimeout(800);
  await page.locator('button', { hasText: 'SQLを生成' }).click();
  ok((await page.locator('.runner textarea.sql').inputValue()).includes('INSERT INTO customers'), 'マッピングから編集可能な移行SQLを生成できる');
  await go('lab-report');
  ok((await page.locator('.ex').count()) >= 1, '検証結果がレポートに記録される');

  console.log('[16] 総合試験');
  await go('exam');
  ok((await page.locator('.ex').count()) >= 8, '総合試験の問題が表示される');
  ok((await page.locator('summary', { hasText: '模範解答' }).count()) === 0, '試験では模範解答が表示されない');
  await page.locator('button', { hasText: '採点する' }).click();
  ok(await page.locator('text=採点結果').isVisible(), '総合試験を採点できる（未解答なら不合格）');

  console.log('[17] 成果物');
  await go('deliv-mapping');
  await page.locator('#dv-mapping-src_table').fill('legacy_customers');
  await page.locator('#dv-mapping-r0c0').fill('email');
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Markdownで出力' }).click();
  const md = await page.locator('#export-text').inputValue();
  ok(md.includes('# データマッピング表') && md.includes('legacy_customers') && md.includes('| email'), '成果物をMarkdownで出力できる');
  await page.keyboard.press('Escape');
  await page.locator('button', { hasText: 'CSVで出力' }).click();
  ok((await page.locator('#export-text').inputValue()).includes('"移行先 列"'), '成果物（表）をCSVで出力できる');
  await page.keyboard.press('Escape');

  console.log('[19] 長時間実行の制限');
  await go('lesson-ch01');
  const r1 = page.locator('#sec-6 .runner');
  await typeSql(r1.locator('textarea.sql'), 'SELECT pg_sleep(30);');
  await r1.locator('button', { hasText: '▶ 実行' }).click();
  await r1.locator('.err').waitFor({ timeout: 40000 });
  ok((await r1.locator('.err').textContent()).includes('実行時間'), '長時間のSQLは時間制限で停止し、エラーとして表示される');
  await typeSql(r1.locator('textarea.sql'), 'SELECT COUNT(*) FROM customers;');
  await r1.locator('button', { hasText: '▶ 実行' }).click(); await page.waitForTimeout(500);
  ok((await r1.locator('td').first().textContent()) === '15', '停止後もアプリは動作し続ける');

  console.log('[18] スマートフォン');
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(BASE + '?engine=bridge#lesson-ch04'); await m.waitForSelector('#engine-pill[data-state="ready"]', { timeout: 30000 }); await m.waitForTimeout(500);
  ok(await m.locator('#menu-btn').isVisible(), 'スマートフォン幅でメニューボタンが表示される');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, 'スマートフォン幅で横スクロールが発生しない', `overflow=${overflow}`);
  await m.locator('#ex-e1 textarea.sql').fill("SELECT customer_id, name FROM customers WHERE prefecture = '東京都';");
  await m.locator('#ex-e1 button', { hasText: '✓ 判定' }).click();
  await m.locator('#ex-e1 .verdict').waitFor();
  ok((await m.locator('#ex-e1 .verdict').getAttribute('class')).includes('pass'), 'スマートフォンでもSQLの実行・判定ができる');
  await m.locator('#menu-btn').click(); await m.waitForTimeout(300);
  ok((await m.locator('#sidenav').getAttribute('data-open')) === '1', 'スマートフォンでナビゲーションを開ける');
  await m.close();

  console.log('[20] 外部接続');
  const external = requests.filter((u) => !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:'));
  ok(external.length === 0, 'アプリ（テスト時）はローカルとWebフォント以外に通信しない', external.slice(0, 3).join(' '));
  ok(errors.length === 0, 'JavaScriptの実行時エラーがない', errors.slice(0, 3).join(' | '));
} catch (e) {
  fail++; fails.push('例外: ' + e.message); console.error(e);
  await page.screenshot({ path: '/tmp/e2e-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n結果: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
}
