// SQLエンジンの窓口。画面側はこの Engine だけを使います。
//  - WorkerEngine : PGlite を Web Worker で実行（通常）。タイムアウト時はWorkerごと停止→自動復旧。
//  - MainEngine   : Worker が使えない環境向けのフォールバック（タイムアウトで強制停止できない）
//  - BridgeEngine : 開発用の自動テスト専用（?engine=bridge）。ローカルの検証用PostgreSQLに接続。
import { buildDatasetSql } from '../db/datasets.js';

export const LIMITS = {
  timeoutMs: 10000,       // 1回の実行の上限時間
  setupTimeoutMs: 60000,  // データセット構築の上限時間
  maxDisplayRows: 500,    // 画面に表示する最大行数
  maxDbBytes: 300 * 1024 * 1024, // 練習DBの上限サイズ（超えたら初期化）
};

const LOCAL_PGLITE = new URL('../../vendor/pglite/dist/index.js', import.meta.url).href;

export class EngineError extends Error {
  constructor(error) { super(error.message); Object.assign(this, error); this.sqlError = error; }
}

export class BaseEngine {
  constructor() {
    this.dataset = null; this.datasetOpts = {}; this.extraSetup = '';
    this.listeners = new Set(); this.info = null; this.busy = false;
  }
  onStatus(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(s) { this.listeners.forEach((fn) => fn(s)); }

  // 生のSQL実行。{ok, results, error, ms}
  async run(sql, opts = {}) { throw new Error('not implemented'); }

  // データセットの初期化（＝練習DBのリセット）
  async reset(dataset = 'base', opts = {}, extraSetup = '') {
    this.dataset = dataset; this.datasetOpts = opts; this.extraSetup = extraSetup || '';
    await this.run('ROLLBACK', { timeoutMs: LIMITS.setupTimeoutMs, internal: true });
    // 学習者が作ったスキーマも含め、ユーザー領域をすべて削除してから作り直す
    const ns = await this.run(`SELECT nspname FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        AND nspname NOT LIKE 'pg\\_temp%' AND nspname NOT LIKE 'pg\\_toast\\_temp%'`, { timeoutMs: LIMITS.setupTimeoutMs, internal: true });
    if (!ns.ok) throw new EngineError(ns.error);
    const drops = ns.results[0].rows.map(([n]) => `DROP SCHEMA "${n.replace(/"/g, '""')}" CASCADE;`).join('\n');
    const w = await this.run(`RESET ALL;\nDISCARD TEMP;\n${drops}\nCREATE SCHEMA public;\nSET search_path TO public;`, { timeoutMs: LIMITS.setupTimeoutMs, internal: true });
    if (!w.ok) throw new EngineError(w.error);
    const r = await this.run(buildDatasetSql(dataset, opts), { timeoutMs: LIMITS.setupTimeoutMs, internal: true });
    if (!r.ok) throw new EngineError(r.error);
    if (extraSetup) {
      const x = await this.run(extraSetup, { timeoutMs: LIMITS.setupTimeoutMs, internal: true });
      if (!x.ok) throw new EngineError(x.error);
    }
    this.emit({ type: 'reset', dataset });
  }

  // 学習者のSQLを実行（安全チェック付き）
  async execUser(sql, opts = {}) {
    const res = await this.run(sql, { timeoutMs: opts.timeoutMs ?? LIMITS.timeoutMs });
    if (res.timedOut) return res;
    const guard = await this.run(
      'SELECT pg_database_size(current_database())::text, (now() <> statement_timestamp())::text',
      { internal: true, timeoutMs: 5000 });
    if (guard.ok) {
      const [size, inTx] = guard.results[0].rows[0];
      res.inTransaction = inTx === 'true';
      res.dbBytes = Number(size);
      if (Number(size) > LIMITS.maxDbBytes) {
        await this.reset(this.dataset || 'base', this.datasetOpts, this.extraSetup);
        res.sizeReset = true;
      }
    } else if (guard.error?.code === '25P02') {
      res.inTransaction = true; res.txAborted = true;
    }
    return res;
  }

  async query(sql) { // 内部用：失敗したら例外
    const r = await this.run(sql, { internal: true, timeoutMs: 20000 });
    if (!r.ok) throw new EngineError(r.error);
    return r.results;
  }

  async restoreAfterCrash() {
    if (this.dataset) await this.reset(this.dataset, this.datasetOpts, this.extraSetup);
  }
}

// ---------------- Worker 版 ----------------
class WorkerEngine extends BaseEngine {
  constructor() { super(); this.seq = 0; this.pending = new Map(); this.kind = 'worker'; }

  spawn() {
    this.worker = new Worker(new URL('./pglite-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const p = this.pending.get(ev.data.id);
      if (p) { this.pending.delete(ev.data.id); clearTimeout(p.timer); p.resolve(ev.data); }
    };
    this.worker.onerror = (ev) => {
      for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: { message: 'SQLエンジン内部エラー: ' + (ev.message || '不明') } }); }
      this.pending.clear();
    };
  }

  call(msg, timeoutMs) {
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = timeoutMs ? setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, timedOut: true, error: { code: 'SML_TIMEOUT', message: `実行時間が上限（${Math.round(timeoutMs / 1000)}秒）を超えたため停止しました` } });
      }, timeoutMs) : null;
      this.pending.set(id, { resolve, timer });
      this.worker.postMessage({ id, ...msg });
    });
  }

  async init() {
    this.spawn();
    const r = await this.call({ type: 'init', localUrl: LOCAL_PGLITE }, 120000);
    if (!r.ok) throw new EngineError(r.error);
    this.info = r.info;
    return r.info;
  }

  async run(sql, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? LIMITS.timeoutMs;
    this.busy = true; this.emit({ type: 'busy', busy: true });
    try {
      const r = await this.call({ type: 'exec', sql }, timeoutMs);
      if (r.timedOut) {
        // Workerごと停止して作り直す（実行中のSQLを確実に止めるため）
        this.worker.terminate();
        this.emit({ type: 'restarting' });
        this.spawn();
        const ir = await this.call({ type: 'init', localUrl: LOCAL_PGLITE }, 120000);
        if (!ir.ok) throw new EngineError(ir.error);
        await this.restoreAfterCrash();
        r.restored = true;
      }
      return r;
    } finally { this.busy = false; this.emit({ type: 'busy', busy: false }); }
  }
}

// ---------------- メインスレッド版（フォールバック） ----------------
class MainEngine extends BaseEngine {
  constructor() { super(); this.kind = 'main'; }
  async init() {
    const { PgliteCore } = await import('./pglite-core.js');
    this.core = new PgliteCore();
    this.info = await this.core.init(LOCAL_PGLITE);
    return this.info;
  }
  async run(sql) {
    this.busy = true; this.emit({ type: 'busy', busy: true });
    try { return await this.core.exec(sql); } finally { this.busy = false; this.emit({ type: 'busy', busy: false }); }
  }
}

// ---------------- 開発テスト用ブリッジ ----------------
class BridgeEngine extends BaseEngine {
  constructor() { super(); this.kind = 'bridge'; this.session = Math.random().toString(36).slice(2, 10); }
  async init() {
    const r = await this.post({ op: 'init' });
    if (!r.ok) throw new EngineError(r.error);
    this.info = { version: r.version, source: 'bridge(test only)' };
    return this.info;
  }
  post(body) {
    return fetch('/__bridge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: this.session, ...body }) }).then((r) => r.json());
  }
  async run(sql, opts = {}) {
    this.busy = true; this.emit({ type: 'busy', busy: true });
    try {
      const t0 = performance.now();
      const r = await this.post({ op: 'exec', sql, timeoutMs: opts.timeoutMs ?? LIMITS.timeoutMs });
      r.ms = performance.now() - t0;
      if (r.timedOut) { await this.restoreAfterCrash(); r.restored = true; }
      return r;
    } finally { this.busy = false; this.emit({ type: 'busy', busy: false }); }
  }
}

export async function createEngine() {
  const params = new URLSearchParams(location.search);
  if (params.get('engine') === 'bridge' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    const e = new BridgeEngine(); await e.init(); return e;
  }
  if (typeof Worker !== 'undefined' && params.get('engine') !== 'main') {
    try { const e = new WorkerEngine(); await e.init(); return e; }
    catch (err) { console.warn('Worker版の起動に失敗。メインスレッド版で再試行します', err); }
  }
  const e = new MainEngine(); await e.init(); return e;
}
