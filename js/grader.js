// 採点ロジック。文字列一致ではなく「実際に実行した結果」で判定します。
//  1. 学習者のSQLが実行できたか
//  2. 最後に返された結果（列数・値・行数・必要なら並び順）が模範解答と一致するか
//  3. チェック用SQL（移行先の状態など）の結果が一致するか
//  4. 全テーブルの指紋（件数＋内容ハッシュ）が一致するか＝意図しない変更がないか
//  5. 課題ごとの追加ルール（必須キーワード、危険な書き方の禁止 など）

import { analyzeSafety } from './safety.js';

export function lastResultSet(results) {
  if (!results) return null;
  for (let i = results.length - 1; i >= 0; i--) if (results[i].fields.length) return results[i];
  return null;
}

// 数値表現の揺れ（10 と 10.00）を吸収して比較用の文字列にする
export function canon(v) {
  if (v === null || v === undefined) return '∅NULL';
  const s = String(v);
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return 'n:' + (Math.round(n * 1e6) / 1e6).toString();
  }
  if (s === 't' || s === 'true') return 'b:true';
  if (s === 'f' || s === 'false') return 'b:false';
  return 's:' + s;
}

export function compareResultSets(exp, act, { ordered = false, checkNames = false } = {}) {
  const msgs = [];
  if (!exp && !act) return { pass: true, msgs };
  if (!act) return { pass: false, msgs: ['結果（SELECTの出力）が返されていません。SELECT文で結果を表示してください。'] };
  if (!exp) return { pass: true, msgs };
  if (exp.fields.length !== act.fields.length) {
    msgs.push(`列の数が違います（期待: ${exp.fields.length}列 / あなた: ${act.fields.length}列）。期待される列: ${exp.fields.map((f) => f.name).join(', ')}`);
    return { pass: false, msgs };
  }
  if (checkNames) {
    const en = exp.fields.map((f) => f.name.toLowerCase()), an = act.fields.map((f) => f.name.toLowerCase());
    const diff = en.filter((n, i) => n !== an[i]);
    if (diff.length) { msgs.push(`列名が違います（期待: ${en.join(', ')} / あなた: ${an.join(', ')}）。AS で列名を付けてください。`); return { pass: false, msgs }; }
  }
  if (exp.rows.length !== act.rows.length) {
    msgs.push(`行数が違います（期待: ${exp.rows.length}行 / あなた: ${act.rows.length}行）。WHERE条件や JOIN の種類を確認しましょう。`);
    return { pass: false, msgs };
  }
  const key = (r) => r.map(canon).join('\u0001');
  const e = exp.rows.map(key), a = act.rows.map(key);
  if (ordered) {
    const idx = e.findIndex((k, i) => k !== a[i]);
    if (idx >= 0) {
      const sameSet = [...e].sort().join('\n') === [...a].sort().join('\n');
      msgs.push(sameSet
        ? '値は合っていますが、並び順が違います。ORDER BY を確認してください。'
        : `${idx + 1}行目の値が違います。期待: (${exp.rows[idx].map(show).join(', ')}) / あなた: (${act.rows[idx].map(show).join(', ')})`);
      return { pass: false, msgs };
    }
  } else {
    const es = [...e].sort(), as = [...a].sort();
    const idx = es.findIndex((k, i) => k !== as[i]);
    if (idx >= 0) { msgs.push('行数は合っていますが、値が一致しない行があります。条件・計算式・型変換を確認してください。'); return { pass: false, msgs }; }
  }
  return { pass: true, msgs };
}

const show = (v) => (v === null ? 'NULL' : String(v));

// 全ユーザーテーブルの「指紋」（件数＋内容ハッシュ）
export async function fingerprint(engine) {
  const t = await engine.query(`
    SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%'
    ORDER BY 1, 2`);
  const tables = t[0].rows;
  if (!tables.length) return {};
  const q = tables.map(([s, r]) => {
    const id = `"${s.replace(/"/g, '""')}"."${r.replace(/"/g, '""')}"`;
    const label = (s === 'public' ? r : `${s}.${r}`).replace(/'/g, "''");
    return `SELECT '${label}' AS t, count(*)::text AS n, coalesce(sum(hashtext(x::text)::bigint), 0)::text AS h FROM ${id} x`;
  }).join('\nUNION ALL\n');
  const res = await engine.query(q);
  const fp = {};
  for (const [tbl, n, h] of res[0].rows) fp[tbl] = { n: Number(n), h };
  return fp;
}

export function diffFingerprints(exp, act) {
  const out = [];
  const names = new Set([...Object.keys(exp), ...Object.keys(act)]);
  for (const n of names) {
    const a = exp[n], b = act[n];
    if (!a) out.push({ table: n, kind: 'extra', msg: `テーブル ${n} は期待される状態には存在しません（不要なテーブル作成？）` });
    else if (!b) out.push({ table: n, kind: 'missing', msg: `テーブル ${n} が存在しません（削除された／作成されていない）` });
    else if (a.n !== b.n) out.push({ table: n, kind: 'count', msg: `${n} の件数が違います（期待: ${a.n}件 / あなた: ${b.n}件）` });
    else if (a.h !== b.h) out.push({ table: n, kind: 'content', msg: `${n} の件数は同じですが内容が違います（値の変換・更新対象を確認）` });
  }
  return out;
}

async function capture(engine, sql, checkSql) {
  const r = await engine.execUser(sql, { timeoutMs: 15000 });
  const out = { ok: r.ok, error: r.error, results: r.results, timedOut: r.timedOut, inTransaction: r.inTransaction };
  if (r.inTransaction) await engine.run('ROLLBACK', { internal: true });
  if (r.ok || !r.timedOut) {
    out.fp = await fingerprint(engine);
    if (checkSql) {
      const c = await engine.run(checkSql, { internal: true, timeoutMs: 15000 });
      out.check = c.ok ? lastResultSet(c.results) : null;
      out.checkError = c.ok ? null : c.error;
    }
  }
  return out;
}

/**
 * 課題を採点する。
 * ex: { dataset, setup, answer, ordered, checkNames, compare:'result'|'none', check, allowDiff:[tables],
 *       mustInclude:[[regex, msg]], mustNotInclude:[[regex,msg]], requireTx, bulkRows }
 * 採点後、練習DBは「学習者のSQLを実行した後の状態」になります。
 */
export async function grade(engine, ex, userSql) {
  const report = { pass: false, checks: [], userResult: null };
  const add = (ok, label, detail = '') => report.checks.push({ ok, label, detail });
  const ds = ex.dataset || 'base';
  const opts = { bulkRows: ex.bulkRows };

  if (!userSql || !userSql.trim()) { add(false, 'SQLが入力されていません'); return report; }

  // 期待値（模範解答）
  await engine.reset(ds, opts, ex.setup);
  const exp = await capture(engine, ex.answer, ex.check);
  if (!exp.ok) { add(false, '模範解答の実行に失敗しました（教材の不具合）', exp.error?.message); return report; }

  // 学習者
  await engine.reset(ds, opts, ex.setup);
  const act = await capture(engine, userSql, ex.check);
  report.userResult = act;
  if (!act.ok) {
    add(false, 'SQLの実行', act.timedOut ? '時間制限を超えました' : act.error?.message);
    return report;
  }
  add(true, 'SQLの実行', 'エラーなく実行できました');
  if (act.inTransaction) add(false, 'トランザクションの終了', 'BEGIN したまま COMMIT / ROLLBACK していません。採点では未確定の変更は取り消されます。');

  if ((ex.compare || 'result') === 'result') {
    const c = compareResultSets(lastResultSet(exp.results), lastResultSet(act.results), { ordered: ex.ordered, checkNames: ex.checkNames });
    add(c.pass, '結果の比較（列・行・値）', c.pass ? `${lastResultSet(act.results)?.rows.length ?? 0}行が一致` : c.msgs.join(' '));
  }
  if (ex.check) {
    const c = compareResultSets(exp.check, act.check, { ordered: true });
    add(c.pass && !act.checkError, ex.checkLabel || '実行後のデータ状態の確認', act.checkError ? act.checkError.message : (c.pass ? '期待どおりの状態です' : c.msgs.join(' ')));
  }
  const diffs = diffFingerprints(exp.fp, act.fp).filter((d) => !(ex.allowDiff || []).includes(d.table));
  add(!diffs.length, ex.compare === 'none' || ex.check ? 'データベース全体の最終状態' : '意図しないデータ変更がないか（副作用の確認）',
    diffs.length ? diffs.map((d) => d.msg).join(' / ') : '問題ありません');

  for (const [re, msg] of ex.mustInclude || []) {
    const ok = new RegExp(re, 'is').test(userSql);
    add(ok, '課題の条件', ok ? msg.replace(/を使って.*$/, '') + ' OK' : msg);
  }
  for (const [re, msg] of ex.mustNotInclude || []) {
    const ok = !new RegExp(re, 'is').test(userSql);
    add(ok, '禁止事項', ok ? 'OK' : msg);
  }
  if (ex.requireSafe) {
    const s = analyzeSafety(userSql);
    const bad = s.filter((x) => x.level === 'danger');
    add(!bad.length, 'SQLの安全性', bad.length ? bad.map((b) => b.msg).join(' / ') : '危険な書き方は見つかりませんでした');
  }
  report.pass = report.checks.every((c) => c.ok);
  return report;
}
