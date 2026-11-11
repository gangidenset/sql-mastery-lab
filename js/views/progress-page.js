import { h, exportText, confirmBox, toast, fmtDate } from '../ui/dom.js';
import * as store from '../store.js';
import * as S from '../ui/session.js';
import { LIMITS } from '../engine/engine.js';

export const ENGINE_LIMITS = [
  'SQLエンジンは PGlite（WebAssembly版のPostgreSQL）です。ブラウザの中だけで動き、外部のDB・会社のDB・本番DBには接続しません。',
  '接続（セッション）は1つだけです。複数接続での同時更新・ロック待ち・分離レベルの違いは体験できません（第19・20章では説明のみ）。',
  'BEGIN / COMMIT / ROLLBACK / SAVEPOINT、EXPLAIN / EXPLAIN ANALYZE、CTE、ウィンドウ関数、ON CONFLICT、PL/pgSQL の DO ブロックは実際に動作します。',
  'ユーザー・権限（GRANT / REVOKE）、拡張機能の追加、外部ファイルの読み書き（COPY ... FROM ファイル）、レプリケーション、DBLINK などは対象外です。',
  `1回の実行は${LIMITS.timeoutMs / 1000}秒で停止し、SQLエンジンを作り直して練習DBを復元します。DBサイズが${LIMITS.maxDbBytes / 1024 / 1024}MBを超えた場合も初期化します。結果は最大${LIMITS.maxDisplayRows}行まで表示します。`,
  '練習DBはページを再読み込みすると初期状態に戻ります（学習の進捗・履歴・成果物は保存されます）。',
  '実行時間はブラウザ内の小さなDBでの値なので、本番の性能の目安にはなりません。比較（改善前後）に使ってください。',
];

export function renderProgress() {
  const st = store.get();
  const info = S.getEngine()?.info;
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', id: 'import-file', class: 'sr' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const text = await f.text();
      if (!(await confirmBox('進捗を読み込む', '現在の進捗を、選んだファイルの内容で置き換えます。よろしいですか？', '読み込む'))) return;
      store.importJson(text); toast('進捗を読み込みました'); location.hash = 'dashboard';
    } catch (e) { toast('読み込めませんでした: ' + e.message); }
  });
  const fontSel = h('select', { class: 'input', id: 'font-size', style: { width: 'auto' }, onchange: () => { st.settings.fontSize = Number(fontSel.value); store.save(); document.documentElement.style.setProperty('--fs', fontSel.value + 'px'); } },
    [13, 14, 15, 16, 17].map((n) => h('option', { value: n, selected: n === (st.settings.fontSize || 14) }, `${n}px`)));
  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, '進捗とデータ'), h('h1', {}, '学習データの管理')),
    h('section', { class: 'panel stack' }, h('h2', {}, '保存場所'),
      h('p', {}, '学習進捗・演習の正誤・実行したSQLの履歴・成果物・試験結果は、このブラウザの localStorage（キー名 ', h('code', {}, 'sml.progress.v1'), '）に保存されます。サーバーには送信されません。'),
      h('p', { class: 'small muted' }, '別のブラウザや端末とは共有されません。シークレットウィンドウや、サイトデータの削除で消えることがあります。定期的に「進捗を書き出す」でバックアップしてください。'),
      store.isStorageOk() ? null : h('div', { class: 'callout bad' }, 'このブラウザでは保存できない状態です（プライベートモードなど）。ページを閉じると進捗は失われます。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => exportText(`sql-mastery-lab-progress-${store.today()}.json`, store.exportJson(), 'application/json') }, '進捗を書き出す（JSON）'),
        h('label', { class: 'btn', for: 'import-file' }, '進捗を読み込む'), fileIn,
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirmBox('すべての進捗を消去', 'レッスンの完了状況、演習の正誤、履歴、成果物、試験結果をすべて消去します。元に戻せません。先に書き出しておくことをおすすめします。', 'すべて消去する', true))) return;
          store.resetAll(); toast('進捗を消去しました'); location.hash = 'dashboard';
        } }, '進捗をすべて消去'))),
    h('section', { class: 'panel stack' }, h('h2', {}, '表示'), h('div', { class: 'row' }, h('label', { for: 'font-size' }, '文字の大きさ'), fontSel)),
    h('section', { class: 'panel stack' }, h('h2', {}, 'SQLエンジンと制約'),
      h('p', { class: 'small' }, info ? `${info.version}（読み込み元: ${info.source}）` : '未起動'),
      h('ul', {}, ENGINE_LIMITS.map((x) => h('li', {}, x)))),
    h('section', { class: 'panel stack' }, h('h2', {}, 'このサイトについて'),
      h('p', {}, 'SQL MASTERY LAB は、個人が作成した無料の学習用教材です。練習用のデータ（顧客・注文など）はすべて架空のものです。'),
      h('p', { class: 'small' }, 'ソースコードと教材は MIT ライセンスで公開しています。不具合や教材の誤りは ', h('a', { href: 'https://github.com/gangidenset/sql-mastery-lab/issues', target: '_blank', rel: 'noopener' }, 'GitHub の Issues'), ' へお知らせください。'),
      h('p', { class: 'small muted' }, '実際の業務では、各DB製品の公式ドキュメントと所属組織のルールを確認してください。')),
    h('section', { class: 'panel stack' }, h('h2', {}, `実行履歴（最新50件／保存は最大400件）`),
      st.history.length ? h('div', { class: 'grid-scroll' }, h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, '日時'), h('th', {}, '場所'), h('th', {}, '結果'), h('th', {}, '時間'), h('th', {}, 'SQL'))),
        h('tbody', {}, st.history.slice(-50).reverse().map((x) => h('tr', {}, h('td', {}, fmtDate(x.at)), h('td', {}, x.ctx), h('td', {}, x.ok ? '成功' : 'エラー'), h('td', { class: 'n' }, `${x.ms ?? ''}ms`),
          h('td', { style: { whiteSpace: 'pre-wrap', maxWidth: '40em' } }, x.sql.slice(0, 300)))))))
        : h('p', { class: 'muted' }, 'まだ履歴はありません。')));
}
