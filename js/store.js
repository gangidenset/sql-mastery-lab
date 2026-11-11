// 学習進捗の保存（ブラウザの localStorage）。
// 保存先キー: "sml.progress.v1"。ブラウザ・端末ごとに別々に保存されます。
const KEY = 'sml.progress.v1';
const MAX_HISTORY = 400;

function blank() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lessons: {},       // lessonId -> { status, exercises: {exId: {...}}, quiz: {...}, visitedAt, completedAt }
    scenarios: {},     // scenarioId -> { steps: {stepId: {...}}, completedAt }
    capstones: {},     // capstoneId -> { steps, texts, selfCheck, completedAt }
    exam: { attempts: [], answers: {}, texts: {} },
    deliverables: {},  // templateId -> { fields, rows }
    history: [],       // { at, ctx, sql, ok, ms, rows }
    studyDays: [],     // 'YYYY-MM-DD'
    last: null,        // { view, id }
    settings: { fontSize: 14 },
  };
}

let state = blank();
let storageOk = true;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(blank(), JSON.parse(raw));
  } catch (e) { storageOk = false; console.warn('進捗を読み込めませんでした', e); }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
  catch (e) { storageOk = false; console.warn('進捗を保存できませんでした', e); }
  listeners.forEach((fn) => fn(state));
}

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const get = () => state;
export const isStorageOk = () => storageOk;

export function today() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function touchStudyDay() {
  const t = today();
  if (!state.studyDays.includes(t)) { state.studyDays.push(t); state.studyDays = state.studyDays.slice(-400); }
}

export function streak() {
  const days = new Set(state.studyDays);
  let n = 0; const d = new Date();
  if (!days.has(today())) d.setDate(d.getDate() - 1); // 今日まだ学習していなくても昨日まで続いていれば継続
  for (;;) {
    const p = (x) => String(x).padStart(2, '0');
    const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    if (!days.has(k)) break; n++; d.setDate(d.getDate() - 1);
  }
  return n;
}

export function lessonState(id) {
  return (state.lessons[id] ||= { status: 'new', exercises: {}, quiz: {} });
}

export function recordExercise(lessonId, exId, { correct, sql }) {
  const ls = lessonState(lessonId);
  const e = (ls.exercises[exId] ||= { attempts: 0, correct: false, wrong: 0 });
  e.attempts++; e.lastSql = sql; e.lastAt = new Date().toISOString();
  if (correct) { e.correct = true; e.correctAt ||= e.lastAt; } else e.wrong++;
  if (ls.status === 'new') ls.status = 'in_progress';
  touchStudyDay(); save();
}

export function recordQuiz(lessonId, qIdx, correct) {
  const ls = lessonState(lessonId);
  ls.quiz[qIdx] = { correct, at: new Date().toISOString() };
  if (ls.status === 'new') ls.status = 'in_progress';
  touchStudyDay(); save();
}

export function setLessonStatus(lessonId, status) {
  const ls = lessonState(lessonId);
  ls.status = status;
  if (status === 'done') ls.completedAt ||= new Date().toISOString();
  touchStudyDay(); save();
}

export function addHistory(entry) {
  state.history.push({ at: new Date().toISOString(), ...entry });
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);
  touchStudyDay(); save();
}

export function setLast(view, id) { state.last = { view, id, at: new Date().toISOString() }; save(); }

export function scenarioState(id) { return (state.scenarios[id] ||= { steps: {} }); }
export function capstoneState(id) { return (state.capstones[id] ||= { steps: {}, texts: {}, selfCheck: {} }); }
export function deliverableState(id) { return (state.deliverables[id] ||= { fields: {}, rows: null }); }

export function exportJson() { return JSON.stringify(state, null, 2); }
export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || typeof data.lessons !== 'object') throw new Error('SQL MASTERY LAB の進捗ファイルではありません');
  state = Object.assign(blank(), data); save();
}
export function resetAll() { state = blank(); save(); }
