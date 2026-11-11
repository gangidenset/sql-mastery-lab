// カリキュラム全体の目次。レッスンを追加するときは各 level ファイルに追記するだけで反映されます。
import L01 from './level0-1.js';
import L2 from './level2.js';
import L3 from './level3.js';
import L4 from './level4.js';
import { CAPSTONES } from './capstones.js';

export const LEVELS = [
  { level: 0, title: 'LEVEL 0：データベースの基礎' },
  { level: 1, title: 'LEVEL 1：SQLの基礎' },
  { level: 2, title: 'LEVEL 2：SQLの応用' },
  { level: 3, title: 'LEVEL 3：DB移行に必要なSQL' },
  { level: 4, title: 'LEVEL 4：DB移行プロジェクト実践' },
  { level: 5, title: 'LEVEL 5：総合演習' },
];

export const LESSONS = [...L01, ...L2, ...L3, ...L4];
export { CAPSTONES };

export const getLesson = (id) => LESSONS.find((l) => l.id === id);
export const lessonsOfLevel = (lv) => LESSONS.filter((l) => l.level === lv);
export const nextLesson = (id) => { const i = LESSONS.findIndex((l) => l.id === id); return i >= 0 ? LESSONS[i + 1] || null : null; };

export const TYPE_LABELS = {
  choice: 'A 選択式', fill: 'B 穴埋め', fix: 'C 誤り修正', write: 'D SQL作成', predict: 'E 結果予測', investigate: 'F 不整合調査', deliverable: 'G 実務課題',
};

// 分野（理解度・苦手分野の集計に使用）
export const AREAS = {
  '基礎': ['ch01', 'ch02'], 'SELECT・WHERE': ['ch03', 'ch04'], '集計': ['ch05'], '更新・DDL': ['ch06', 'ch07'],
  'JOIN・サブクエリ': ['ch08', 'ch09'], '変換・NULL': ['ch10', 'ch11', 'ch13'], 'CTE・ウィンドウ': ['ch12'],
  '移行分析・設計': ['ch14', 'ch15', 'ch16'], '移行SQL・検証': ['ch17', 'ch18'], 'トランザクション・大量・性能': ['ch19', 'ch20', 'ch21'],
  '計画・運用': ['ch22', 'ch23', 'ch24', 'ch25'],
};

// 採点に渡す課題仕様（データセット・前提SQLをレッスン/シナリオから引き継ぐ）
export function lessonExerciseSpec(lesson, ex) {
  return { ...ex, dataset: ex.dataset || lesson.dataset || 'base', setup: ex.setup ?? lesson.setup ?? '' };
}
export function groupStepSpec(group, step, bulkRows) {
  return { ...step, dataset: step.dataset || group.dataset || 'migration', setup: step.setup ?? group.setupAll ?? '', bulkRows: step.bulkRows ?? bulkRows };
}
