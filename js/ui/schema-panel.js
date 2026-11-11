// テーブル一覧・構造・サンプルデータ（レッスン右側パネル／構造ビューアで共用）
import { h, clear, fill } from './dom.js';
import * as I from '../db/introspect.js';
import * as S from './session.js';
import { resultTable } from './runner.js';

export const kindChip = (name) => name.startsWith('legacy_') ? h('span', { class: 'chip legacy', title: '旧システム' }, '旧')
  : ['customers', 'orders', 'order_items', 'products', 'sales'].includes(name) ? h('span', { class: 'chip new', title: '新システム' }, '新') : null;

export function columnsTable(desc) {
  return h('div', { class: 'grid-scroll', style: { maxHeight: '320px' } }, h('table', { class: 'grid cols' },
    h('thead', {}, h('tr', {}, h('th', {}, '列名'), h('th', {}, '型'), h('th', {}, 'NULL'), h('th', {}, 'キー・既定値'))),
    h('tbody', {}, desc.columns.map((c) => h('tr', {},
      h('td', {}, c.name), h('td', {}, c.type), h('td', {}, c.nullable ? '可' : '不可'),
      h('td', { style: { whiteSpace: 'normal' } }, c.pk ? h('span', { class: 'key pk' }, 'PK') : null, ' ', c.fk ? h('span', { class: 'key fk', title: '外部キー' }, '→ ' + c.fk) : null, c.def ? h('span', { class: 'small muted' }, ' ' + c.def) : null))))));
}

export function createSchemaPanel({ onInsert } = {}) {
  const list = h('div', { class: 'tbl-list' });
  const detail = h('div', { class: 'stack', style: { gap: '8px' } });
  let selected = null; let busy = false;
  const root = h('section', { class: 'panel stack', 'aria-label': 'テーブル' },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, 'テーブル'), h('button', { class: 'btn ghost sm', onclick: () => refresh() }, '更新')),
    h('p', { class: 'small muted', 'data-ctx': '1' }, ''), list, detail);

  async function refresh() {
    if (busy) return; busy = true;
    try {
      root.querySelector('[data-ctx]').textContent = '練習DB: ' + S.contextLabel();
      const tables = await I.listTables();
      fill(list, ...tables.map((t) => h('button', { class: 'tbl-item', 'data-full': t.full, 'aria-current': String(selected === t.full), onclick: () => select(t) },
        kindChip(t.name), h('span', { class: 'tname', title: t.full }, t.full), h('span', { class: 'cnt' }, `${t.rows}件`))));
      const still = tables.find((t) => t.full === selected);
      if (still) await select(still); else clear(detail);
    } catch (e) { fill(list, h('p', { class: 'small muted' }, '読み込めませんでした: ' + e.message)); }
    finally { busy = false; }
  }
  async function select(t) {
    selected = t.full;
    list.querySelectorAll('.tbl-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.full === t.full)));
    const d = await I.describe(t.schema, t.name);
    const sampleHost = h('div');
    fill(detail, 
      t.comment ? h('p', { class: 'small' }, t.comment) : null,
      columnsTable(d),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: async () => { fill(sampleHost, resultTable(await I.sample(t.schema, t.name, 10))); } }, 'サンプル10件'),
        onInsert ? h('button', { class: 'btn sm', onclick: () => onInsert(`SELECT * FROM ${t.full} LIMIT 10;`) }, 'SELECT文を入れる') : null),
      sampleHost);
  }
  const off = S.onSession((e) => { if (e.type === 'changed' || e.type === 'context') { if (root.isConnected) refresh(); else off(); } });
  refresh();
  return root;
}
