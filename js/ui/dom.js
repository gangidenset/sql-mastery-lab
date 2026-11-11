// 小さなDOMユーティリティ（フレームワーク不使用）
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- SQLのかんたんな色分け（表示用） ----
const KW = new Set(('select from where and or not in is null as distinct limit order by group having insert into values update set delete create table alter add column drop truncate index on join left right full outer inner cross using case when then else end with union all except intersect exists between like ilike begin commit rollback savepoint to release primary key foreign references check default unique explain analyze returning conflict do nothing over partition asc desc cast true false if declare loop for raise notice cascade serial integer varchar numeric date timestamp timestamptz text boolean char nulls first last filter lateral transaction start view schema sequence grant revoke').split(' '));
export function highlightSql(sql) {
  const out = []; const re = /(--[^\n]*)|('(?:[^']|'')*'?)|(\$\$)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let m;
  while ((m = re.exec(sql))) {
    if (m[1]) out.push(`<span class="tok-cmt">${esc(m[1])}</span>`);
    else if (m[2]) out.push(`<span class="tok-str">${esc(m[2])}</span>`);
    else if (m[3]) out.push(`<span class="tok-kw">$$</span>`);
    else if (m[4]) out.push(`<span class="tok-num">${m[4]}</span>`);
    else if (m[5]) out.push(KW.has(m[5].toLowerCase()) ? `<span class="tok-kw">${m[5]}</span>` : esc(m[5]));
    else out.push(esc(m[6]));
  }
  return out.join('');
}
export const codeBlock = (sql) => h('pre', { class: 'code', html: highlightSql(sql) });

// ---- 最小限のMarkdown（教材本文用） ----
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
export function md(text) {
  const lines = String(text || '').split('\n');
  const html = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; html.push(`<pre class="code">${highlightSql(buf.join('\n'))}</pre>`); continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      html.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      html.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      html.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); continue;
    }
    if (/^#{2,4} /.test(line)) { html.push(`<h3>${inline(line.replace(/^#+ /, ''))}</h3>`); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(```|\||- |\d+\. |#{2,4} )/.test(lines[i])) buf.push(lines[i++]);
    html.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return h('div', { class: 'prose', html: html.join('') });
}

// ---- 通知・モーダル ----
export function toast(msg, ms = 2600) {
  let host = document.querySelector('.toast-host');
  if (!host) { host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: 'toast' }, msg); host.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), body,
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
          actions.map((a) => h('button', { class: 'btn ' + (a.class || ''), onclick: () => close(a.value) }, a.label)))));
    document.body.append(back); document.addEventListener('keydown', onKey);
    back.querySelector('.modal button:last-child')?.focus();
  });
}

export function confirmBox(title, message, okLabel = '実行する', danger = false) {
  return modal(title, h('p', {}, message), [{ label: 'キャンセル', value: false }, { label: okLabel, value: true, class: danger ? 'danger' : 'primary' }]).then(Boolean);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('コピーしました'); return true; }
  catch { return false; }
}

// ダウンロード（ブラウザやホスト環境によっては無効なため、内容表示＋コピーも必ず用意する）
export function exportText(filename, text, mime = 'text/plain') {
  const ta = h('textarea', { class: 'input', readonly: true, id: 'export-text' }, text);
  const tryDownload = () => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
      const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* noop */ }
  };
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, `ファイル名: ${filename}。ダウンロードできない環境では「コピー」して、テキストエディタに貼り付けて保存してください。`), ta);
  modal('エクスポート', body, [{ label: '閉じる', value: 'close' }, { label: 'コピー', value: 'copy' }, { label: 'ダウンロード', value: 'dl', class: 'primary' }])
    .then(async (v) => {
      if (v === 'dl') tryDownload();
      if (v === 'copy' && !(await copyText(text))) { toast('コピーできませんでした。テキストを選択してコピーしてください'); }
    });
  setTimeout(() => { ta.focus(); ta.select(); }, 50);
}

export const stars = (n) => h('span', { class: 'stars', title: `難易度 ${n}/5`, 'aria-label': `難易度 ${n}/5` }, '●'.repeat(n) + '○'.repeat(5 - n));
export function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// 中身を入れ替える（配列も展開して追加）
export const fill = (el, ...children) => append(clear(el), children);
