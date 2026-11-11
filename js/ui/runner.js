// SQL実践エディタ（入力・実行・結果・エラー説明・履歴・初期化）
import { h, clear, fill, toast } from './dom.js';
import * as S from './session.js';
import * as store from '../store.js';
import { analyzeSafety } from '../safety.js';
import { explainError, errorLocation } from '../errors.js';
import { LIMITS } from '../engine/engine.js';

const TYPE = { 16: 'boolean', 20: 'bigint', 21: 'smallint', 23: 'integer', 25: 'text', 26: 'oid', 19: 'name', 114: 'json', 3802: 'jsonb', 700: 'real', 701: 'double', 1042: 'char', 1043: 'varchar', 1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1186: 'interval', 1700: 'numeric', 2278: 'void' };
const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 1700]);

export function resultTable(rs, max = LIMITS.maxDisplayRows) {
  const rows = rs.rows.slice(0, max);
  const table = h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, rs.fields.map((f) => h('th', {}, f.name, h('small', {}, TYPE[f.dataTypeID] || `type ${f.dataTypeID}`))))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((v, i) => v === null
      ? h('td', { class: 'null' }, 'NULL')
      : h('td', { class: NUMERIC.has(rs.fields[i].dataTypeID) ? 'n' : '' }, v === '' ? '' : v))))));
  return h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'grid-scroll' }, table),
    rs.rows.length > max ? h('p', { class: 'small muted' }, `${rs.rows.length}行のうち先頭${max}行を表示しています。`) : null);
}

export function errorView(err, sql) {
  const ex = explainError(err, sql);
  const loc = errorLocation(err, sql);
  return h('div', { class: 'err', role: 'alert' },
    h('b', {}, (ex.sure ? '' : '⚠ ') + ex.title),
    ex.body ? h('p', {}, ex.body) : null,
    h('div', { class: 'raw' }, `エラー${err.code ? ' [' + err.code + ']' : ''}: ${err.message}${err.detail ? '\n詳細: ' + err.detail : ''}${err.hint ? '\nヒント: ' + err.hint : ''}${loc ? `\n位置: ${loc.line}行目 ${loc.col}文字目` : ''}`),
    h('div', {}, h('span', { class: 'small muted' }, ex.sure ? '確認すること' : '確認すべきポイント'), h('ul', {}, ex.checks.map((c) => h('li', {}, c)))));
}

export function renderResult(res, sql) {
  const box = h('div', { class: 'result' });
  if (!res.ok) { box.append(h('div', { class: 'result-body' }, errorView(res.error, sql))); return box; }
  const sets = res.results || [];
  const lastIdx = (() => { for (let i = sets.length - 1; i >= 0; i--) if (sets[i].fields.length) return i; return -1; })();
  const body = h('div', { class: 'result-body' });
  const show = (i) => {
    clear(body);
    const rs = sets[i];
    if (rs && rs.fields.length) body.append(resultTable(rs));
    else body.append(h('p', { class: 'muted' }, rs ? `${rs.affectedRows ?? 0}行に影響しました（結果セットなし）` : '実行しました（結果セットなし）'));
    tabs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  };
  const tabs = h('div', { class: 'result-tabs', role: 'tablist' }, sets.length > 1 ? sets.map((rs, i) =>
    h('button', { class: 'chip', role: 'tab', onclick: () => show(i), title: '結果を切り替え' },
      `文${i + 1}: ${rs.fields.length ? rs.rows.length + '行' : (rs.affectedRows ?? 0) + '行に影響'}`)) : []);
  box.append(tabs, body);
  show(lastIdx >= 0 ? lastIdx : Math.max(0, sets.length - 1));
  return box;
}

/**
 * @param {object} o
 *  ctx: () => ({dataset, setup, bulkRows, label})
 *  initial: 初期SQL
 *  histKey: 履歴の分類キー
 *  onGrade: 採点ボタンの処理（省略可）
 *  extraButtons: 追加ボタン
 */
export function createRunner(o) {
  const gutter = h('div', { class: 'gutter', 'aria-hidden': 'true' }, '1');
  const ta = h('textarea', { class: 'sql', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'SQL入力エディタ', id: 'sql-' + (o.histKey || 'free').replace(/[^\w-]/g, '_') });
  ta.value = o.initial || '';
  const resultHost = h('div');
  const meta = h('span', { class: 'meta', 'aria-live': 'polite' });
  const txBadge = h('span', { class: 'tx-badge', hidden: true }, 'トランザクション中（未確定）');
  const confirmHost = h('div');

  const sync = () => {
    const n = ta.value.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    ta.rows = Math.max(6, n + 1);
    o.onChange?.(ta.value);
  };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (e.shiftKey && o.onGrade) o.onGrade(); else execute(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.setRangeText('  ', s, en, 'end'); sync();
    }
  });

  const runBtn = h('button', { class: 'btn primary', onclick: () => execute(), title: 'Ctrl+Enter（Macは⌘+Enter）' }, '▶ 実行');
  const gradeBtn = o.onGrade ? h('button', { class: 'btn', onclick: () => o.onGrade(), title: 'Ctrl+Shift+Enter' }, '✓ 判定') : null;
  const resetSqlBtn = h('button', { class: 'btn ghost sm', onclick: () => { ta.value = o.initial || ''; sync(); ta.focus(); } }, 'SQLを元に戻す');
  const resetDbBtn = h('button', { class: 'btn ghost sm', onclick: async () => {
    await S.resetTo(o.ctx()); txBadge.hidden = true; toast('練習DBをこの課題の初期状態に戻しました');
  } }, 'DBを初期化');
  const histSel = h('select', { class: 'input', style: { width: 'auto', maxWidth: '14em' }, 'aria-label': '実行履歴', onchange: () => {
    if (histSel.value) { ta.value = histSel.value; sync(); } histSel.value = '';
  } });
  const fillHist = () => {
    fill(histSel, h('option', { value: '' }, '実行履歴…'));
    store.get().history.filter((x) => x.ctx === o.histKey).slice(-15).reverse()
      .forEach((x) => histSel.append(h('option', { value: x.sql }, `${x.ok ? '✓' : '✗'} ${x.sql.replace(/\s+/g, ' ').slice(0, 40)}`)));
  };
  fillHist();

  async function execute(skipConfirm = false) {
    const sql = ta.value;
    if (!sql.trim()) { toast('SQLを入力してください'); return; }
    const findings = analyzeSafety(sql);
    if (!skipConfirm && findings.some((f) => f.level === 'danger' || f.level === 'warn')) {
      fill(confirmHost, h('div', { class: 'confirm-bar', role: 'alertdialog' },
        h('b', {}, '確認：データを大きく変更する可能性があるSQLです'),
        h('ul', { style: { margin: 0, paddingLeft: '1.3em' } }, findings.map((f) => h('li', {}, f.msg))),
        h('p', { class: 'small' }, 'ここは練習専用のDBなので、実行しても「DBを初期化」でいつでも元に戻せます。本番では必ず事前にSELECTで対象を確認しましょう。'),
        h('div', { class: 'row' },
          h('button', { class: 'btn danger', onclick: () => { clear(confirmHost); execute(true); } }, 'このまま実行する'),
          h('button', { class: 'btn', onclick: () => { clear(confirmHost); ta.focus(); } }, 'やめる'))));
      return;
    }
    clear(confirmHost);
    runBtn.disabled = true; meta.textContent = '実行中…';
    try {
      const res = await S.run(o.ctx(), sql);
      const last = (res.results || []).filter((r) => r.fields.length).at(-1);
      meta.textContent = `${res.ok ? '成功' : 'エラー'} ・ ${Math.round(res.ms ?? 0)} ms${last ? ` ・ ${last.rows.length}行` : ''}`;
      txBadge.hidden = !res.inTransaction;
      if (res.txAborted) txBadge.textContent = 'トランザクション中断中：ROLLBACK してください'; else txBadge.textContent = 'トランザクション中（未確定）';
      clear(resultHost);
      if (res.prepared) resultHost.append(h('p', { class: 'small muted', style: { padding: '6px 10px 0' } }, `練習DBを「${o.ctx().label || S.contextLabel()}」の状態に準備してから実行しました。`));
      if (res.restored) resultHost.append(h('div', { class: 'callout warn', style: { margin: '8px 10px 0' } }, '時間制限で停止したため、SQLエンジンを再起動して練習DBを作り直しました。'));
      if (res.sizeReset) resultHost.append(h('div', { class: 'callout warn', style: { margin: '8px 10px 0' } }, '練習DBのサイズが上限を超えたため、初期状態に戻しました。'));
      resultHost.append(renderResult(res, sql));
      store.addHistory({ ctx: o.histKey, sql, ok: res.ok, ms: Math.round(res.ms ?? 0), rows: last?.rows.length ?? null });
      fillHist();
      o.onRun?.(res, sql);
    } catch (e) {
      fill(resultHost, h('div', { class: 'result-body' }, errorView({ message: String(e.message || e) }, sql)));
      meta.textContent = 'エラー';
    } finally { runBtn.disabled = false; }
  }

  const el = h('div', { class: 'runner' },
    h('div', { class: 'runner-head' }, runBtn, gradeBtn, h('span', { class: 'grow' }), txBadge, histSel, resetSqlBtn, resetDbBtn),
    h('div', { class: 'editor' }, gutter, ta),
    confirmHost,
    h('div', { class: 'runner-foot' }, meta, h('span', { class: 'small muted', style: { marginLeft: 'auto' } }, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' 実行', o.onGrade ? ['　', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'Enter'), ' 判定'] : null)),
    resultHost);
  sync();
  return {
    el, execute,
    getSql: () => ta.value,
    setSql: (s) => { ta.value = s; sync(); },
    focus: () => ta.focus(),
    showResult: (res, sql) => { fill(resultHost, renderResult(res, sql)); },
  };
}
