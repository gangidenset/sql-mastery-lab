import { h, fmtDate } from '../ui/dom.js';
import * as store from '../store.js';
import * as P from '../progress.js';
import { LEVELS, CAPSTONES, getLesson } from '../content/index.js';

export function renderDashboard() {
  const st = store.get();
  const o = P.overall();
  const rec = P.recommended();
  const lv = P.currentLevel();
  const last = st.last;
  const examBest = st.exam.attempts.reduce((b, a) => (!b || a.score > b.score ? a : b), null);
  const recent = st.history.slice(-6).reverse();

  const resume = last && last.view && last.view !== 'dashboard'
    ? h('a', { class: 'btn primary', href: '#' + last.id }, '前回の続きから再開')
    : (rec ? h('a', { class: 'btn primary', href: '#lesson-' + rec.id }, '学習をはじめる') : null);

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('span', { class: 'eyebrow' }, 'ダッシュボード'),
      h('h1', {}, '今日の学習'),
      h('p', { class: 'muted' }, '練習DBはこのブラウザの中だけで動くPostgreSQLです。登録不要で、入力したSQLや学習の記録はこの端末のブラウザにだけ保存されます。'),
      st.history.length === 0 ? h('div', { class: 'callout' }, h('b', {}, 'はじめての方へ: '), '第1章から順に進めるのがおすすめです。SQLを書いたら「▶ 実行」で結果を確認し、「✓ 判定」で答え合わせをします。練習DBは何度壊しても「DBを初期化」で元に戻せます。') : null),
    h('div', { class: 'stats' },
      stat(LEVELS[lv]?.title.split('：')[0] || 'LEVEL 5', '現在の学習レベル'),
      stat(`${o.done} / ${o.total}`, '完了したレッスン'),
      stat(`${o.pct}%`, '演習の進捗（正解した演習の割合）'),
      stat(`${store.streak()}日`, '連続学習日数'),
      stat(examBest ? `${examBest.score}点` : '未受験', '総合試験（最高点）')),
    h('div', { class: 'with-rail' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel stack' },
          h('h2', {}, '次に学習するおすすめ'),
          rec ? h('div', { class: 'stack', style: { gap: '6px' } },
            h('span', { class: 'eyebrow' }, `${LEVELS[rec.level].title} ・ 第${rec.chapter}章`),
            h('h3', {}, rec.title), h('p', { class: 'muted' }, rec.goal),
            P.missingPrereqs(rec).length ? h('p', { class: 'small callout warn' }, '前提レッスンが未完了です: ', P.missingPrereqs(rec).map((l, i) => [i ? '、' : '', h('a', { href: '#lesson-' + l.id }, l.title)])) : null,
            h('div', { class: 'row' }, resume, h('a', { class: 'btn', href: '#lesson-' + rec.id }, 'このレッスンを開く')))
            : h('p', {}, 'すべてのレッスンを完了しました。総合演習と総合試験に挑戦しましょう。', h('a', { href: '#exam' }, '総合試験へ'))),
        h('section', { class: 'panel stack' },
          h('h2', {}, '分野ごとの理解度'),
          h('div', { class: 'stack', style: { gap: '6px' } }, P.areaStats().map((a) => h('div', { class: 'area-row' },
            h('span', {}, a.name), h('div', { class: 'bar', title: `${a.correct}/${a.total}` }, h('i', { style: { width: Math.round(a.rate * 100) + '%' } })),
            h('span', { class: 'num small muted' }, `${Math.round(a.rate * 100)}%`)))),
          (() => { const w = P.weakAreas(); return w.length
            ? h('div', { class: 'callout warn' }, h('b', {}, '苦手分野: '), w.map((a, i) => [i ? '、' : '', `${a.name}（不正解 ${a.wrong}回）`]), '。関連レッスンの演習をもう一度解いてみましょう。')
            : h('p', { class: 'small muted' }, '苦手分野は、不正解の多い分野から自動で表示されます。'); })()),
        h('section', { class: 'panel stack' },
          h('h2', {}, '総合演習・試験'),
          h('div', { class: 'stack', style: { gap: '4px' } },
            CAPSTONES.map((c) => { const cs = st.capstones[c.id]; return h('div', { class: 'row' },
              h('a', { href: '#capstone-' + c.id }, `課題${c.no}：${c.title}`),
              cs?.completedAt ? h('span', { class: 'chip ok' }, `合格 ${cs.score ?? ''}点`) : cs?.score != null ? h('span', { class: 'chip warn' }, `${cs.score}点`) : h('span', { class: 'chip' }, '未提出')); }),
            h('div', { class: 'row' }, h('a', { href: '#exam' }, '総合試験'),
              examBest ? h('span', { class: 'chip ' + (examBest.passed ? 'ok' : 'warn') }, `${examBest.passed ? '合格' : '不合格'} ${examBest.score}点（${fmtDate(examBest.at)}）`) : h('span', { class: 'chip' }, '未受験'))))),
      h('aside', { class: 'rail' },
        h('section', { class: 'panel stack' },
          h('h3', {}, '直近の学習'),
          recent.length ? h('ul', { class: 'checks' }, recent.map((x) => h('li', {}, h('span', {}, x.ok ? '✓' : '✗'),
            h('span', { class: 'small' }, h('b', {}, labelOfCtx(x.ctx)), ' ', h('span', { class: 'muted' }, fmtDate(x.at)), h('br'), h('code', {}, x.sql.replace(/\s+/g, ' ').slice(0, 60))))))
            : h('p', { class: 'small muted' }, 'まだ実行履歴はありません。')),
        h('section', { class: 'panel stack' },
          h('h3', {}, 'DB移行ラボ'),
          h('p', { class: 'small' }, `シナリオ A〜J：${o.scDone} / 10 完了`),
          h('a', { class: 'btn', href: '#lab' }, 'ラボを開く')))));
}

function stat(v, label) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, label)); }
function labelOfCtx(ctx) {
  if (!ctx) return '';
  const [a, b] = ctx.split('.');
  const l = getLesson(a);
  if (l) return `第${l.chapter}章 ${b || ''}`;
  if (a.startsWith('scenario')) return `シナリオ${a.slice(8)} ${b || ''}`;
  if (a === 'free') return '自由エディタ';
  return ctx;
}
