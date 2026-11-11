// 練習DBのセッション管理：1つのエンジンを画面全体で共有し、「今どのデータセット状態か」を管理する
import { createEngine } from '../engine/engine.js';
import { DATASETS } from '../db/datasets.js';
import { grade as gradeRaw } from '../grader.js';

let engine = null;
let currentKey = null;
let currentLabel = '';
let chain = Promise.resolve();
const listeners = new Set();

export const onSession = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (e) => listeners.forEach((fn) => fn(e));

export async function boot() {
  engine = await createEngine();
  engine.onStatus((s) => emit(s));
  await lock(() => engine.reset('base'));
  currentKey = keyOf({ dataset: 'base' }); currentLabel = DATASETS.base.label;
  emit({ type: 'context', label: currentLabel });
  return engine.info;
}
export const getEngine = () => engine;
export const contextLabel = () => currentLabel;

// 同時実行を防ぐ（スキーマ表示の更新とSQL実行が重ならないように）
export function lock(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

export function keyOf(ctx) { return JSON.stringify([ctx.dataset || 'base', ctx.bulkRows || null, ctx.setup || '']); }

// ctx = { dataset, setup, bulkRows, label }
export async function ensure(ctx, { force = false } = {}) {
  if (ctx.keep && !force) return false; // 「今の練習DBのまま」使う（移行ラボのツール）
  const k = keyOf(ctx);
  if (!force && k === currentKey) return false;
  await engine.reset(ctx.dataset || 'base', { bulkRows: ctx.bulkRows }, ctx.setup || '');
  currentKey = k;
  currentLabel = ctx.label || DATASETS[ctx.dataset || 'base'].label;
  emit({ type: 'context', label: currentLabel, reset: true });
  return true;
}

export function run(ctx, sql) {
  return lock(async () => {
    const prepared = await ensure(ctx);
    const res = await engine.execUser(sql);
    if (res.restored || res.sizeReset) currentKey = keyOf(ctx);
    emit({ type: 'changed' });
    return { ...res, prepared };
  });
}

export function resetTo(ctx) {
  return lock(async () => { await ensure(ctx, { force: true }); emit({ type: 'changed' }); });
}

export function query(sql) { return lock(() => engine.query(sql)); }
export function rawRun(sql) { return lock(() => engine.run(sql, { internal: true })); }

// 採点：終了後のDBは「学習者のSQLを実行した後の状態」
export function grade(spec, userSql) {
  return lock(async () => {
    const report = await gradeRaw(engine, spec, userSql);
    currentKey = keyOf({ dataset: spec.dataset, setup: spec.setup, bulkRows: spec.bulkRows });
    currentLabel = spec.label || DATASETS[spec.dataset || 'base'].label;
    emit({ type: 'context', label: currentLabel }); emit({ type: 'changed' });
    return report;
  });
}

// 期待される結果を見る（模範解答を練習DBの写しで実行するのではなく、同じDBで実行した後に元へ戻す）
export function runAnswerPreview(spec) {
  return lock(async () => {
    await engine.reset(spec.dataset || 'base', { bulkRows: spec.bulkRows }, spec.setup || '');
    const r = await engine.execUser(spec.answer);
    if (r.inTransaction) await engine.run('ROLLBACK', { internal: true });
    await engine.reset(spec.dataset || 'base', { bulkRows: spec.bulkRows }, spec.setup || '');
    currentKey = keyOf(spec);
    emit({ type: 'changed' });
    return r;
  });
}

// 画面を開いたときに、その画面用の練習DBを準備する
export function prepare(ctx) {
  return lock(async () => { const r = await ensure(ctx); if (r) emit({ type: 'changed' }); return r; });
}
