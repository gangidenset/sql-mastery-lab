// 開発・テスト専用：ローカルPostgreSQLに接続する最小のワイヤプロトコルクライアント。
// アプリ本体（ブラウザ）では使用しません。trust 認証のみ対応。
import net from 'node:net';

export class PgWire {
  constructor({ host = '127.0.0.1', port = 54329, user = 'postgres', database = 'postgres' } = {}) {
    Object.assign(this, { host, port, user, database });
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.queue = Promise.resolve();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.connect(this.port, this.host);
      this.sock.on('error', reject);
      this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._pump(); });
      this.sock.on('connect', () => {
        const params = Buffer.from(`user\0${this.user}\0database\0${this.database}\0client_encoding\0UTF8\0\0`);
        const len = Buffer.alloc(8);
        len.writeInt32BE(8 + params.length, 0);
        len.writeInt32BE(196608, 4);
        this.sock.write(Buffer.concat([len, params]));
        this._collect().then((r) => (r.error ? reject(new Error(r.error.message)) : resolve(this)), reject);
      });
    });
  }

  _pump() {
    while (this.buf.length >= 5) {
      const type = String.fromCharCode(this.buf[0]);
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < 1 + len) return;
      const body = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      this.waiters[0]?.(type, body);
    }
  }

  // ReadyForQuery まで結果を集める
  _collect() {
    return new Promise((resolve) => {
      const results = [];
      let cur = null;
      let error = null;
      const notices = [];
      this.waiters.push((type, body) => {
        if (type === 'T') {
          const n = body.readInt16BE(0); let p = 2; const fields = [];
          for (let i = 0; i < n; i++) {
            const end = body.indexOf(0, p); const name = body.toString('utf8', p, end); p = end + 1;
            const typeId = body.readInt32BE(p + 6); p += 18;
            fields.push({ name, dataTypeID: typeId });
          }
          cur = { fields, rows: [] };
        } else if (type === 'D') {
          const n = body.readInt16BE(0); let p = 2; const row = [];
          for (let i = 0; i < n; i++) {
            const l = body.readInt32BE(p); p += 4;
            if (l === -1) row.push(null); else { row.push(body.toString('utf8', p, p + l)); p += l; }
          }
          cur.rows.push(row);
        } else if (type === 'C') {
          const tag = body.toString('utf8', 0, body.length - 1);
          const m = tag.match(/ (\d+)$/);
          const r = cur || { fields: [], rows: [] };
          r.command = tag.split(' ')[0];
          r.affectedRows = m && !cur ? Number(m[1]) : 0;
          results.push(r); cur = null;
        } else if (type === 'E' || type === 'N') {
          const f = {}; let p = 0;
          while (body[p] !== 0) { const code = String.fromCharCode(body[p]); const end = body.indexOf(0, p + 1); f[code] = body.toString('utf8', p + 1, end); p = end + 1; }
          const e = { message: f.M, code: f.C, severity: f.S, detail: f.D, hint: f.H, position: f.P ? Number(f.P) : undefined };
          if (type === 'E') error = e; else notices.push(e);
        } else if (type === 'Z') {
          this.waiters.shift();
          resolve({ results, error, notices, txStatus: String.fromCharCode(body[0]) });
        }
      });
    });
  }

  query(sql) {
    const run = () => {
      const q = Buffer.from(sql + '\0', 'utf8');
      const head = Buffer.alloc(5); head.write('Q', 0); head.writeInt32BE(4 + q.length, 1);
      const p = this._collect();
      this.sock.write(Buffer.concat([head, q]));
      return p;
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => {});
    return p;
  }

  async exec(sql) {
    const r = await this.query(sql);
    if (r.error) { const e = new Error(r.error.message); Object.assign(e, r.error); throw e; }
    return r.results;
  }

  close() { try { this.sock.end(); } catch {} }
}
