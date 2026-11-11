// オフライン用：PGlite本体を npm から取得して vendor/pglite/ に置きます（インターネット接続が1回だけ必要）。
//   node tools/vendor-pglite.mjs
// 置いた後は、アプリは CDN ではなく vendor/pglite/dist/index.js を優先して読み込みます。
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'vendor', 'pglite');
const version = process.argv[2] || '0.5';
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
console.log(`@electric-sql/pglite@${version} を取得しています…`);
const file = execSync(`npm pack @electric-sql/pglite@${version} --silent`, { cwd: dest, encoding: 'utf8' }).trim().split('\n').pop();
execSync(`tar -xzf "${file}" --strip-components=1`, { cwd: dest });
rmSync(join(dest, file));
console.log('完了: ' + readdirSync(join(dest, 'dist')).filter((f) => /index\.js|\.wasm|\.data/.test(f)).join(', '));
