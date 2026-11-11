// 総合演習・総合試験の評価。
// SQLは「実行結果・最終状態」で自動採点。説明文は文字数とキーワードの網羅で「自己点検の目安」を出します
// （文章の内容の正しさまでは自動判定できないため、チェックリストでの自己評価も併用します）。
import { analyzeSafety } from './safety.js';
import { TEXT_SPECS, EXAM_TASKS, EXAM_TEXTS, EXAM_AXES } from './content/capstones.js';

export function textScore(text, spec) {
  const t = String(text || '');
  const len = t.replace(/\s/g, '').length;
  const lenOk = len >= spec.min;
  const hits = spec.keywords.filter((k) => t.toLowerCase().includes(k.toLowerCase()));
  const score = Math.min(1, len / spec.min) * 0.6 + (spec.keywords.length ? hits.length / spec.keywords.length : 1) * 0.4;
  return { len, lenOk, hits, missing: spec.keywords.filter((k) => !hits.includes(k)), score };
}

export function safetyReview(sqls) {
  const issues = [];
  for (const { label, sql } of sqls) {
    if (!sql) continue;
    const f = analyzeSafety(sql);
    f.filter((x) => x.level === 'danger').forEach((x) => issues.push({ level: 'danger', msg: `${label}: ${x.msg}` }));
    if (f.dmlOutsideTx && /\b(insert|update|delete)\b/i.test(sql)) issues.push({ level: 'advice', msg: `${label}: データ変更がトランザクション（BEGIN〜COMMIT）の外で実行されています。本番を想定するなら囲みましょう。` });
  }
  return issues;
}

export function evaluateCapstone(cap, cs) {
  const stepOk = cap.steps.map((s) => !!cs.steps?.[s.id]?.correct);
  const correctness = stepOk.filter(Boolean).length / cap.steps.length;
  const integrity = stepOk[stepOk.length - 1] ? 1 : 0; // 最後のステップ＝検証
  const safety = safetyReview(cap.steps.map((s, i) => ({ label: `ステップ${i + 1}`, sql: cs.steps?.[s.id]?.lastSql })));
  const dangers = safety.filter((x) => x.level === 'danger').length;
  const advices = safety.filter((x) => x.level === 'advice').length;
  const safetyScore = dangers ? 0 : Math.max(0.6, 1 - advices * 0.2);
  const texts = cap.texts.map((k) => ({ key: k, spec: TEXT_SPECS[k], r: textScore(cs.texts?.[k], TEXT_SPECS[k]) }));
  const explain = texts.reduce((a, t) => a + t.r.score, 0) / texts.length;
  const total = Math.round(correctness * 40 + integrity * 20 + safetyScore * 15 + explain * 25);
  const passed = stepOk.every(Boolean) && dangers === 0 && texts.every((t) => t.r.lenOk);
  return { axes: [['結果の正しさ（SQLの採点）', correctness], ['データの整合性（検証ステップ）', integrity], ['SQLの安全性', safetyScore], ['説明内容（自己点検の目安）', explain]], total, passed, safety, texts };
}

export function evaluateExam(exam) {
  const axis = {}; const add = (k, w, got) => { (axis[k] ||= { w: 0, got: 0 }); axis[k].w += w; axis[k].got += got; };
  let w = 0, got = 0;
  for (const t of EXAM_TASKS) {
    const ok = !!exam.answers[t.id]?.correct;
    w += t.weight; got += ok ? t.weight : 0;
    t.axis.forEach((a) => add(a, t.weight, ok ? t.weight : 0));
  }
  const texts = EXAM_TEXTS.map((t) => ({ t, r: textScore(exam.texts[t.id], t) }));
  for (const { t, r } of texts) { w += t.weight; got += t.weight * r.score; t.axis.forEach((a) => add(a, t.weight, t.weight * r.score)); }
  const safety = safetyReview(EXAM_TASKS.map((t) => ({ label: t.title, sql: exam.answers[t.id]?.sql })));
  const dangers = safety.filter((x) => x.level === 'danger').length;
  add('safety', 5, dangers ? 0 : 5); w += 5; got += dangers ? 0 : 5;
  const total = Math.round((got / w) * 100);
  const requiredOk = EXAM_TASKS.filter((t) => t.required).every((t) => exam.answers[t.id]?.correct);
  const textsOk = texts.every((x) => x.r.lenOk);
  const passed = requiredOk && textsOk && total >= 70 && dangers === 0;
  return {
    total, passed, requiredOk, textsOk, safety, texts,
    axes: Object.entries(axis).map(([k, v]) => [EXAM_AXES[k] || k, v.w ? v.got / v.w : 0]),
  };
}
