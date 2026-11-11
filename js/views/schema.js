import { h, clear, fill, toast } from '../ui/dom.js';
import * as S from '../ui/session.js';
import * as I from '../db/introspect.js';
import { columnsTable, kindChip } from '../ui/schema-panel.js';
import { resultTable } from '../ui/runner.js';
import { DATASETS, DATA_NOTES } from '../db/datasets.js';

export function renderSchema() {
  const listHost = h('div', { class: 'tbl-list' });
  const detail = h('div', { class: 'stack' });
  const relHost = h('div');
  const dsSel = h('select', { class: 'input', id: 'schema-dataset', style: { width: 'auto' } }, Object.entries(DATASETS).map(([k, v]) => h('option', { value: k }, v.label)));
  let current = null;

  async function load() {
    const tables = await I.listTables();
    fill(listHost, ...tables.map((t) => h('button', { class: 'tbl-item', 'data-full': t.full, 'aria-current': String(current === t.full), onclick: () => show(t) }, kindChip(t.name), h('span', { class: 'tname', title: t.full }, t.full), h('span', { class: 'cnt' }, `${t.rows}件`))));
    const rels = await I.relations();
    fill(relHost, rels.length ? h('ul', { class: 'checks' }, rels.map((r) => h('li', {}, h('span', {}, '→'), h('span', { class: 'small' }, h('code', {}, r.child), ' が ', h('code', {}, r.parent), ' を参照（', h('code', {}, r.def), '）'))))
      : h('p', { class: 'small muted' }, '外部キーはありません。'));
    const t = tables.find((x) => x.full === current) || tables.find((x) => x.name === 'customers') || tables[0];
    if (t) show(t);
  }
  async function show(t) {
    current = t.full;
    listHost.querySelectorAll('.tbl-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.full === t.full)));
    const d = await I.describe(t.schema, t.name);
    const smp = await I.sample(t.schema, t.name, 20);
    const note = DATA_NOTES.find(([k]) => k.split(' / ').includes(t.name) || k === t.name);
    fill(detail, 
      h('div', { class: 'row' }, kindChip(t.name), h('h2', {}, t.full), h('span', { class: 'chip num' }, `${t.rows}件`), h('span', { class: 'chip' }, `スキーマ: ${t.schema}`)),
      t.comment ? h('p', {}, t.comment) : null,
      note ? h('div', { class: 'callout' }, h('b', {}, '学習用データの目的: '), note[1]) : null,
      h('h3', {}, '列（カラム）'), columnsTable(d),
      h('h3', {}, '制約'), d.constraints.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid' }, h('tbody', {}, d.constraints.map((c) => h('tr', {}, h('td', {}, c.type), h('td', {}, c.name), h('td', { style: { whiteSpace: 'normal' } }, c.def)))))) : h('p', { class: 'small muted' }, '制約はありません（旧システムのテーブルは制約なし＝ステージング扱い）。'),
      h('h3', {}, 'インデックス'), d.indexes.length ? h('ul', {}, d.indexes.map((x) => h('li', {}, h('code', { class: 'small' }, x.def)))) : h('p', { class: 'small muted' }, 'インデックスはありません。'),
      h('h3', {}, 'サンプルデータ（先頭20件）'), resultTable(smp));
  }

  dsSel.addEventListener('change', async () => {
    await S.resetTo({ dataset: dsSel.value });
    toast('練習DBを「' + DATASETS[dsSel.value].label + '」で初期化しました');
  });
  const off = S.onSession((e) => { if (!listHost.isConnected) return off(); if (e.type === 'changed' || e.type === 'context') load(); });
  load();

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, 'データベース構造ビューア'), h('h1', {}, 'テーブルと関連'),
      h('p', { class: 'muted' }, '現在の練習DBの構造をそのまま表示しています（自分で作成・変更したテーブルも反映されます）。'),
      h('div', { class: 'row' }, h('label', { for: 'schema-dataset', class: 'small' }, 'データセットを切り替えて初期化：'), dsSel)),
    h('div', { class: 'with-left' },
      h('aside', { class: 'panel stack' }, h('h3', {}, 'テーブル一覧'), h('p', { class: 'small muted' }, h('span', { class: 'chip legacy' }, '旧'), ' 旧システム　', h('span', { class: 'chip new' }, '新'), ' 新システム'), listHost),
      h('div', { class: 'stack' }, h('section', { class: 'panel stack' }, detail),
        h('section', { class: 'panel stack' }, h('h2', {}, 'テーブル間の関連（外部キー）'), relHost,
          h('p', { class: 'small muted' }, '新システム: customers 1 ── 多 orders 1 ── 多 order_items 多 ── 1 products。旧システムのテーブルには外部キーがないため、存在しない顧客番号などの「孤立データ」が入り得ます。')))));
}
