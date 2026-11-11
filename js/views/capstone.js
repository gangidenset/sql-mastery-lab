// 総合演習（課題1〜5）と総合試験
import { h, clear, fill, md, toast, exportText, confirmBox, fmtDate } from '../ui/dom.js';
import { createExercise } from '../ui/exercise.js';
import * as S from '../ui/session.js';
import * as store from '../store.js';
import { CAPSTONES, groupStepSpec } from '../content/index.js';
import { TEXT_SPECS, EXAM_TASKS, EXAM_TEXTS, EXAM_SETUP } from '../content/capstones.js';
import { BULK_LIMITS } from '../db/datasets.js';
import { evaluateCapstone, evaluateExam, textScore } from '../evaluate.js';

function axesView(ev) {
  return h('div', { class: 'score-axes' }, ev.axes.map(([name, v]) => h('div', { class: 'area-row' },
    h('span', {}, name), h('div', { class: 'bar' }, h('i', { style: { width: Math.round(v * 100) + '%' } })), h('span', { class: 'num small muted' }, Math.round(v * 100) + '%'))));
}

function textField(id, label, spec, value, onInput) {
  const meter = h('p', { class: 'small muted' });
  const upd = (v) => { const r = textScore(v, spec); meter.textContent = `${r.len}/${spec.min}文字以上${r.lenOk ? ' ✓' : ''}　キーワード: ${spec.keywords.map((k) => (r.hits.includes(k) ? '✓' : '・') + k).join(' ')}`; };
  const ta = h('textarea', { class: 'input', id, placeholder: spec.placeholder || '', oninput: (e) => { onInput(e.target.value); upd(e.target.value); } }, value || '');
  upd(value || '');
  return h('label', { class: 'field', for: id }, h('span', {}, label), ta, meter);
}

export function renderCapstone(id) {
  const cap = CAPSTONES.find((c) => c.id === id);
  if (!cap) return h('div', { class: 'page' }, h('p', {}, '課題が見つかりません。'));
  store.setLast('capstone', 'capstone-' + id);
  const cs = store.capstoneState(id);
  const bulk = cap.bulk ? BULK_LIMITS.default : undefined;
  S.prepare({ dataset: cap.dataset, bulkRows: bulk, setup: cap.setupAll || '', label: `課題${cap.no}` });
  const evalHost = h('div');
  const showEval = () => {
    const ev = evaluateCapstone(cap, cs);
    cs.score = ev.total;
    if (ev.passed && !cs.completedAt) { cs.completedAt = new Date().toISOString(); toast(`課題${cap.no}に合格しました`); }
    store.save();
    fill(evalHost, h('section', { class: 'panel stack' },
      h('div', { class: 'row' }, h('h2', {}, '評価'), h('span', { class: 'chip ' + (ev.passed ? 'ok' : 'warn') }, ev.passed ? `合格 ${ev.total}点` : `未合格 ${ev.total}点`)),
      axesView(ev),
      ev.safety.length ? h('div', { class: 'callout warn' }, h('b', {}, 'SQLの安全性について'), h('ul', {}, ev.safety.map((s) => h('li', {}, s.msg)))) : h('p', { class: 'small' }, 'SQLの安全性：危険な書き方は見つかりませんでした。'),
      h('p', { class: 'small muted' }, '合格条件: すべてのステップが正解（結果・整合性・安全性を自動採点）、危険なSQLなし、成果物の各項目が必要な文字数以上。説明文の評価は文字数とキーワードによる目安です。下のチェックリストで内容も自己点検してください。')));
  };
  const steps = cap.steps.map((step, i) => h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, `ステップ ${i + 1} / ${cap.steps.length}`),
    createExercise(groupStepSpec(cap, step, bulk), {
      histKey: `${cap.id}.${step.id}`, saved: cs.steps[step.id], ctxLabel: `課題${cap.no} ステップ${i + 1}`,
      onResult: (correct, sql) => { const r = (cs.steps[step.id] ||= { attempts: 0, wrong: 0 }); r.attempts++; r.lastSql = sql; if (correct) r.correct = true; else r.wrong++; store.touchStudyDay(); store.save(); showEval(); },
    })));
  let timer;
  const texts = cap.texts.map((k) => textField(`cap-${cap.id}-${k}`, TEXT_SPECS[k].label, TEXT_SPECS[k], cs.texts[k], (v) => { cs.texts[k] = v; clearTimeout(timer); timer = setTimeout(() => { store.save(); showEval(); }, 500); }));
  const checklist = ['移行対象と対象外の件数をすべて説明できる', '変換できない値・不正な値の扱いを決めて記録した', '再実行しても重複しないSQLにした', '移行後に件数・内容・集計値を検証した', '障害時にどこからやり直すか説明できる', '切り戻しの判断基準を書いた'];
  const cl = h('div', { class: 'stack', style: { gap: '4px' } }, checklist.map((c, i) => h('label', { class: 'row small', for: `${cap.id}-cl${i}` },
    h('input', { type: 'checkbox', id: `${cap.id}-cl${i}`, checked: !!cs.selfCheck[i], onchange: (e) => { cs.selfCheck[i] = e.target.checked; store.save(); } }), c)));
  const exportMd = () => exportText(`capstone${cap.no}.md`, [`# 課題${cap.no}：${cap.title}`, '', cap.story, '',
    ...cap.steps.map((s, i) => [`## ステップ${i + 1}：${s.title}`, '', `判定: ${cs.steps[s.id]?.correct ? '正解' : '未正解'}`, '', '```sql', cs.steps[s.id]?.lastSql || '-- 未提出', '```', ''].join('\n')),
    ...cap.texts.map((k) => [`## ${TEXT_SPECS[k].label}`, '', cs.texts[k] || '（未記入）', ''].join('\n')),
    `## 評価`, '', `合計 ${evaluateCapstone(cap, cs).total}点`].join('\n'), 'text/markdown');
  showEval();
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, `LEVEL 5 総合演習 ・ 課題${cap.no}`), h('h1', {}, cap.title)),
    h('section', { class: 'panel stack' }, md(cap.story), h('p', { class: 'small muted' }, '各ステップは独立した練習DBで採点されます（前のステップの結果が前提として用意されます）。')),
    h('div', { class: 'with-rail' },
      h('div', { class: 'stack' }, steps,
        h('section', { class: 'panel stack' }, h('h2', {}, '成果物（説明）'), texts, h('h3', {}, '自己点検チェックリスト'), cl,
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: exportMd }, 'この課題をMarkdownで出力')))),
      h('aside', { class: 'rail' }, evalHost)));
}

// ---------------- 総合試験 ----------------
export function renderExam() {
  store.setLast('exam', 'exam');
  const ex = store.get().exam;
  const ctxBase = { dataset: 'migration', setup: EXAM_SETUP, label: '総合試験の練習DB' };
  S.prepare(ctxBase);
  const resultHost = h('div');
  const tasks = EXAM_TASKS.map((t, i) => h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'row' }, h('span', { class: 'eyebrow' }, `問${i + 1}（${t.weight}点）`), t.required ? h('span', { class: 'chip warn' }, '必須') : null),
    createExercise({ ...t, dataset: 'migration', setup: EXAM_SETUP + '\n' + (t.setupExtra || ''), hints: [] }, {
      histKey: `exam.${t.id}`, saved: ex.answers[t.id], noAnswer: true, ctxLabel: `総合試験 問${i + 1}`,
      onResult: (correct, sql) => { const a = (ex.answers[t.id] ||= { attempts: 0 }); a.attempts++; a.sql = sql; a.correct = correct; store.touchStudyDay(); store.save(); },
    })));
  let timer;
  const texts = EXAM_TEXTS.map((t) => textField(`exam-${t.id}`, `${t.label}（${t.weight}点）`, t, ex.texts[t.id], (v) => { ex.texts[t.id] = v; clearTimeout(timer); timer = setTimeout(() => store.save(), 400); }));
  const submit = () => {
    const ev = evaluateExam(ex);
    ex.attempts.push({ at: new Date().toISOString(), score: ev.total, passed: ev.passed });
    store.save();
    fill(resultHost, h('section', { class: 'panel stack' },
      h('div', { class: 'row' }, h('h2', {}, '採点結果'), h('span', { class: 'chip ' + (ev.passed ? 'ok' : 'bad') }, `${ev.passed ? '合格' : '不合格'} ${ev.total}点`)),
      axesView(ev),
      h('ul', { class: 'checks' },
        h('li', {}, h('span', {}, ev.requiredOk ? '✓' : '✗'), h('span', {}, '必須の検証（データ検証・不整合の修正と再検証）を完了')),
        h('li', {}, h('span', {}, ev.textsOk ? '✓' : '✗'), h('span', {}, '説明・手順書がすべて必要な文字数以上')),
        h('li', {}, h('span', {}, ev.total >= 70 ? '✓' : '✗'), h('span', {}, '合計70点以上')),
        h('li', {}, h('span', {}, ev.safety.some((s) => s.level === 'danger') ? '✗' : '✓'), h('span', {}, '危険なSQL（WHEREのない更新・削除など）がない'))),
      ev.safety.length ? h('div', { class: 'callout warn' }, h('ul', {}, ev.safety.map((s) => h('li', {}, s.msg)))) : null,
      h('p', { class: 'small muted' }, '合格基準は「問題を解いたこと」ではなく、実際の移行作業を想定して必要な検証（問6・問7）を完了していることです。')));
    resultHost.scrollIntoView({ behavior: 'smooth' });
  };
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '修了判定'), h('h1', {}, '総合試験'),
      h('p', { class: 'muted' }, '移行演習データに、新しい異常データ（空のメール、大文字と空白付きの重複メール、存在しない2月30日、"1.5万" という金額 など）を追加した環境で行います。これまでの模範解答をそのまま使うのではなく、データを調べてから解いてください。ヒントは表示されません。'),
      ex.attempts.length ? h('p', { class: 'small' }, '過去の受験: ', ex.attempts.slice(-5).map((a) => `${fmtDate(a.at)} ${a.score}点${a.passed ? '（合格）' : ''}`).join(' / ')) : null),
    h('div', { class: 'stack' }, tasks),
    h('section', { class: 'panel stack' }, h('h2', {}, '記述（設計理由・障害対応・性能・手順書）'), texts),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: submit }, '採点する'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('解答をリセット', '総合試験の解答と記述をすべて消去します（受験履歴は残ります）。', '消去する', true)) { ex.answers = {}; ex.texts = {}; store.save(); dispatchEvent(new HashChangeEvent('hashchange')); } } }, '解答をリセット')),
    resultHost);
}
