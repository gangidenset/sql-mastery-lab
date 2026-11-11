// 演習問題コンポーネント（A選択式 / B穴埋め / C誤り修正 / D作成 / E結果予測 / F調査 / G実務課題）
import { h, clear, fill, md, codeBlock, toast } from './dom.js';
import { createRunner, renderResult } from './runner.js';
import * as S from './session.js';
import * as store from '../store.js';
import { TYPE_LABELS } from '../content/index.js';
import { getTemplate } from '../content/templates.js';

export function fillToSql(template, values) {
  let i = 0;
  return template.replace(/\{\{(.*?)\}\}/g, () => values[i++] ?? '');
}

function verdictView(report) {
  return h('div', { class: 'verdict ' + (report.pass ? 'pass' : 'fail'), role: 'status' },
    h('b', {}, report.pass ? '正解です。' : 'まだ不正解です。下の項目を確認しましょう。'),
    h('ul', { class: 'checks' }, report.checks.map((c) => h('li', {}, h('span', { 'aria-hidden': 'true' }, c.ok ? '✓' : '✗'), h('span', {}, h('b', {}, c.label), c.detail ? ' — ' + c.detail : '')))));
}

/**
 * spec: 採点仕様（dataset/setup 含む）
 * o: { histKey, saved: {correct,lastSql}, onResult(correct, sql), ctxLabel, related: [{id,title}] }
 */
export function createExercise(spec, o = {}) {
  const saved = o.saved || {};
  const root = h('section', { class: 'ex', 'data-done': saved.correct ? '1' : '0', id: 'ex-' + spec.id });
  const status = h('span', { class: 'chip ' + (saved.correct ? 'ok' : '') }, saved.correct ? '正解済み' : (saved.attempts ? `挑戦 ${saved.attempts}回` : '未回答'));
  const verdictHost = h('div');
  const guideHost = h('div');
  let wrongCount = saved.wrong || 0;
  const ctx = () => ({ dataset: spec.dataset, setup: spec.setup, bulkRows: spec.bulkRows, label: o.ctxLabel || `${spec.title} の練習DB` });

  const record = (correct, sql) => {
    if (correct) { root.dataset.done = '1'; status.className = 'chip ok'; status.textContent = '正解済み'; }
    else { wrongCount++; if (!root.dataset.done || root.dataset.done === '0') status.textContent = `挑戦中（不正解 ${wrongCount}回）`; }
    o.onResult?.(correct, sql);
    clear(guideHost);
    if (!correct && wrongCount >= 3 && o.related?.length) {
      guideHost.append(h('div', { class: 'callout warn' }, '何度か不正解が続いています。関連する前のレッスンを復習してみましょう: ',
        o.related.map((r, i) => [i ? '、' : '', h('a', { href: '#lesson-' + r.id }, r.title)])));
    }
  };

  root.append(h('div', { class: 'ex-head' },
    h('span', { class: 'chip' }, TYPE_LABELS[spec.type] || spec.type), h('h3', {}, spec.title), status));
  root.append(md(spec.prompt));

  let runner = null;
  let getSql = () => '';

  // ---------- 種類別の本体 ----------
  if (spec.type === 'choice' || spec.type === 'predict') {
    if (spec.type === 'predict') root.append(codeBlock(spec.predictSql));
    let chosen = null;
    const opts = spec.options.map((t, i) => {
      const id = `${o.histKey}-opt${i}`.replace(/[^\w-]/g, '_');
      return h('label', { class: 'choice', for: id }, h('input', { type: 'radio', name: o.histKey, id, value: String(i), onchange: () => { chosen = i; } }), h('span', {}, t));
    });
    const after = h('div');
    root.append(h('div', { class: 'choices', role: 'radiogroup' }, opts), h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => {
        if (chosen === null) { toast('選択肢を選んでください'); return; }
        const correct = chosen === spec.answerIndex;
        opts.forEach((el, i) => { el.dataset.state = i === spec.answerIndex ? 'correct' : (i === chosen ? 'wrong' : ''); });
        fill(verdictHost, h('div', { class: 'verdict ' + (correct ? 'pass' : 'fail') }, h('b', {}, correct ? '正解です。' : '不正解です。'), h('p', {}, spec.explain || '')));
        record(correct, String(chosen));
        if (spec.type === 'predict' && !after.firstChild) {
          after.append(h('button', { class: 'btn', onclick: async () => {
            const res = await S.run(ctx(), spec.predictSql);
            fill(after, h('div', { class: 'runner' }, renderResult(res, spec.predictSql)));
          } }, '▶ 実際に実行して確認'));
        }
      } }, '回答する')), after);
  } else if (spec.type === 'fill') {
    const parts = spec.template.split(/(\{\{.*?\}\})/);
    const inputs = [];
    const fill = h('div', { class: 'fill' }, parts.map((p, i) => {
      if (/^\{\{.*\}\}$/.test(p)) {
        const inp = h('input', { type: 'text', 'aria-label': `空欄${inputs.length + 1}`, id: `${o.histKey}-blank${inputs.length}`.replace(/[^\w-]/g, '_'), autocomplete: 'off', spellcheck: 'false' });
        inputs.push(inp); return inp;
      }
      return p;
    }));
    getSql = () => fillToSql(spec.template, inputs.map((x) => x.value.trim()));
    const out = h('div');
    root.append(fill, h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => {
        const sql = getSql(); const res = await S.run(ctx(), sql);
        fill(out, h('div', { class: 'runner' }, h('div', { class: 'runner-foot' }, h('code', { class: 'small' }, sql)), renderResult(res, sql)));
      } }, '▶ 実行'),
      h('button', { class: 'btn', onclick: () => doGrade() }, '✓ 判定')), out);
  } else if (spec.type === 'deliverable') {
    const t = getTemplate(spec.template);
    root.append(h('div', { class: 'row' },
      h('a', { class: 'btn', href: '#deliv-' + spec.template }, `「${t.title}」を開く`),
      h('button', { class: 'btn primary', onclick: () => {
        const d = store.deliverableState(spec.template);
        const rows = (d.rows || []).filter((r) => r.some((c) => String(c || '').trim()));
        const ok = rows.length >= (spec.minRows || 1);
        fill(verdictHost, h('div', { class: 'verdict ' + (ok ? 'pass' : 'fail') }, h('b', {}, ok ? '合格です。' : '未完了です。'),
          h('p', {}, `入力済みの行: ${rows.length}行（必要: ${spec.minRows}行以上）。${ok ? spec.explain : ''}`)));
        record(ok, `rows=${rows.length}`);
      } }, '✓ 判定')));
  } else {
    // write / fix / investigate
    runner = createRunner({ ctx, initial: saved.lastSql || spec.starter || '', histKey: o.histKey, onGrade: () => doGrade() });
    getSql = () => runner.getSql();
    const ctxNote = h('p', { class: 'small muted' }, `この問題の練習DB: ${o.ctxLabel || spec.dataset}${spec.setup ? '（＋この問題用の前提データ）' : ''}。実行・判定はアプリ内の練習用DBだけで行われます。`);
    root.append(ctxNote, runner.el);
  }

  // ---------- 採点 ----------
  async function doGrade() {
    const sql = getSql();
    fill(verdictHost, h('p', { class: 'muted' }, '判定中…（模範解答と同じ初期状態で、あなたのSQLを実行して比べています）'));
    try {
      const report = await S.grade({ ...spec, label: o.ctxLabel }, sql);
      fill(verdictHost, verdictView(report));
      if (report.pass && spec.explain && !o.noAnswer) verdictHost.append(h('div', { class: 'callout ok', style: { marginTop: '8px' } }, spec.explain));
      if (runner && report.userResult && (report.userResult.ok || report.userResult.error)) {
        runner.showResult({ ok: report.userResult.ok, error: report.userResult.error, results: report.userResult.results }, sql);
      }
      record(report.pass, sql);
    } catch (e) {
      fill(verdictHost, h('div', { class: 'callout bad' }, '判定中にエラーが発生しました: ' + (e.message || e)));
    }
  }

  // ---------- ヒント・解答 ----------
  if (spec.hints?.length) {
    const list = h('div', { class: 'hint-list' });
    let shown = 0;
    const btn = h('button', { class: 'btn sm', onclick: () => {
      if (shown < spec.hints.length) list.append(h('div', { class: 'callout' }, `ヒント${shown + 1}: `, spec.hints[shown++]));
      btn.textContent = shown < spec.hints.length ? `次のヒント（${shown}/${spec.hints.length}）` : 'ヒントはここまで';
      btn.disabled = shown >= spec.hints.length;
    } }, `ヒントを見る（0/${spec.hints.length}）`);
    root.append(h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'row' }, btn), list));
  }
  const answerSql = spec.type === 'fill' ? spec.template.replace(/\{\{(.*?)\}\}/g, '$1') : spec.answer;
  if (answerSql && !o.noAnswer && spec.type !== 'choice' && spec.type !== 'predict') {
    const det = h('details', { class: 'reveal' }, h('summary', {}, '模範解答と解説を見る'));
    det.addEventListener('toggle', () => {
      if (!det.open || det.dataset.filled) return;
      det.dataset.filled = '1';
      const expected = h('div');
      det.append(h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, '書き方が違っても、結果と安全性が同じなら正解になります。'),
        codeBlock(answerSql),
        spec.explain ? h('div', { class: 'callout' }, spec.explain) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => {
            fill(expected, h('p', { class: 'muted small' }, '実行中…'));
            const r = await S.runAnswerPreview({ ...spec, answer: answerSql });
            fill(expected, h('p', { class: 'small muted' }, '模範解答を実行した結果（練習DBは実行後に初期状態へ戻しました）'), h('div', { class: 'runner' }, renderResult(r, answerSql)));
          } }, '期待される結果を見る'),
          runner ? h('button', { class: 'btn sm', onclick: () => {
            fill(expected, h('div', { class: 'compare' },
              h('div', { class: 'stack', style: { gap: '4px' } }, h('b', { class: 'small' }, 'あなたのSQL'), codeBlock(runner.getSql() || '（未入力）')),
              h('div', { class: 'stack', style: { gap: '4px' } }, h('b', { class: 'small' }, '模範解答'), codeBlock(answerSql))));
          } }, '自分のSQLと比較') : null),
        expected));
    });
    root.append(det);
  }
  root.append(verdictHost, guideHost);
  return root;
}
