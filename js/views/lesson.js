import { h, md, codeBlock, clear, fill, stars, toast } from '../ui/dom.js';
import { createRunner, renderResult } from '../ui/runner.js';
import { createExercise } from '../ui/exercise.js';
import { createSchemaPanel } from '../ui/schema-panel.js';
import * as S from '../ui/session.js';
import * as store from '../store.js';
import * as P from '../progress.js';
import { LEVELS, getLesson, nextLesson, lessonExerciseSpec } from '../content/index.js';
import { DATASETS } from '../db/datasets.js';
import { passCondition } from './curriculum.js';

const SECTIONS = ['学習目標', '実務での利用場面', '用語の説明', 'SQLの基本構文', 'SQLの具体例', 'SQLの実行結果', '処理内容の解説', '練習問題', 'ヒント', '模範解答', '解答の詳細解説', 'よくある間違い', 'エラー発生時の確認事項', '実務で注意すべき点', '理解度確認テスト', '合格条件', '次のレッスンへ'];

export function renderLesson(id) {
  const lesson = getLesson(id);
  if (!lesson) return h('div', { class: 'page' }, h('p', {}, 'レッスンが見つかりません。'), h('a', { href: '#curriculum' }, 'カリキュラムへ'));
  const ls = store.lessonState(id);
  ls.visitedAt = new Date().toISOString(); store.touchStudyDay(); store.setLast('lesson', 'lesson-' + id);

  const ctx = { dataset: lesson.dataset || 'base', setup: lesson.setup || '', label: `第${lesson.chapter}章の練習DB（${DATASETS[lesson.dataset || 'base'].label}${lesson.setup ? '＋前提データ' : ''}）` };
  S.prepare(ctx);
  const related = (lesson.prereq || []).map(getLesson).map((l) => ({ id: l.id, title: `第${l.chapter}章 ${l.title}` }));
  const completeHost = h('div');
  const sec = (no, body, extraTitle) => h('section', { class: 'lesson-sec', id: `sec-${no}` }, h('h2', {}, h('small', {}, String(no).padStart(2, '0')), extraTitle || SECTIONS[no - 1]), body);

  // 自由に試すエディタ
  const scratch = createRunner({ ctx: () => ctx, initial: lesson.examples[0]?.sql || '', histKey: `${id}.free` });

  // 具体例と実行結果
  const exampleBlocks = lesson.examples.map((ex, i) => {
    const out = h('div');
    return h('div', { class: 'stack', style: { gap: '6px' } },
      h('h3', {}, `例${i + 1}：${ex.title}`), codeBlock(ex.sql),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm primary', onclick: async () => {
          const r = await S.run(ctx, ex.sql);
          fill(out, h('div', { class: 'runner' }, renderResult(r, ex.sql)));
        } }, '▶ 実行して結果を見る'),
        h('button', { class: 'btn sm', onclick: () => { scratch.setSql(ex.sql); document.getElementById('sec-6').scrollIntoView({ behavior: 'smooth' }); scratch.focus(); } }, 'エディタで試す')),
      out);
  });

  const checkComplete = () => {
    const p = P.lessonProgress(lesson);
    clear(completeHost);
    if (p.passed) {
      if (ls.status !== 'done') { store.setLessonStatus(id, 'done'); toast(`第${lesson.chapter}章を完了しました`); }
      const nx = nextLesson(id);
      completeHost.append(h('div', { class: 'callout ok' }, h('b', {}, 'このレッスンの合格条件を満たしました。'), nx ? [' 次は ', h('a', { href: '#lesson-' + nx.id }, `第${nx.chapter}章 ${nx.title}`), ' です。'] : ' 総合演習へ進みましょう。'));
    } else {
      completeHost.append(h('p', { class: 'small muted' }, `現在: 演習 ${p.exDone}/${p.exTotal}・理解度テスト ${p.qDone}/${p.qTotal} 正解`));
    }
  };

  const exercises = lesson.exercises.map((ex) => createExercise(lessonExerciseSpec(lesson, ex), {
    histKey: `${id}.${ex.id}`, saved: ls.exercises[ex.id], related,
    ctxLabel: `第${lesson.chapter}章 ${ex.title}`,
    onResult: (correct, sql) => { store.recordExercise(id, ex.id, { correct, sql }); checkComplete(); },
  }));

  const quiz = lesson.quiz.map((q, qi) => {
    const prev = ls.quiz[qi];
    const fb = h('div');
    const name = `${id}-q${qi}`;
    let chosen = null;
    const opts = q.options.map((t, i) => h('label', { class: 'choice', for: `${name}-${i}` }, h('input', { type: 'radio', name, id: `${name}-${i}`, onchange: () => { chosen = i; } }), h('span', {}, t)));
    return h('div', { class: 'ex' },
      h('div', { class: 'ex-head' }, h('h3', {}, `Q${qi + 1}. ${q.q}`), h('span', { class: 'chip ' + (prev?.correct ? 'ok' : '') }, prev ? (prev.correct ? '正解済み' : '再挑戦') : '未回答')),
      h('div', { class: 'choices' }, opts),
      h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: () => {
        if (chosen === null) return toast('選択肢を選んでください');
        const ok = chosen === q.answer;
        opts.forEach((el, i) => { el.dataset.state = i === q.answer ? 'correct' : (i === chosen ? 'wrong' : ''); });
        fill(fb, h('div', { class: 'verdict ' + (ok ? 'pass' : 'fail') }, h('b', {}, ok ? '正解' : '不正解'), h('p', {}, q.explain)));
        store.recordQuiz(id, qi, ok); checkComplete();
      } }, '回答する')), fb);
  });

  const miss = P.missingPrereqs(lesson);
  const nx = nextLesson(id);
  const lvl = LEVELS[lesson.level];

  const content = h('div', { class: 'stack', style: { gap: '26px' } },
    h('div', { class: 'page-head' },
      h('span', { class: 'eyebrow' }, `${lvl.title} ・ 第${lesson.chapter}章`),
      h('h1', {}, lesson.title),
      h('div', { class: 'row small muted' }, '難易度 ', stars(lesson.difficulty), ` ・ 想定 ${lesson.minutes}分 ・ 練習DB: ${DATASETS[ctx.dataset].label}`),
      miss.length ? h('div', { class: 'callout warn' }, '前提となるレッスンが未完了です。先に復習すると理解しやすくなります: ',
        miss.map((m, i) => [i ? '、' : '', h('a', { href: '#lesson-' + m.id }, `第${m.chapter}章 ${m.title}`)])) : null,
      h('nav', { class: 'toc', 'aria-label': 'このレッスンの目次' }, SECTIONS.map((s, i) => h('a', { href: `#lesson-${id}`, onclick: (e) => { e.preventDefault(); document.getElementById(`sec-${i + 1}`)?.scrollIntoView({ behavior: 'smooth' }); } }, `${i + 1}. ${s}`)))),
    sec(1, h('p', {}, lesson.goal)),
    sec(2, h('p', {}, lesson.usage)),
    sec(3, h('dl', { class: 'terms' }, lesson.terms.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]))),
    sec(4, codeBlock(lesson.syntax)),
    sec(5, h('div', { class: 'stack' }, exampleBlocks)),
    sec(6, h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '例の「実行して結果を見る」は実際にSQLを実行した結果です。下のエディタで自由に書き換えて試せます。'), scratch.el)),
    sec(7, md(lesson.explanation)),
    sec(8, h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '簡単な問題から順に並んでいます。各問題の「ヒントを見る」(9)、「模範解答と解説を見る」(10・11)は必要なときだけ開いてください。'), exercises)),
    sec(9, h('p', { class: 'small' }, 'ヒントは各練習問題の下にあり、1つずつ段階的に表示されます。')),
    sec(10, h('p', { class: 'small' }, '模範解答は各練習問題の「模範解答と解説を見る」で確認できます（最初は非表示）。')),
    sec(11, h('p', { class: 'small' }, '詳細な解説は、正解したとき、または模範解答を開いたときに表示されます。「期待される結果を見る」で模範解答の実行結果も確認できます。')),
    sec(12, h('ul', {}, lesson.mistakes.map((m) => h('li', {}, m)))),
    sec(13, lesson.errorChecks.length ? h('ul', {}, lesson.errorChecks.map((m) => h('li', {}, m))) : h('p', { class: 'small muted' }, 'このレッスン固有の項目はありません。エラーが出たら、エディタに表示される説明を確認しましょう。')),
    sec(14, h('ul', {}, lesson.practice.map((m) => h('li', {}, m)))),
    sec(15, h('div', { class: 'stack' }, quiz)),
    sec(16, h('div', { class: 'stack' }, h('p', {}, passCondition(lesson)), completeHost)),
    sec(17, nx ? h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#lesson-' + nx.id }, `第${nx.chapter}章 ${nx.title} へ`), h('a', { class: 'btn', href: '#curriculum' }, 'カリキュラム一覧'))
      : h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#capstone-cap1' }, '総合演習へ'), h('a', { class: 'btn', href: '#lab' }, 'DB移行ラボへ'))));
  checkComplete();

  return h('div', { class: 'page' }, h('div', { class: 'with-rail' }, content,
    h('aside', { class: 'rail' }, createSchemaPanel({ onInsert: (sql) => { scratch.setSql(sql); scratch.focus(); } }))));
}
