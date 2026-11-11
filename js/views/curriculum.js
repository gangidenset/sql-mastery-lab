import { h, stars } from '../ui/dom.js';
import * as P from '../progress.js';
import * as store from '../store.js';
import { LEVELS, lessonsOfLevel, getLesson, CAPSTONES } from '../content/index.js';

export function passCondition(lesson) {
  return `演習${lesson.exercises.length}問すべてに正解し、理解度確認テスト（${lesson.quiz.length}問）で8割以上正解する`;
}

export function renderCurriculum() {
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, 'カリキュラム'), h('h1', {}, '基礎から実務のDB移行まで'),
      h('p', { class: 'muted' }, '全25章＋総合演習5課題。前提レッスンが未完了の章には案内が表示されます。順番どおりでなくても学習できます。')),
    LEVELS.map((lv) => h('section', { class: 'stack' },
      h('h2', {}, lv.title),
      lv.level < 5
        ? h('div', { class: 'grid-cards' }, lessonsOfLevel(lv.level).map(card))
        : h('div', { class: 'grid-cards' }, CAPSTONES.map((c) => {
          const cs = store.get().capstones[c.id];
          return h('a', { class: 'lesson-card', href: '#capstone-' + c.id },
            h('span', { class: 'eyebrow' }, `課題${c.no}`), h('h3', {}, c.title),
            h('p', { class: 'small muted' }, c.story.slice(0, 80) + '…'),
            h('div', { class: 'row' }, h('span', { class: 'chip ' + (cs?.completedAt ? 'ok' : '') }, cs?.completedAt ? '合格' : '未完了')));
        }).concat([h('a', { class: 'lesson-card', href: '#exam' }, h('span', { class: 'eyebrow' }, '修了判定'), h('h3', {}, '総合試験'),
          h('p', { class: 'small muted' }, '試験用の異常データを含む環境で、調査から移行・検証・修正・手順書作成まで行います。'))])))));
}

function card(l) {
  const p = P.lessonProgress(l);
  const miss = P.missingPrereqs(l);
  return h('a', { class: 'lesson-card', href: '#lesson-' + l.id },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'eyebrow' }, `第${l.chapter}章`),
      h('span', { class: 'chip ' + (p.status === 'done' ? 'ok' : p.status === 'in_progress' ? 'new' : '') }, P.STATUS_LABEL[p.status])),
    h('h3', {}, l.title),
    h('dl', {},
      h('dt', {}, '学習目的'), h('dd', {}, l.goal),
      h('dt', {}, '学習内容'), h('dd', {}, l.summary),
      h('dt', {}, '難易度'), h('dd', {}, stars(l.difficulty)),
      h('dt', {}, '想定時間'), h('dd', {}, `${l.minutes}分`),
      h('dt', {}, '前提'), h('dd', {}, l.prereq.length ? l.prereq.map((id) => `第${getLesson(id).chapter}章`).join('・') : 'なし'),
      h('dt', {}, '完了条件'), h('dd', {}, passCondition(l)),
      h('dt', {}, '状況'), h('dd', { class: 'num' }, `演習 ${p.exDone}/${p.exTotal}・テスト ${p.qDone}/${p.qTotal}`)),
    miss.length ? h('p', { class: 'small', style: { color: 'var(--warn)' } }, `未完了の前提: ${miss.map((m) => '第' + m.chapter + '章').join('、')}`) : null);
}
