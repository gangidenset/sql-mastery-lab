// ローカル起動用の簡易Webサーバー（Node.js 18以上。追加インストール不要）
//   node tools/server.mjs            → http://localhost:8080
//   PORT=3000 node tools/server.mjs  → ポート変更
// 開発者向け: --bridge を付けると自動テスト用のブリッジ（/__bridge）を有効にします（通常の学習では不要）。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const bridge = process.argv.includes('--bridge');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

let sessions = null;
async function handleBridge(req, res) {
  const { NodeEngine, createDatabase } = await import('./node-engine.mjs');
  sessions ||= new Map();
  let body = ''; for await (const c of req) body += c;
  const msg = JSON.parse(body);
  const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (msg.op === 'init') {
      const db = 'sml_b_' + msg.session.replace(/\W/g, '');
      await createDatabase(db);
      const e = new NodeEngine(db); await e.init(); sessions.set(msg.session, e);
      return send({ ok: true, version: e.info.version });
    }
    const e = sessions.get(msg.session);
    if (!e) return send({ ok: false, error: { message: 'bridge session not found' } });
    return send(await e.run(msg.sql, { timeoutMs: msg.timeoutMs }));
  } catch (err) { return send({ ok: false, error: { message: String(err.message || err) } }); }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__bridge' && req.method === 'POST') {
      if (!bridge) { res.writeHead(404); return res.end(); }
      return handleBridge(req, res);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) { res.writeHead(400); return res.end('bad path'); }
    let file = join(root, p || 'index.html');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`SQL MASTERY LAB: http://localhost:${port}/ をブラウザで開いてください（終了は Ctrl+C）`);
  if (bridge) console.log('（開発用ブリッジ有効）');
});
