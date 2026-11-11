// PGlite（WebAssembly版PostgreSQL）を読み込んで操作する共通処理。
// Web Worker 内（通常）と メインスレッド（フォールバック）の両方から使います。
// 外部DBには一切接続しません。CDNからはエンジン本体（JS/WASM）を取得するだけです。

const CDN_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5/dist/index.js',
  'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.4/dist/index.js',
];

// すべての値を PostgreSQL のテキスト表現のまま受け取る（表示・採点を一貫させるため）
const TEXT_OIDS = [16, 17, 20, 21, 23, 26, 114, 700, 701, 1082, 1083, 1114, 1184, 1186, 1266, 1700, 3802];
const identity = (v) => v;

export class PgliteCore {
  constructor() { this.db = null; this.version = null; this.source = null; }

  async init(localUrl) {
    const candidates = localUrl ? [localUrl, ...CDN_CANDIDATES] : CDN_CANDIDATES;
    let lastErr;
    for (const url of candidates) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        const parsers = {};
        TEXT_OIDS.forEach((o) => (parsers[o] = identity));
        this.db = await mod.PGlite.create({ parsers });
        const v = await this.db.query('select version() as v', [], { rowMode: 'array' });
        this.version = String(v.rows[0][0]);
        this.source = url;
        await this.db.exec("SET TimeZone = 'UTC'");
        return { version: this.version, source: url };
      } catch (e) { lastErr = e; }
    }
    throw new Error('SQLエンジン（PGlite）を読み込めませんでした: ' + (lastErr?.message || lastErr));
  }

  async exec(sql) {
    const t0 = performance.now();
    try {
      const res = await this.db.exec(sql, { rowMode: 'array' });
      return {
        ok: true,
        ms: performance.now() - t0,
        results: res.map((r) => ({
          fields: (r.fields || []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
          rows: (r.rows || []).map((row) => row.map((v) => (v === null || v === undefined ? null : String(v)))),
          affectedRows: r.affectedRows ?? 0,
        })),
      };
    } catch (e) {
      return { ok: false, ms: performance.now() - t0, error: serializeError(e) };
    }
  }
}

export function serializeError(e) {
  return {
    message: e?.message || String(e),
    code: e?.code, detail: e?.detail, hint: e?.hint,
    position: e?.position ? Number(e.position) : undefined,
    severity: e?.severity,
  };
}
