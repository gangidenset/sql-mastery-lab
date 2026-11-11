// アプリの起動とルーティング（#ハッシュで画面を切り替え）
import { h, clear, fill } from './ui/dom.js';
import * as store from './store.js';
import * as S from './ui/session.js';
import * as P from './progress.js';
import { LEVELS, lessonsOfLevel, CAPSTONES } from './content/index.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCurriculum } from './views/curriculum.js';
import { renderLesson } from './views/lesson.js';
import { renderSchema } from './views/schema.js';
import { renderLab } from './views/lab.js';
import { renderDeliverables } from './views/deliverables.js';
import { renderCapstone, renderExam } from './views/capstone.js';
import { renderProgress } from './views/progress-page.js';

const mainEl = document.getElementById('main');
const navEl = document.getElementById('sidenav');
const pill = document.getElementById('engine-pill');
let ready = false;

function route() {
  const hash = location.hash.replace(/^#/, '') || 'dashboard';
  const [view, ...rest] = hash.split('-');
  const arg = rest.join('-');
  return { hash, view, arg };
}

function render() {
  const { hash, view, arg } = route();
  renderNav(hash);
  navEl.dataset.open = '0';
  if (!ready) return;
  let page;
  try {
    switch (view) {
      case 'dashboard': page = renderDashboard(); break;
      case 'curriculum': page = renderCurriculum(); break;
      case 'lesson': page = renderLesson(arg); break;
      case 'schema': page = renderSchema(); break;
      case 'lab': page = renderLab(arg); break;
      case 'deliverables': page = renderDeliverables(); break;
      case 'deliv': page = renderDeliverables(arg); break;
      case 'capstone': page = renderCapstone(arg); break;
      case 'exam': page = renderExam(); break;
      case 'progress': page = renderProgress(); break;
      default: page = renderDashboard();
    }
  } catch (e) {
    console.error(e);
    page = h('div', { class: 'page' }, h('div', { class: 'callout bad' }, '画面の表示中にエラーが発生しました: ' + e.message), h('a', { href: '#dashboard' }, 'ダッシュボードへ戻る'));
  }
  fill(mainEl, page);
  window.scrollTo(0, 0);
  mainEl.focus({ preventScroll: true });
}

function renderNav(hash) {
  const o = P.overall();
  const link = (href, label, extra) => h('a', { class: 'nav-link', href: '#' + href, 'aria-current': hash === href || (href !== 'dashboard' && hash.startsWith(href + '-')) ? 'page' : null }, label, extra ? h('span', { class: 'st' }, extra) : null);
  const curLevel = P.currentLevel();
  fill(navEl, 
    h('div', { class: 'nav-progress' }, h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', {}, '全体の進捗'), h('span', { class: 'num' }, `${o.pct}%`)), h('div', { class: 'bar' }, h('i', { style: { width: o.pct + '%' } }))),
    h('div', { class: 'nav-group' },
      link('dashboard', 'ダッシュボード'), link('curriculum', 'カリキュラム', `${o.done}/${o.total}`), link('schema', 'DB構造ビューア'),
      link('lab', 'DB移行ラボ', `${o.scDone}/10`), link('deliverables', '成果物'), link('exam', '総合試験'), link('progress', '進捗とデータ')),
    LEVELS.map((lv) => {
      const open = lv.level === curLevel || hash.startsWith('lesson-') && lessonsOfLevel(lv.level).some((l) => hash === 'lesson-' + l.id) || (lv.level === 5 && hash.startsWith('capstone-'));
      const items = lv.level < 5
        ? lessonsOfLevel(lv.level).map((l) => { const p = P.lessonProgress(l); return h('a', { class: 'nav-link nav-lesson', href: '#lesson-' + l.id, 'aria-current': hash === 'lesson-' + l.id ? 'page' : null }, h('span', { class: 'dot', 'data-s': p.status, 'aria-label': P.STATUS_LABEL[p.status] }), `${l.chapter}. ${l.title}`); })
        : CAPSTONES.map((c) => h('a', { class: 'nav-link nav-lesson', href: '#capstone-' + c.id, 'aria-current': hash === 'capstone-' + c.id ? 'page' : null }, h('span', { class: 'dot', 'data-s': store.get().capstones[c.id]?.completedAt ? 'done' : 'new' }), `課題${c.no}`));
      const d = h('details', { class: 'nav-group', open }, h('summary', { class: 'nav-title', style: { cursor: 'pointer' } }, lv.title.replace('：', ' ')), items);
      return d;
    }));
}

async function start() {
  store.load();
  document.documentElement.style.setProperty('--fs', (store.get().settings.fontSize || 14) + 'px');
  document.getElementById('menu-btn').addEventListener('click', () => { navEl.dataset.open = navEl.dataset.open === '1' ? '0' : '1'; });
  window.addEventListener('hashchange', render);
  store.onChange(() => renderNav(route().hash));
  S.onSession((e) => {
    if (e.type === 'busy') { pill.dataset.state = e.busy ? 'busy' : 'ready'; }
    if (e.type === 'restarting') { pill.dataset.state = 'busy'; pill.lastChild.textContent = 'SQLエンジンを再起動中…'; }
    if (e.type === 'context' || e.type === 'reset') pill.lastChild.textContent = '練習DB: ' + S.contextLabel();
  });
  renderNav(route().hash);
  fill(mainEl, h('div', { class: 'boot', role: 'status' }, h('div', {}, h('h2', {}, 'SQLエンジンを準備しています…'), h('p', { class: 'muted' }, 'ブラウザの中でPostgreSQL（PGlite）を起動しています。初回はエンジン本体（数MB）の読み込みに時間がかかります。'))));
  try {
    const info = await S.boot();
    pill.dataset.state = 'ready';
    pill.title = info.version;
    pill.lastChild.textContent = '練習DB: ' + S.contextLabel();
    ready = true;
    render();
  } catch (e) {
    console.error(e);
    pill.dataset.state = 'error'; pill.lastChild.textContent = 'SQLエンジン未起動';
    fill(mainEl, h('div', { class: 'page' }, h('div', { class: 'callout bad stack' },
      h('h2', {}, 'SQLエンジンを起動できませんでした'),
      h('p', {}, String(e.message || e)),
      h('ul', {},
        h('li', {}, 'インターネットに接続されているか確認してください（初回はエンジン本体を cdn.jsdelivr.net から読み込みます）。'),
        h('li', {}, 'index.html をファイルとして直接開いた場合は動きません。README の「起動方法」に従って、ローカルサーバー（例: python3 -m http.server）経由で開いてください。'),
        h('li', {}, 'オフラインで使う場合は、README の「オフラインで使う」に従って PGlite を vendor フォルダに置いてください。'))),
      h('p', { class: 'small muted' }, 'カリキュラムの閲覧と成果物の作成は、エンジンなしでも利用できます。'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#curriculum', onclick: () => { ready = true; } }, 'カリキュラムを見る'), h('a', { class: 'btn', href: '#deliverables', onclick: () => { ready = true; } }, '成果物を開く'))));
  }
}

start();
