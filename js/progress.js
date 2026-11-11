// 進捗の集計（ダッシュボード・カリキュラム・左ナビで使用）
import * as store from './store.js';
import { LESSONS, AREAS, CAPSTONES, getLesson } from './content/index.js';
import { SCENARIOS } from './content/scenarios.js';

export function lessonProgress(lesson) {
  const ls = store.get().lessons[lesson.id] || { exercises: {}, quiz: {} };
  const exTotal = lesson.exercises.length;
  const exDone = lesson.exercises.filter((e) => ls.exercises?.[e.id]?.correct).length;
  const qTotal = lesson.quiz.length;
  const qDone = lesson.quiz.filter((_, i) => ls.quiz?.[i]?.correct).length;
  const quizRate = qTotal ? qDone / qTotal : 1;
  const passed = exDone === exTotal && quizRate >= 0.8;
  const touched = exDone > 0 || Object.keys(ls.quiz || {}).length > 0 || Object.keys(ls.exercises || {}).length > 0 || !!ls.visitedAt;
  const status = passed ? 'done' : (touched ? 'in_progress' : 'new');
  return { exTotal, exDone, qTotal, qDone, quizRate, passed, status, visited: !!ls.visitedAt };
}

export const STATUS_LABEL = { new: '未着手', in_progress: '学習中', done: '完了' };

export function overall() {
  const per = LESSONS.map((l) => ({ l, p: lessonProgress(l) }));
  const done = per.filter((x) => x.p.passed).length;
  const exTotal = per.reduce((a, x) => a + x.p.exTotal, 0);
  const exDone = per.reduce((a, x) => a + x.p.exDone, 0);
  const scDone = SCENARIOS.filter((s) => s.steps.every((st) => store.get().scenarios[s.id]?.steps?.[st.id]?.correct)).length;
  const capDone = CAPSTONES.filter((c) => store.get().capstones[c.id]?.completedAt).length;
  return { per, done, total: LESSONS.length, exTotal, exDone, pct: Math.round((exDone / exTotal) * 100), scDone, capDone };
}

export function prereqsMet(lesson) {
  return (lesson.prereq || []).every((id) => lessonProgress(getLesson(id)).passed);
}
export function missingPrereqs(lesson) {
  return (lesson.prereq || []).map(getLesson).filter((l) => !lessonProgress(l).passed);
}

export function recommended() {
  const per = LESSONS.map((l) => ({ l, p: lessonProgress(l) }));
  const inProg = per.find((x) => x.p.status === 'in_progress' && !x.p.passed);
  if (inProg) return inProg.l;
  return per.find((x) => !x.p.passed && prereqsMet(x.l))?.l || per.find((x) => !x.p.passed)?.l || null;
}

export function currentLevel() {
  const rec = recommended();
  return rec ? rec.level : 5;
}

// 分野別の理解度：その分野の演習の正解率と、不正解の多さ
export function areaStats() {
  const st = store.get();
  return Object.entries(AREAS).map(([name, ids]) => {
    let total = 0, correct = 0, wrong = 0, attempted = 0;
    for (const id of ids) {
      const l = getLesson(id);
      for (const e of l.exercises) {
        total++;
        const r = st.lessons[id]?.exercises?.[e.id];
        if (r) { attempted++; if (r.correct) correct++; wrong += r.wrong || 0; }
      }
    }
    return { name, total, correct, wrong, attempted, rate: total ? correct / total : 0 };
  });
}

export function weakAreas() {
  return areaStats().filter((a) => a.attempted > 0).map((a) => ({ ...a, score: a.wrong / Math.max(1, a.attempted) - a.rate }))
    .filter((a) => a.wrong > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}
