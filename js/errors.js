// PostgreSQLのエラーを初心者向けに説明する。
// 原因を断定できない場合は「確認すべきポイント」を案内する（断定しない）。

const RULES = {
  '42703': (m) => ({
    title: '指定した列（カラム）が存在しません',
    body: `列 ${q(m, /column "?([^"\s]+)"? does not exist/)} が見つかりません。`,
    checks: ['右側の「テーブル」パネルで正しい列名を確認する', '列名のスペルミス・大文字小文字（"Name" のように引用符で囲むと区別されます）', '別名(AS)を付けた列を WHERE で使っていないか（WHERE では別名を使えません）', 'JOIN した別テーブルの列ではないか（テーブル名.列名 で指定）', '文字列を "ダブルクォート" で囲んでいないか（文字列は \'シングルクォート\'）'],
  }),
  '42P01': (m) => ({
    title: 'テーブルが存在しません',
    body: `テーブル ${q(m, /relation "([^"]+)" does not exist/)} が見つかりません。`,
    checks: ['テーブル一覧で正しい名前を確認する（例: customers, legacy_customers）', 'スペルミス・単数形/複数形の違い', '直前に DROP TABLE していないか（「DBを初期化」で元に戻せます）', '課題で使うデータセットが正しいか（移行演習では新システム側が空の場合があります）'],
  }),
  '42601': (m, e, sql) => ({
    title: 'SQLの書き方（構文）に誤りがあります',
    body: `${nearWord(m)}${posInfo(e, sql)}`,
    checks: ['カンマの付け忘れ・付けすぎ（最後の列の後ろにカンマがない？）', 'キーワードの順番：SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT', 'かっこ ( ) の数が合っているか', '文字列は \'シングルクォート\' で閉じているか', '複数の文を書くときは ; で区切る'],
  }),
  '42883': (m) => ({
    title: m.includes('operator does not exist') ? '型が合わない比較・計算をしています' : '関数が存在しないか、引数の型が合いません',
    body: m.includes('operator does not exist') ? `演算子 ${q(m, /operator does not exist: (.+)$/)} は使えません。文字列と数値を比較している可能性があります。` : `関数 ${q(m, /function (.+?) does not exist/)} が見つかりません。`,
    checks: ['比較している2つの値のデータ型を確認（varchar と integer など）', '必要なら CAST(値 AS 型) や 値::型 で型をそろえる', '関数名のスペル、引数の数と型'],
  }),
  '22P02': (m) => ({
    title: '値を指定した型に変換できません',
    body: `${q(m, /: "(.*)"$/) ? `値 "${q(m, /: "(.*)"$/)}" ` : ''}を数値や真偽値などに変換しようとして失敗しました。移行データでよく起きます。`,
    checks: ['変換前に正規表現（~）で数値だけの値か確認する: 値 ~ \'^-?[0-9]+$\'', 'カンマ・円記号・空白・空文字などが含まれていないか', 'CASE WHEN で変換できる値だけ CAST し、それ以外は NULL にする／除外する'],
  }),
  '22007': () => DATE_RULE(), '22008': () => DATE_RULE(),
  '23505': (m, e) => ({
    title: '一意制約（重複禁止）に違反しました',
    body: `${e.detail || ''} 同じ値がすでに登録されています。`,
    checks: ['主キーやUNIQUE列に同じ値を入れようとしていないか', '移行を2回実行していないか（再実行時の重複防止：NOT EXISTS / ON CONFLICT）', '移行元データ自体に重複がないか（GROUP BY ... HAVING COUNT(*) > 1 で確認）'],
  }),
  '23503': (m, e) => ({
    title: '外部キー制約に違反しました（参照先が存在しない／参照されている）',
    body: `${e.detail || ''}`,
    checks: ['親テーブル（例: customers）を先に登録したか（親 → 子 の順）', '削除時は子テーブル（例: order_items）から先に削除', '参照先に存在しないID（孤立データ）が移行元に含まれていないか'],
  }),
  '23502': (m) => ({
    title: 'NOT NULL 制約に違反しました（必須の列が空です）',
    body: `列 ${q(m, /column "([^"]+)"/)} には NULL を入れられません。`,
    checks: ['INSERT の列リストに必須列が含まれているか', '移行元の値が NULL のときの扱い（COALESCE でデフォルト値を入れる／対象外にする）'],
  }),
  '23514': (m) => ({
    title: 'CHECK制約に違反しました（許可されていない値です）',
    body: `制約 ${q(m, /constraint "([^"]+)"/)} の条件を満たしていません。`,
    checks: ['テーブル定義（構造ビューア）で制約の条件を確認', 'ステータスなどのコード変換が正しいか', 'マイナス値など業務ルール上ありえない値が含まれていないか'],
  }),
  '22012': () => ({ title: '0で割り算をしました', body: '分母が0になる行があります。', checks: ['NULLIF(分母, 0) で0をNULLに置き換える', 'WHERE で分母が0の行を除外する'] }),
  '42803': () => ({
    title: 'GROUP BY の使い方に誤りがあります',
    body: 'SELECT に書いた列が GROUP BY に含まれていないか、集計関数の中にありません。',
    checks: ['集計しない列は GROUP BY に全部書く', 'WHERE の中で COUNT や SUM を使っていないか（集計結果の条件は HAVING）'],
  }),
  '42702': (m) => ({
    title: '列名があいまいです',
    body: `列 ${q(m, /column reference "([^"]+)"/)} が複数のテーブルにあります。`,
    checks: ['テーブル名.列名（または別名.列名）で指定する。例: o.customer_id'],
  }),
  '25P02': () => ({
    title: 'トランザクションがエラーで中断されています',
    body: 'BEGIN 後にエラーが起きたため、以降のSQLはすべて拒否されます。',
    checks: ['ROLLBACK を実行してトランザクションを終了する', 'SAVEPOINT を使っていれば ROLLBACK TO SAVEPOINT 名前 で途中まで戻せます'],
  }),
  '42P07': (m) => ({ title: '同じ名前のテーブルがすでにあります', body: m, checks: ['CREATE TABLE IF NOT EXISTS を使う', '作り直すなら先に DROP TABLE（練習DBなので初期化も可能）'] }),
  '42804': () => ({ title: 'データ型が一致しません', body: '代入先の列の型と値の型が合っていません。', checks: ['CAST で型を変換する', 'CASE WHEN の各分岐が同じ型を返しているか'] }),
  '21000': () => ({ title: 'サブクエリが複数行を返しました', body: '= で比較するサブクエリは1行だけを返す必要があります。', checks: ['= の代わりに IN を使う', 'サブクエリの条件を見直して1行に絞る'] }),
  '22001': (m) => ({ title: '文字列が長すぎます', body: m, checks: ['移行先の列の長さ（varchar(n)）を確認', '移行元に想定外に長いデータがないか length() で調査'] }),
  '22003': () => ({ title: '数値が範囲外です', body: '列の型に入りきらない大きさの数値です。', checks: ['numeric(精度,桁) の桁数を確認', '異常値（極端に大きい値）が含まれていないか'] }),
  '2BP01': () => ({ title: '他のオブジェクトが依存しているため削除できません', body: '外部キーなどで参照されています。', checks: ['参照している側を先に削除する', 'CASCADE は関連データも消えるので慎重に'] }),
  '3B001': () => ({ title: 'セーブポイントが存在しません', body: '指定した SAVEPOINT 名がありません。', checks: ['SAVEPOINT はトランザクション（BEGIN）の中でのみ有効', '名前のスペル'] }),
  '25001': () => ({ title: 'トランザクション内では実行できない操作です', body: '', checks: ['COMMIT / ROLLBACK してから実行する'] }),
  '0A000': (m) => ({ title: 'この機能はサポートされていません', body: m, checks: ['練習環境（PGlite）の制約の可能性があります。README の「エンジンの制約」を確認してください'] }),
  '42P10': () => ({ title: 'ON CONFLICT の対象に一意制約がありません', body: '', checks: ['ON CONFLICT (列) の列に主キーかUNIQUE制約が必要です'] }),
  '42P18': () => ({ title: 'データ型を判断できません', body: '', checks: ['値に ::型 を付けて型を明示する'] }),
  '42710': () => ({ title: '同じ名前のオブジェクトがすでにあります', body: '', checks: ['名前を変える、または先に削除する'] }),
  'SML_TIMEOUT': (m) => ({ title: '実行時間の上限を超えました', body: m + '。練習DBは直前のデータセットで自動的に作り直されました。', checks: ['無限に近い件数を生成していないか（generate_series の件数）', 'JOIN 条件の書き忘れで掛け算（直積）になっていないか', '大量データは分割して処理する'] }),
};

function DATE_RULE() {
  return {
    title: '日付・時刻として正しくない値です',
    body: '存在しない日付（例: 6月31日、13月）や、形式が違う値を日付に変換しようとしました。',
    checks: ['移行元の日付文字列の形式を確認（YYYYMMDD / YYYY/MM/DD）', '形式チェック: 値 ~ \'^[0-9]{8}$\'', '存在しない日付は CAST すると失敗します。to_date は自動で繰り上げることがあるので注意', '変換できない行は対象外として記録（migration_rejects など）'],
  };
}

function q(m, re) { const x = m.match(re); return x ? x[1] : ''; }
function nearWord(m) { const w = q(m, /at or near "([^"]*)"/); return w ? `「${w}」の付近がおかしいようです。` : (m.includes('end of input') ? 'SQLが途中で終わっています。' : ''); }
function posInfo(e, sql) {
  if (!e.position || !sql) return '';
  const before = sql.slice(0, e.position - 1);
  const line = before.split('\n').length; const col = before.length - before.lastIndexOf('\n');
  return `（${line}行目 ${col}文字目あたり）`;
}

export function explainError(err, sql) {
  if (!err) return null;
  const m = err.message || '';
  const rule = RULES[err.code];
  if (rule) return { ...rule(m, err, sql), code: err.code, raw: m, sure: true };
  return {
    title: 'エラーが発生しました（原因を自動では特定できませんでした）',
    body: '以下のポイントを順番に確認してみてください。',
    checks: ['エラーメッセージの英語の中にある列名・テーブル名・値に注目する', 'SQLを短く分けて、どの部分でエラーになるか確かめる', '使っているテーブルの構造（型・制約）を確認する', '直前のSQLでデータやテーブルを変更していないか（初期化で戻せます）'],
    code: err.code, raw: m, sure: false,
  };
}

export function errorLocation(err, sql) {
  if (!err?.position || !sql) return null;
  const before = sql.slice(0, err.position - 1);
  return { line: before.split('\n').length, col: before.length - before.lastIndexOf('\n') };
}
