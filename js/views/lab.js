// DB移行実践ラボ：シナリオA〜J／構造比較／マッピング→SQL生成／検証ツール／レポート／自由エディタ
import { h, clear, fill, md, toast, exportText, codeBlock } from '../ui/dom.js';
import { createRunner, resultTable } from '../ui/runner.js';
import { createExercise } from '../ui/exercise.js';
import * as S from '../ui/session.js';
import * as I from '../db/introspect.js';
import * as store from '../store.js';
import { SCENARIOS, getScenario } from '../content/scenarios.js';
import { groupStepSpec } from '../content/index.js';
import { BULK_LIMITS, clampBulk, DATASETS } from '../db/datasets.js';
import { MIG_CUSTOMERS, MIG_ORDERS_FULL, MIG_ITEMS } from '../content/migration-sql.js';

const R = String.raw;
// 既知の移行ペアの「列の対応」と「変換式の初期値」（学習者が自由に編集できる）
const PRESETS = {
  'legacy_customers>customers': {
    where: "del_flg = '0' AND sts_kbn <> '9' AND pg_input_is_valid(reg_ymd, 'date')",
    map: {
      customer_id: ['cust_no', 'substr(cust_no, 2)::integer'], legacy_cust_no: ['cust_no', 'cust_no'], name: ['cust_nm', 'cust_nm'],
      email: ['mail_addr', "NULLIF(lower(trim(mail_addr)), '')"], phone: ['tel_no', R`CASE WHEN tel_no ~ '^[0-9]{11}$' THEN regexp_replace(tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3') END`],
      prefecture: ['pref_cd', "(SELECT new_code FROM code_master WHERE code_type = 'PREF' AND old_code = pref_cd)"],
      status: ['sts_kbn', "(SELECT new_code FROM code_master WHERE code_type = 'CUST_STATUS' AND old_code = sts_kbn)"],
      points: ['point_bal', "CASE WHEN replace(point_bal, ',', '') ~ '^[0-9]+$' THEN replace(point_bal, ',', '')::integer ELSE 0 END"],
      registered_at: ['reg_ymd', 'reg_ymd::date'],
    },
  },
  'legacy_orders>orders': {
    where: "pg_input_is_valid(ord_ymd, 'date') AND regexp_replace(amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$' AND EXISTS (SELECT 1 FROM customers c WHERE c.legacy_cust_no = cust_no) AND EXISTS (SELECT 1 FROM code_master WHERE code_type = 'ORDER_STATUS' AND old_code = ord_sts)",
    map: {
      order_id: ['ord_no', 'substr(ord_no, 2)::integer'], legacy_ord_no: ['ord_no', 'ord_no'],
      customer_id: ['cust_no', '(SELECT c.customer_id FROM customers c WHERE c.legacy_cust_no = cust_no)'],
      order_date: ['ord_ymd', 'ord_ymd::date'], status: ['ord_sts', "(SELECT new_code FROM code_master WHERE code_type = 'ORDER_STATUS' AND old_code = ord_sts)"],
      total_amount: ['amt_txt', "round(regexp_replace(amt_txt, '[,¥]', '', 'g')::numeric * 1.1)"],
    },
  },
  'legacy_order_details>order_items': {
    where: "EXISTS (SELECT 1 FROM orders o WHERE o.legacy_ord_no = ord_no) AND EXISTS (SELECT 1 FROM code_master WHERE code_type = 'ITEM' AND old_code = item_cd)",
    map: {
      order_id: ['ord_no', '(SELECT o.order_id FROM orders o WHERE o.legacy_ord_no = ord_no)'], line_no: ['line_no', 'line_no::integer'],
      product_id: ['item_cd', "(SELECT new_code::integer FROM code_master WHERE code_type = 'ITEM' AND old_code = item_cd)"],
      quantity: ['qty_txt', 'qty_txt::integer'], unit_price: ['unit_prc_txt', 'unit_prc_txt::numeric'],
    },
  },
  'legacy_sales>sales': {
    where: "amt_txt ~ '^[0-9]+$'",
    map: { sale_id: ['sale_no', 'sale_no'], customer_code: ['cust_no', 'cust_no'], sale_date: ['sale_ymd', "to_date(sale_ymd, 'YYYYMMDD')"], amount: ['amt_txt', 'amt_txt::numeric'], region_cd: ['region_cd', 'region_cd'] },
  },
};
const VERIFY_PRESETS = {
  'legacy_customers>customers': { srcKey: 'cust_no', dstKey: 'legacy_cust_no', where: "del_flg = '0' AND sts_kbn <> '9'" },
  'legacy_orders>orders': { srcKey: 'ord_no', dstKey: 'legacy_ord_no', where: '' },
  'legacy_sales>sales': { srcKey: 'sale_no', dstKey: 'sale_id', where: "amt_txt ~ '^[0-9]+$'" },
};

const labState = () => (store.get().lab ||= { bulkRows: BULK_LIMITS.default, report: [], notes: '', dataset: 'migration' });

export function renderLab(sub) {
  const st = labState();
  const tabs = [['scenarios', 'シナリオ A〜J'], ['compare', '構造比較'], ['mapping', 'マッピング→SQL生成'], ['verify', '検証ツール'], ['report', '移行結果レポート'], ['free', '自由エディタ']];
  let active = sub && /^[A-J]$/.test(sub) ? 'scenarios' : (tabs.find(([k]) => k === sub)?.[0] || 'scenarios');
  const body = h('div', { class: 'stack' });
  const tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(k === active), onclick: () => { location.hash = k === 'scenarios' ? 'lab' : 'lab-' + k; } }, label)));
  // ツール類は「今の練習DBの状態のまま」使う（シナリオで移行した結果をそのまま検証できるように）
  const freeCtx = () => ({ keep: true, dataset: st.dataset || 'migration', bulkRows: st.bulkRows, label: `移行ラボ（${DATASETS[st.dataset || 'migration'].label}）` });

  if (active === 'scenarios') body.append(sub && /^[A-J]$/.test(sub) ? scenarioView(getScenario(sub)) : scenarioList());
  if (active === 'compare') body.append(compareView(freeCtx));
  if (active === 'mapping') body.append(mappingView(freeCtx));
  if (active === 'verify') body.append(verifyView(freeCtx));
  if (active === 'report') body.append(reportView());
  if (active === 'free') body.append(freeView(freeCtx));
  store.setLast('lab', sub ? 'lab-' + sub : 'lab');

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, 'DB移行実践ラボ'), h('h1', {}, '旧システム（legacy_*）から新システムへ'),
      h('p', { class: 'muted' }, '移行元＝旧システムのテーブル（legacy_customers など）、移行先＝新システムのテーブル（customers など）。どちらもこのブラウザ内の練習DBにあります。'),
      active !== 'scenarios' ? h('p', { class: 'small' }, `ツールは現在の練習DB（${S.contextLabel()}）をそのまま使います。シナリオで移行した直後の状態を検証できます。空の状態から始めるには「自由エディタ」でデータセットを選んで初期化してください。`) : null),
    tabBar, body);
}

// ---------------- シナリオ ----------------
function scenarioList() {
  return h('div', { class: 'grid-cards' }, SCENARIOS.map((s) => {
    const ss = store.get().scenarios[s.id];
    const done = s.steps.filter((st) => ss?.steps?.[st.id]?.correct).length;
    return h('a', { class: 'lesson-card', href: '#lab-' + s.id },
      h('span', { class: 'eyebrow' }, `シナリオ${s.id}`), h('h3', {}, s.title),
      h('p', { class: 'small muted' }, s.story.slice(0, 90) + '…'),
      h('div', { class: 'row' }, s.tables.map((t) => h('span', { class: 'chip ' + (t.startsWith('legacy_') ? 'legacy' : 'new') }, t)),
        h('span', { class: 'chip ' + (done === s.steps.length ? 'ok' : '') }, `${done}/${s.steps.length}`)));
  }));
}

function scenarioView(sc) {
  if (!sc) return h('p', {}, 'シナリオが見つかりません。');
  const st = labState();
  const ss = store.scenarioState(sc.id);
  const bulk = sc.bulk ? st.bulkRows : undefined;
  const progress = h('span', { class: 'chip' });
  const upd = () => { const d = sc.steps.filter((x) => ss.steps[x.id]?.correct).length; progress.textContent = `${d}/${sc.steps.length} 完了`; progress.className = 'chip ' + (d === sc.steps.length ? 'ok' : ''); if (d === sc.steps.length && !ss.completedAt) { ss.completedAt = new Date().toISOString(); store.save(); toast(`シナリオ${sc.id}を完了しました`); } };
  upd();
  const bulkCtl = sc.bulk ? h('div', { class: 'row panel' },
    h('label', { class: 'small', for: 'bulk-rows' }, 'データ件数（legacy_sales）'),
    h('select', { class: 'input', id: 'bulk-rows', style: { width: 'auto' }, onchange: (e) => { st.bulkRows = clampBulk(e.target.value); store.save(); toast('件数を変更しました。練習DBを作り直します'); dispatchEvent(new HashChangeEvent('hashchange')); } },
      [1000, 5000, 20000, 50000, 100000, 200000].map((n) => h('option', { value: n, selected: n === st.bulkRows }, `${n.toLocaleString()}件`))),
    h('span', { class: 'small muted' }, `上限 ${BULK_LIMITS.max.toLocaleString()}件・1回の実行は10秒で停止。件数を変えると練習DBを作り直します。`)) : null;
  S.prepare({ dataset: sc.dataset, bulkRows: bulk, label: `シナリオ${sc.id}` });
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('a', { href: '#lab' }, '← シナリオ一覧'), progress),
    h('section', { class: 'panel stack' }, h('span', { class: 'eyebrow' }, `シナリオ${sc.id}`), h('h2', {}, sc.title), md(sc.story),
      h('div', { class: 'row' }, h('span', { class: 'small muted' }, '使うテーブル: '), sc.tables.map((t) => h('span', { class: 'chip ' + (t.startsWith('legacy_') ? 'legacy' : 'new') }, t)),
        h('a', { class: 'btn sm', href: '#lab-compare' }, '構造比較を開く'), h('a', { class: 'btn sm', href: '#schema' }, '構造ビューア'))),
    bulkCtl,
    sc.steps.map((step, i) => h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, `ステップ ${i + 1} / ${sc.steps.length}`),
      createExercise(groupStepSpec(sc, step, bulk), {
        histKey: `scenario${sc.id}.${step.id}`, saved: ss.steps[step.id], ctxLabel: `シナリオ${sc.id} ステップ${i + 1}`,
        onResult: (correct, sql) => { const r = (ss.steps[step.id] ||= { attempts: 0, wrong: 0 }); r.attempts++; r.lastSql = sql; if (correct) r.correct = true; else r.wrong++; store.touchStudyDay(); store.save(); upd(); },
      }))));
}

// ---------------- 構造比較 ----------------
async function tableOptions() {
  const t = await I.listTables();
  return t.map((x) => x.full);
}
function pairSelectors(onChange, defaults = ['legacy_customers', 'customers']) {
  const a = h('select', { class: 'input', id: 'pair-src' }); const b = h('select', { class: 'input', id: 'pair-dst' });
  tableOptions().then((names) => {
    names.forEach((n) => { a.append(h('option', { value: n, selected: n === defaults[0] }, n)); b.append(h('option', { value: n, selected: n === defaults[1] }, n)); });
    onChange(a.value, b.value);
  });
  a.addEventListener('change', () => onChange(a.value, b.value)); b.addEventListener('change', () => onChange(a.value, b.value));
  return h('div', { class: 'row' }, h('label', { class: 'field', for: 'pair-src', style: { flex: '1 1 200px' } }, h('span', {}, '移行元（旧）'), a), h('span', { 'aria-hidden': 'true' }, '→'), h('label', { class: 'field', for: 'pair-dst', style: { flex: '1 1 200px' } }, h('span', {}, '移行先（新）'), b));
}
const baseType = (t) => t.replace(/\(.*\)/, '').replace('character varying', 'varchar').trim();

function compareView() {
  const out = h('div', { class: 'stack' });
  const sel = pairSelectors(async (src, dst) => {
    const [ss, ds] = await Promise.all([desc(src), desc(dst)]);
    const preset = PRESETS[`${src}>${dst}`]?.map || {};
    const usedSrc = new Set();
    const rows = ds.columns.map((c) => {
      const srcName = preset[c.name]?.[0] || (ss.columns.find((x) => x.name === c.name)?.name);
      const sc = ss.columns.find((x) => x.name === srcName);
      if (sc) usedSrc.add(sc.name);
      const diffs = [];
      if (!sc) diffs.push(['移行元なし（既定値/計算で用意）', 'warn']);
      else {
        if (sc.name !== c.name) diffs.push(['列名の変更', 'legacy']);
        if (baseType(sc.type) !== baseType(c.type)) diffs.push(['型の変更', 'warn']);
        else if (sc.type !== c.type) diffs.push(['長さ・精度の変更', '']);
        if (sc.nullable && !c.nullable) diffs.push(['NOT NULLに変更', 'bad']);
      }
      return h('tr', { class: 'diff-row' },
        h('td', {}, sc?.name || '—'), h('td', {}, sc?.type || ''), h('td', {}, sc ? (sc.nullable ? '可' : '不可') : ''),
        h('td', {}, c.pk ? h('span', { class: 'key pk' }, 'PK') : null, ' ', c.name), h('td', {}, c.type), h('td', {}, c.nullable ? '可' : '不可'),
        h('td', { style: { whiteSpace: 'normal' } }, diffs.length ? diffs.map(([d, k]) => h('span', { class: 'chip ' + k }, d)) : h('span', { class: 'chip ok' }, '同じ')));
    });
    const unused = ss.columns.filter((c) => !usedSrc.has(c.name));
    fill(out, 
      h('p', { class: 'small muted' }, Object.keys(preset).length ? 'この組み合わせは、移行仕様の列対応（マッピング）に基づいて並べています。' : '同じ列名どうしを対応させています。対応は「マッピング→SQL生成」で自由に設定できます。'),
      h('div', { class: 'grid-scroll' }, h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, '旧 列名'), h('th', {}, '旧 型'), h('th', {}, '旧 NULL'), h('th', {}, '新 列名'), h('th', {}, '新 型'), h('th', {}, '新 NULL'), h('th', {}, '差分'))),
        h('tbody', {}, rows))),
      unused.length ? h('div', { class: 'callout warn' }, h('b', {}, '移行先に対応する列がない旧の列: '), unused.map((c) => c.name).join(', '), '。移行しない理由（不要／別テーブルへ）を仕様に書きましょう。') : null);
  });
  return h('section', { class: 'panel stack' }, h('h2', {}, '構造比較：カラム名・データ型・NULL許可の差分'), sel, out);
}
async function desc(full) { const [schema, name] = full.includes('.') ? full.split('.') : ['public', full]; return I.describe(schema, name); }

// ---------------- マッピング → SQL生成 ----------------
function mappingView(ctx) {
  const form = h('div', { class: 'stack' });
  const runner = createRunner({ ctx, initial: '-- 上でマッピングを設定して「SQLを生成」を押すと、ここに移行SQLが入ります。\n-- 生成されたSQLは必ず読んで、必要に応じて修正してから実行してください。', histKey: 'lab.mapping' });
  let pair = null; let inputs = [];
  const whereIn = h('textarea', { class: 'input', id: 'map-where', rows: 2, spellcheck: 'false', style: { fontFamily: 'var(--font-code)' } });
  const sel = pairSelectors(async (src, dst) => {
    pair = [src, dst];
    const ds = await desc(dst);
    const preset = PRESETS[`${src}>${dst}`] || { map: {}, where: '' };
    const ss = await desc(src);
    whereIn.value = preset.where || '';
    inputs = ds.columns.map((c) => {
      const def = preset.map[c.name]?.[1] ?? (ss.columns.find((x) => x.name === c.name) ? c.name : '');
      const inp = h('input', { class: 'input', id: 'map-' + c.name, value: def, spellcheck: 'false', placeholder: c.def ? `空欄なら既定値: ${c.def}` : (c.nullable ? '空欄なら NULL（列から除外）' : '必須（NOT NULL）'), style: { fontFamily: 'var(--font-code)', fontSize: '.84rem' } });
      return { col: c, inp };
    });
    fill(form, h('div', { class: 'grid-scroll', style: { maxHeight: 'none' } }, h('table', { class: 'grid', style: { width: '100%' } },
      h('thead', {}, h('tr', {}, h('th', {}, '移行先の列'), h('th', {}, '型'), h('th', { style: { width: '60%' } }, '変換式（移行元の列名で書く）'))),
      h('tbody', {}, inputs.map(({ col, inp }) => h('tr', {}, h('td', {}, col.name, col.nullable ? '' : ' *'), h('td', {}, col.type), h('td', { style: { whiteSpace: 'normal' } }, inp)))))));
  }, ['legacy_customers', 'customers']);
  const gen = () => {
    if (!pair) return;
    const used = inputs.filter((x) => x.inp.value.trim());
    if (!used.length) return toast('変換式を1つ以上入力してください');
    const sql = `-- 自動生成した移行SQL（${pair[0]} → ${pair[1]}）。必ず内容を確認・修正してから実行してください。\n-- まず INSERT の行を消して SELECT だけ実行し、件数と変換結果を確認するのが安全です。\nINSERT INTO ${pair[1]} (${used.map((x) => x.col.name).join(', ')})\nSELECT ${used.map((x) => x.inp.value.trim()).join(',\n       ')}\nFROM ${pair[0]}${whereIn.value.trim() ? '\nWHERE ' + whereIn.value.trim() : ''};`;
    runner.setSql(sql); runner.focus(); toast('SQLを生成しました。内容を確認してから実行してください');
  };
  return h('div', { class: 'stack' },
    h('section', { class: 'panel stack' }, h('h2', {}, 'データ変換ルールの設定 → 移行SQLの生成'),
      h('p', { class: 'small muted' }, '移行先の列ごとに変換式を書くと、INSERT INTO … SELECT を生成します。生成したSQLは下のエディタで読んで修正できます。自動生成したSQLを実行しただけでは、レッスンやシナリオは完了になりません（採点は各課題で行います）。'),
      sel, form,
      h('label', { class: 'field', for: 'map-where' }, h('span', {}, '移行対象の条件（WHERE）'), whereIn),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: gen }, 'SQLを生成'),
        h('button', { class: 'btn', onclick: () => { runner.setSql(`-- 参考：このアプリの移行仕様による模範的な移行SQL（顧客→注文→明細）\n${MIG_CUSTOMERS}\n\n${MIG_ORDERS_FULL}\n\n${MIG_ITEMS}`); } }, '参考：模範移行SQLを表示'),
        h('button', { class: 'btn', onclick: async () => { await S.resetTo(ctx()); toast('練習DBを初期化しました'); } }, 'DBを初期化'))),
    runner.el);
}

// ---------------- 検証ツール ----------------
function verifyView(ctx) {
  const out = h('div', { class: 'stack' });
  const f = { srcKey: h('input', { class: 'input', id: 'v-srckey', spellcheck: 'false' }), dstKey: h('input', { class: 'input', id: 'v-dstkey', spellcheck: 'false' }), where: h('input', { class: 'input', id: 'v-where', spellcheck: 'false' }) };
  let pair = null;
  const sel = pairSelectors((src, dst) => {
    pair = [src, dst];
    const p = VERIFY_PRESETS[`${src}>${dst}`] || { srcKey: '', dstKey: '', where: '' };
    f.srcKey.value = p.srcKey; f.dstKey.value = p.dstKey; f.where.value = p.where;
  });
  async function runVerify() {
    if (!pair || !f.srcKey.value.trim() || !f.dstKey.value.trim()) return toast('キーを入力してください');
    const [src, dst] = pair; const sk = f.srcKey.value.trim(), dk = f.dstKey.value.trim(), w = f.where.value.trim();
    const srcWhere = w ? `WHERE ${w}` : '';
    const and = w ? `(${w}) AND ` : '';
    const dd = await desc(dst);
    const checks = [
      ['件数の比較', `SELECT (SELECT COUNT(*) FROM ${src} ${srcWhere}) AS src_count,\n       (SELECT COUNT(*) FROM ${dst}) AS dst_count;`],
      ['移行漏れ（移行元の対象にあって、移行先にない）', `SELECT ${sk} AS missing_key FROM ${src} s\nWHERE ${and}NOT EXISTS (SELECT 1 FROM ${dst} d WHERE d.${dk} = s.${sk})\nORDER BY 1 LIMIT 100;`],
      ['余分なレコード（移行先にあって、移行元の対象にない）', `SELECT d.${dk} AS extra_key FROM ${dst} d\nWHERE NOT EXISTS (SELECT 1 FROM ${src} s WHERE ${and}s.${sk} = d.${dk})\nORDER BY 1 LIMIT 100;`],
      ['移行先キーの重複', `SELECT ${dk} AS dup_key, COUNT(*) AS cnt FROM ${dst}\nGROUP BY ${dk} HAVING COUNT(*) > 1;`],
      ['移行先の列ごとのNULL件数', `SELECT ${dd.columns.map((c) => `COUNT(*) FILTER (WHERE ${I.qid(c.name)} IS NULL) AS ${I.qid(c.name)}`).join(',\n       ')}\nFROM ${dst};`],
    ];
    fill(out, h('p', { class: 'muted' }, '検証中…'));
    const results = [];
    for (const [title, sql] of checks) {
      const r = await S.run(ctx(), sql);
      results.push({ title, sql, r });
    }
    const summary = [];
    clear(out);
    for (const { title, sql, r } of results) {
      const rs = r.ok ? r.results.at(-1) : null;
      let judge = '';
      if (rs && /漏れ|余分|重複/.test(title)) judge = rs.rows.length ? `要確認（${rs.rows.length}件）` : 'OK（0件）';
      if (rs && /件数/.test(title)) judge = rs.rows[0][0] === rs.rows[0][1] ? `一致（${rs.rows[0][0]}件）` : `不一致（元 ${rs.rows[0][0]} / 先 ${rs.rows[0][1]}）`;
      summary.push({ title, judge: r.ok ? judge || '（結果を確認）' : 'エラー: ' + r.error.message, sql });
      out.append(h('section', { class: 'panel stack' }, h('div', { class: 'row' }, h('h3', {}, title), judge ? h('span', { class: 'chip ' + (/OK|一致（/.test(judge) && !/不一致/.test(judge) ? 'ok' : 'warn') }, judge) : null),
        h('details', { class: 'reveal' }, h('summary', {}, '使ったSQLを見る'), codeBlock(sql)),
        r.ok ? resultTable(rs) : h('div', { class: 'callout bad' }, r.error.message)));
    }
    const st = labState();
    st.report.push({ at: new Date().toISOString(), src, dst, srcKey: sk, dstKey: dk, where: w, items: summary.map(({ title, judge }) => ({ title, judge })), sqls: summary.map((s) => s.sql) });
    st.report = st.report.slice(-30); store.save();
    out.prepend(h('div', { class: 'callout ok' }, '検証結果を「移行結果レポート」に記録しました。差分が見つかった場合は、原因を調べて修正SQLを作り、もう一度検証しましょう。'));
  }
  return h('div', { class: 'stack' },
    h('section', { class: 'panel stack' }, h('h2', {}, '移行前後のデータ検証'),
      h('p', { class: 'small muted' }, '件数・漏れ・余分・重複・NULLを一度に調べます。実行するSQLはすべて表示されるので、検証SQLの書き方の学習にも使えます。先にシナリオや自由エディタで移行を実行してから使いましょう。'),
      sel,
      h('div', { class: 'row' }, h('label', { class: 'field', for: 'v-srckey', style: { flex: '1 1 160px' } }, h('span', {}, '移行元のキー列'), f.srcKey), h('label', { class: 'field', for: 'v-dstkey', style: { flex: '1 1 160px' } }, h('span', {}, '移行先のキー列'), f.dstKey)),
      h('label', { class: 'field', for: 'v-where' }, h('span', {}, '移行元の対象条件（空欄なら全件）'), f.where),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: runVerify }, '検証を実行'))),
    out);
}

// ---------------- レポート ----------------
function reportView() {
  const st = labState();
  const notes = h('textarea', { class: 'input', id: 'lab-notes', placeholder: '修正した内容、残課題、判断の経緯などをメモ', oninput: () => { st.notes = notes.value; store.save(); } }, st.notes || '');
  const toMd = () => [
    '# 移行結果レポート', '', `作成: ${new Date().toLocaleString('ja-JP')}（SQL MASTERY LAB 練習環境）`, '',
    ...st.report.map((r, i) => [`## 検証${i + 1}: ${r.src} → ${r.dst}`, '', `- 実施: ${new Date(r.at).toLocaleString('ja-JP')}`, `- キー: ${r.srcKey} → ${r.dstKey}`, `- 対象条件: ${r.where || '（全件）'}`, '',
      '| 検証項目 | 結果 |', '|---|---|', ...r.items.map((x) => `| ${x.title} | ${x.judge} |`), '',
      '<details><summary>検証SQL</summary>', '', '```sql', ...r.sqls, '```', '</details>', ''].join('\n')),
    '## メモ・残課題', '', st.notes || '（なし）'].join('\n');
  return h('section', { class: 'panel stack' }, h('h2', {}, '移行結果レポート'),
    st.report.length ? h('div', { class: 'stack' }, st.report.slice().reverse().map((r) => h('div', { class: 'ex' },
      h('div', { class: 'row' }, h('b', {}, `${r.src} → ${r.dst}`), h('span', { class: 'small muted' }, new Date(r.at).toLocaleString('ja-JP'))),
      h('ul', { class: 'checks' }, r.items.map((x) => h('li', {}, h('span', {}, /OK|一致（/.test(x.judge) && !/不一致/.test(x.judge) ? '✓' : '•'), h('span', { class: 'small' }, `${x.title}: ${x.judge}`)))))))
      : h('p', { class: 'muted' }, 'まだ検証結果がありません。「検証ツール」で検証を実行すると、ここに記録されます。'),
    h('label', { class: 'field', for: 'lab-notes' }, h('span', {}, 'メモ・残課題'), notes),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => exportText('migration-report.md', toMd(), 'text/markdown') }, 'Markdownで出力'),
      h('button', { class: 'btn danger', onclick: async () => { const { confirmBox } = await import('../ui/dom.js'); if (await confirmBox('レポートを消去', '記録した検証結果をすべて消去します。よろしいですか？', '消去する', true)) { st.report = []; store.save(); location.hash = 'lab-report'; dispatchEvent(new HashChangeEvent('hashchange')); } } }, '記録を消去')));
}

// ---------------- 自由エディタ ----------------
function freeView(ctx) {
  const st = labState();
  const dsSel = h('select', { class: 'input', id: 'lab-ds', style: { width: 'auto' }, onchange: async () => { st.dataset = dsSel.value; store.save(); await S.resetTo(ctx()); toast('練習DBを切り替えました'); } },
    Object.entries(DATASETS).map(([k, v]) => h('option', { value: k, selected: k === (st.dataset || 'migration') }, v.label)));
  const runner = createRunner({ ctx, initial: "-- 自由に移行SQLを試せます（練習DBのみ）\nSELECT * FROM legacy_customers ORDER BY cust_no;", histKey: 'free' });
  return h('div', { class: 'stack' }, h('div', { class: 'row' }, h('label', { class: 'small', for: 'lab-ds' }, 'データセット'), dsSel), runner.el);
}
