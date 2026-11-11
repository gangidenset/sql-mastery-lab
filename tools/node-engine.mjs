// テスト用：ローカルの検証用PostgreSQLを、アプリと同じ Engine インターフェースで使う
import { PgWire } from './pgwire.mjs';
import { BaseEngine } from '../js/engine/engine.js';

export const PG = { host: process.env.SML_PG_HOST || '127.0.0.1', port: Number(process.env.SML_PG_PORT || 54329) };

export async function createDatabase(name) {
  const admin = await new PgWire({ ...PG }).connect();
  await admin.exec(`DROP DATABASE IF EXISTS ${name}`);
  await admin.exec(`CREATE DATABASE ${name}`);
  admin.close();
}

export class NodeEngine extends BaseEngine {
  constructor(database) { super(); this.database = database; this.kind = 'node-test'; }
  async init() {
    this.conn = await new PgWire({ ...PG, database: this.database }).connect();
    await this.conn.exec("SET TimeZone = 'UTC'");
    const v = await this.conn.exec('select version()');
    this.info = { version: v[0].rows[0][0], source: 'local postgres (test)' };
    return this.info;
  }
  async run(sql, opts = {}) {
    const t0 = performance.now();
    const timeoutMs = opts.timeoutMs ?? 10000;
    // セッション全体の statement_timeout を変えないよう、SET LOCAL ではなく一時的に設定して戻す
    await this.conn.query(`SET statement_timeout = ${Math.round(timeoutMs)}`);
    const r = await this.conn.query(sql);
    await this.conn.query('SET statement_timeout = 0');
    const ms = performance.now() - t0;
    if (r.error) {
      const timedOut = r.error.code === '57014';
      if (timedOut) { await this.restoreAfterCrash(); }
      return { ok: false, ms, error: timedOut ? { code: 'SML_TIMEOUT', message: '実行時間が上限を超えたため停止しました' } : r.error, timedOut };
    }
    return { ok: true, ms, results: r.results.map((x) => ({ fields: x.fields, rows: x.rows, affectedRows: x.affectedRows })) };
  }
  close() { this.conn.close(); }
}
