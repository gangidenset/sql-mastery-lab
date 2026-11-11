import { h, clear, fill, exportText, confirmBox, toast } from '../ui/dom.js';
import * as store from '../store.js';
import { TEMPLATES, getTemplate, toMarkdown, toCsv } from '../content/templates.js';

function filled(t) {
  const d = store.get().deliverables[t.id];
  if (!d) return 0;
  const f = Object.values(d.fields || {}).filter((v) => String(v).trim()).length;
  const r = (d.rows || []).filter((row) => row.some((c) => String(c || '').trim())).length;
  return f + r;
}

export function renderDeliverables(id) {
  if (id) return editor(getTemplate(id));
  store.setLast('deliverables', 'deliverables');
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '実務成果物'), h('h1', {}, '移行プロジェクトの成果物テンプレート'),
      h('p', { class: 'muted' }, '入力内容はこのブラウザに自動保存されます。Markdown（表はCSVも）で出力して、Excelや社内Wikiに貼り付けて使えます。')),
    h('div', { class: 'grid-cards' }, TEMPLATES.map((t) => h('a', { class: 'lesson-card', href: '#deliv-' + t.id },
      h('h3', {}, t.title), h('p', { class: 'small muted' }, t.desc),
      h('div', { class: 'row' }, h('span', { class: 'chip ' + (filled(t) ? 'new' : '') }, filled(t) ? `${filled(t)}項目 入力済み` : '未入力'), t.table ? h('span', { class: 'chip' }, 'CSV出力可') : null)))));
}

function editor(t) {
  if (!t) return h('div', { class: 'page' }, h('p', {}, 'テンプレートが見つかりません。'));
  store.setLast('deliverables', 'deliv-' + t.id);
  const d = store.deliverableState(t.id);
  if (t.table && !d.rows) d.rows = [t.table.cols.map(() => '')];
  let timer = null;
  const saveSoon = () => { clearTimeout(timer); timer = setTimeout(() => { store.touchStudyDay(); store.save(); savedNote.textContent = '保存しました ' + new Date().toLocaleTimeString('ja-JP'); }, 400); };
  const savedNote = h('span', { class: 'small muted', 'aria-live': 'polite' }, '入力は自動保存されます');

  const fields = (t.fields || []).map(([k, label, type]) => {
    const id = `dv-${t.id}-${k}`;
    const input = type === 'textarea'
      ? h('textarea', { class: 'input', id, oninput: (e) => { d.fields[k] = e.target.value; saveSoon(); } }, d.fields[k] || '')
      : h('input', { class: 'input', id, value: d.fields[k] || '', oninput: (e) => { d.fields[k] = e.target.value; saveSoon(); } });
    return h('label', { class: 'field', for: id }, h('span', {}, label), input);
  });

  const tbody = h('tbody');
  const drawRows = () => {
    fill(tbody, ...d.rows.map((row, ri) => h('tr', {},
      t.table.cols.map((c, ci) => h('td', {}, h('textarea', { 'aria-label': `${ri + 1}行目 ${c}`, id: `dv-${t.id}-r${ri}c${ci}`, rows: 1, oninput: (e) => { row[ci] = e.target.value; saveSoon(); } }, row[ci] || ''))),
      h('td', { style: { padding: '2px' } }, h('button', { class: 'btn ghost sm', 'aria-label': `${ri + 1}行目を削除`, onclick: () => { d.rows.splice(ri, 1); if (!d.rows.length) d.rows.push(t.table.cols.map(() => '')); store.save(); drawRows(); } }, '×')))));
  };
  if (t.table) drawRows();

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('a', { href: '#deliverables' }, '← 成果物一覧'), h('h1', {}, t.title), h('p', { class: 'muted' }, t.desc)),
    h('section', { class: 'panel stack' }, fields.length ? fields : null,
      t.table ? h('div', { class: 'stack' }, h('h2', {}, t.table.title),
        h('div', { class: 'table-wrap' }, h('table', { class: 'edit' }, h('thead', {}, h('tr', {}, t.table.cols.map((c) => h('th', {}, c)), h('th', {}, ''))), tbody)),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { d.rows.push(t.table.cols.map(() => '')); store.save(); drawRows(); } }, '＋ 行を追加'))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => exportText(`${t.id}.md`, toMarkdown(t, d), 'text/markdown') }, 'Markdownで出力'),
        t.table ? h('button', { class: 'btn', onclick: () => exportText(`${t.id}.csv`, toCsv(t, d), 'text/csv') }, 'CSVで出力（表）') : null,
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmBox('入力内容を消去', `「${t.title}」の入力内容をすべて消去します。元に戻せません。`, '消去する', true))) return;
          d.fields = {}; d.rows = t.table ? [t.table.cols.map(() => '')] : null; store.save(); toast('消去しました');
          dispatchEvent(new HashChangeEvent('hashchange'));
        } }, '消去'),
        savedNote)));
}
