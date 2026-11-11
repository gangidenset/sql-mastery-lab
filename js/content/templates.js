// 実務成果物テンプレート（12種類）
// fields: 単一項目（text / textarea / date）、table: 行を追加できる表（CSV出力可）
export const TEMPLATES = [
  { id: 'plan', title: 'DB移行計画書', desc: '目的・範囲・方式・スケジュール・体制・リスクをまとめる',
    fields: [['project', 'プロジェクト名', 'text'], ['purpose', '目的', 'textarea'], ['scope', '移行範囲（対象システム・テーブル）', 'textarea'], ['out_of_scope', '対象外とその理由', 'textarea'], ['method', '移行方式と選定理由', 'textarea'], ['schedule', 'スケジュール（リハーサル・本番・停止時間）', 'textarea'], ['team', '体制と役割（実行者・確認者・判断者）', 'textarea'], ['verify_policy', '検証方針', 'textarea'], ['rollback_policy', '切り戻し方針', 'textarea']],
    table: { title: 'リスク一覧', cols: ['リスク', '影響', '発生可能性', '対策（予防）', '発生時の対応'] } },
  { id: 'target-list', title: '移行対象一覧', desc: '移行元・移行先テーブル、件数、対象条件',
    fields: [['as_of', '調査日時', 'text'], ['note', '備考', 'textarea']],
    table: { title: '対象テーブル', cols: ['移行元テーブル', '移行先テーブル', '移行元件数', '移行対象件数', '対象条件', '対象外の理由', '移行順序'] } },
  { id: 'table-compare', title: 'テーブル定義比較表', desc: '移行元と移行先の列・型・NULL許可の差分',
    fields: [['src_table', '移行元テーブル', 'text'], ['dst_table', '移行先テーブル', 'text']],
    table: { title: '列の比較', cols: ['移行元 列名', '移行元 型', '移行元 NULL', '移行先 列名', '移行先 型', '移行先 NULL', '差分・対応方針'] } },
  { id: 'mapping', title: 'データマッピング表', desc: '移行先列ごとの移行元・変換ルール・例',
    fields: [['src_table', '移行元テーブル', 'text'], ['dst_table', '移行先テーブル', 'text'], ['target_rule', '対象条件（WHERE）', 'textarea']],
    table: { title: 'マッピング', cols: ['移行先 列', '移行元 列', '変換ルール', '移行元の例', '移行先の例', '備考'] } },
  { id: 'sql-list', title: '移行SQL一覧', desc: '実行するSQLの一覧と順序・期待件数',
    fields: [['version', '版数・日付', 'text']],
    table: { title: 'SQL一覧', cols: ['実行順', 'ファイル名/名称', '対象テーブル', '処理内容', '期待件数', '所要時間（リハーサル）', '再実行可否'] } },
  { id: 'review', title: 'SQLレビュー記録', desc: 'レビュー観点ごとの指摘と対応',
    fields: [['target', 'レビュー対象SQL', 'text'], ['reviewer', 'レビュー者', 'text'], ['date', '実施日', 'text'], ['sql', '対象SQL（貼り付け）', 'textarea']],
    table: { title: '指摘事項', cols: ['No', '観点（対象条件/JOIN/変換/冪等/順序/性能/安全）', '指摘内容', '重要度', '対応内容', '確認者'] } },
  { id: 'test-spec', title: '移行テスト仕様書', desc: '正常・異常・境界値・NULL・重複・大量データのテストケース',
    fields: [['target', 'テスト対象', 'text'], ['env', 'テスト環境・データ', 'textarea']],
    table: { title: 'テストケース', cols: ['No', '観点', '入力データ', '期待結果', '確認SQL', '実際の結果', '判定'] } },
  { id: 'verify-result', title: '移行検証結果', desc: '実施した検証SQLと結果',
    fields: [['run_at', '実施日時', 'text'], ['runner', '実施者', 'text'], ['summary', '総合判定とコメント', 'textarea']],
    table: { title: '検証項目', cols: ['No', '検証観点', '検証SQL', '期待値', '結果', '判定', '備考'] } },
  { id: 'incident', title: '障害対応記録', desc: '障害の現象・原因・対応・再発防止',
    fields: [['occurred_at', '発生日時', 'text'], ['phenomenon', '現象（エラーメッセージ等）', 'textarea'], ['impact', '影響範囲（どこまで移行されたか）', 'textarea'], ['cause', '原因', 'textarea'], ['action', '対応（復旧手順・再実行）', 'textarea'], ['verify', '復旧後の検証結果', 'textarea'], ['prevention', '再発防止策', 'textarea']] },
  { id: 'rollback', title: '切り戻し計画書', desc: '切り戻しの判断基準・手順',
    fields: [['criteria', '切り戻し判断基準（期限時刻・不整合条件）', 'textarea'], ['decider', '判断者・連絡経路', 'textarea'], ['precondition', '前提（旧システムのバックアップ・停止状態の維持）', 'textarea']],
    table: { title: '切り戻し手順', cols: ['No', '手順', '担当', '所要時間', '確認方法'] } },
  { id: 'runbook', title: '移行作業手順書', desc: '本番当日の手順（SQL・期待値・確認方法・NG時対応）',
    fields: [['date', '作業日時・停止時間', 'text'], ['precheck', '事前確認事項', 'textarea'], ['contacts', '連絡体制', 'textarea']],
    table: { title: '作業手順', cols: ['No', '予定時刻', '作業内容', '実行SQL/操作', '期待結果', '確認方法', 'NG時の対応', '担当', '実績'] } },
  { id: 'completion', title: '移行完了報告書', desc: '移行結果・対象外・検証結果・残課題',
    fields: [['completed_at', '完了日時', 'text'], ['summary', '概要', 'textarea'], ['verify', '検証結果の要約', 'textarea'], ['issues', '残課題・今後の対応', 'textarea']],
    table: { title: '移行結果', cols: ['テーブル', '移行元件数', '移行件数', '対象外件数', '対象外の理由', '検証結果'] } },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');

export function toMarkdown(t, data) {
  const lines = [`# ${t.title}`, '', `> ${t.desc}`, ''];
  for (const [k, label] of t.fields || []) {
    lines.push(`## ${label}`, '', (data.fields?.[k] || '（未記入）').trim(), '');
  }
  if (t.table) {
    lines.push(`## ${t.table.title}`, '', `| ${t.table.cols.join(' | ')} |`, `|${t.table.cols.map(() => '---').join('|')}|`);
    for (const row of data.rows || []) lines.push(`| ${t.table.cols.map((_, i) => esc(row[i])).join(' | ')} |`);
    lines.push('');
  }
  lines.push(`---`, `作成: SQL MASTERY LAB / ${new Date().toLocaleString('ja-JP')}`);
  return lines.join('\n');
}

export function toCsv(t, data) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [t.table.cols.map(q).join(',')];
  for (const row of data.rows || []) out.push(t.table.cols.map((_, i) => q(row[i])).join(','));
  return '﻿' + out.join('\r\n'); // BOM付き（Excelで文字化けしない）
}
