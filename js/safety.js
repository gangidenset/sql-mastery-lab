// 破壊的な操作の「事前警告」。※これはセキュリティ対策の本体ではありません。
// 本体は「練習専用DB（アプリ内で完結）＋時間制限＋サイズ制限＋いつでも初期化」です。
// ここでは学習者に気づきを与えるための静的チェックだけを行います。

// コメントと文字列リテラルを取り除き、文ごとに分割
export function splitStatements(sql) {
  const out = []; let cur = ''; let i = 0;
  const s = sql;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '-' && n === '-') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; cur += ' '; continue; }
    if (c === "'") { let j = i + 1; while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") j += 2; else if (s[j] === "'") break; else j++; } cur += "''"; i = j + 1; continue; }
    if (c === '$') {
      const m = s.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (m) { const e = s.indexOf(m[0], i + m[0].length); cur += "''"; i = e < 0 ? s.length : e + m[0].length; continue; }
    }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function analyzeSafety(sql) {
  const findings = [];
  const stmts = splitStatements(sql);
  let inTx = false; let dmlInTx = false; let dmlOutsideTx = false;
  for (const st of stmts) {
    const u = st.replace(/\s+/g, ' ').toUpperCase();
    if (/^(BEGIN|START TRANSACTION)\b/.test(u)) { inTx = true; continue; }
    if (/^(COMMIT|END|ROLLBACK)\b/.test(u) && !/^ROLLBACK TO\b/.test(u)) { inTx = false; continue; }
    const head = u.slice(0, 60);
    if (/^(WITH .*\b)?(DELETE FROM)\b/.test(u) && !/\bWHERE\b/.test(u))
      findings.push({ level: 'danger', msg: `WHERE のない DELETE（全件削除）: ${head}…` });
    if (/^(WITH .*\b)?UPDATE\b/.test(u) && !/\bWHERE\b/.test(u))
      findings.push({ level: 'danger', msg: `WHERE のない UPDATE（全件更新）: ${head}…` });
    if (/\bWHERE\s+(1\s*=\s*1|TRUE)\s*($|;|\)|ORDER|RETURNING)/.test(u) && /^(DELETE|UPDATE)/.test(u))
      findings.push({ level: 'danger', msg: `常に真になる WHERE（全件対象）: ${head}…` });
    if (/^DROP (TABLE|SCHEMA|INDEX|VIEW)\b/.test(u))
      findings.push({ level: 'warn', msg: `オブジェクトを削除します: ${head}…` });
    if (/^TRUNCATE\b/.test(u))
      findings.push({ level: 'warn', msg: `テーブルを全件削除します（TRUNCATE）: ${head}…` });
    if (/^ALTER TABLE\b.*\bDROP (COLUMN|CONSTRAINT)\b/.test(u))
      findings.push({ level: 'warn', msg: `列や制約を削除します: ${head}…` });
    if (/GENERATE_SERIES\s*\([^)]*\b\d{7,}\b/.test(u))
      findings.push({ level: 'warn', msg: '100万件以上の生成は時間制限で止まる可能性があります' });
    if (/^(INSERT|UPDATE|DELETE|MERGE)\b/.test(u) || /^WITH\b.*\b(INSERT|UPDATE|DELETE)\b/.test(u)) {
      if (inTx) dmlInTx = true; else dmlOutsideTx = true;
    }
  }
  return Object.assign(findings, { dmlInTx, dmlOutsideTx, statementCount: stmts.length });
}

export function isDestructive(sql) {
  return analyzeSafety(sql).some((f) => f.level === 'danger' || f.level === 'warn');
}
