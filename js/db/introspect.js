// DBの構造を調べる（構造ビューア・構造比較・検証ツールで使用）
import * as S from '../ui/session.js';

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
export const qid = (s) => '"' + String(s).replace(/"/g, '""') + '"';

export async function listTables() {
  const r = await S.query(`SELECT n.nspname, c.relname, obj_description(c.oid, 'pg_class')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%'
    ORDER BY n.nspname, c.relname`);
  const tables = r[0].rows.map(([schema, name, comment]) => ({ schema, name, comment, full: schema === 'public' ? name : `${schema}.${name}` }));
  if (tables.length) {
    const cnt = await S.query(tables.map((t) => `SELECT ${lit(t.full)}, count(*) FROM ${qid(t.schema)}.${qid(t.name)}`).join(' UNION ALL '));
    const m = Object.fromEntries(cnt[0].rows);
    tables.forEach((t) => (t.rows = Number(m[t.full])));
  }
  return tables;
}

export async function describe(schema, name) {
  const reg = lit(`${qid(schema)}.${qid(name)}`);
  const [cols] = await S.query(`SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod), NOT a.attnotnull, pg_get_expr(d.adbin, d.adrelid),
      EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS pk
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ${reg}::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`);
  const [cons] = await S.query(`SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = ${reg}::regclass ORDER BY contype, conname`);
  const [idx] = await S.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ${lit(schema)} AND tablename = ${lit(name)} ORDER BY indexname`);
  const [fks] = await S.query(`SELECT a.attname, c.confrelid::regclass::text, af.attname
    FROM pg_constraint c JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, n) ON true
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY fk(attnum, n) ON fk.n = k.n
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = fk.attnum
    WHERE c.contype = 'f' AND c.conrelid = ${reg}::regclass`);
  const fkMap = Object.fromEntries(fks.rows.map(([col, t, c]) => [col, `${t}.${c}`]));
  return {
    columns: cols.rows.map(([no, nm, type, nullable, def, pk]) => ({ no: Number(no), name: nm, type, nullable: nullable === 't' || nullable === 'true', def, pk: pk === 't' || pk === 'true', fk: fkMap[nm] || null })),
    constraints: cons.rows.map(([n, t, d]) => ({ name: n, type: { p: '主キー', f: '外部キー', u: '一意', c: 'CHECK', n: 'NOT NULL', x: '排他' }[t] || t, def: d })),
    indexes: idx.rows.map(([n, d]) => ({ name: n, def: d })),
  };
}

export async function sample(schema, name, limit = 20) {
  const r = await S.query(`SELECT * FROM ${qid(schema)}.${qid(name)} LIMIT ${limit}`);
  return r[0];
}

export async function relations() {
  const [r] = await S.query(`SELECT conrelid::regclass::text, confrelid::regclass::text, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype = 'f' ORDER BY 1`);
  return r.rows.map(([child, parent, def]) => ({ child, parent, def }));
}
