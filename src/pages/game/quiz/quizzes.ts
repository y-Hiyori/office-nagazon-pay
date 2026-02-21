import type { TFQuiz } from "../types";

export const QUIZZES: TFQuiz[] = [
  // ===== 基本（やさしい）=====
  { id: "q1", statement: "乳がんは早期発見が重要である。", correct: "O" },
  { id: "q2", statement: "乳がんは女性に最も多いがんの一つである。", correct: "O" },
  { id: "q3", statement: "しこりがなくても乳がんの可能性はある。", correct: "O" },
  { id: "q4", statement: "乳がんは男性には絶対に発生しない。", correct: "X" },
  { id: "q5", statement: "検診を受ければ必ず乳がんを完全に防げる。", correct: "X" },
  { id: "q6", statement: "乳房に違和感を感じたら医療機関を受診するべきである。", correct: "O" },
  { id: "q7", statement: "乳がんは若い人には絶対に起こらない。", correct: "X" },
  { id: "q8", statement: "家族に乳がん患者がいるとリスクが上がることがある。", correct: "O" },

  // ===== 検診・症状 =====
  { id: "q9", statement: "乳がん検診にはマンモグラフィが使われる。", correct: "O" },
  { id: "q10", statement: "乳がんは痛みが必ずある。", correct: "X" },
  { id: "q11", statement: "乳頭から血の混じった分泌物が出ることがある。", correct: "O" },
  { id: "q12", statement: "皮膚がえくぼのようにへこむことがある。", correct: "O" },
  { id: "q13", statement: "自己触診は意味がない。", correct: "X" },
  { id: "q14", statement: "定期的な検診は死亡率を下げる効果があるとされている。", correct: "O" },

  // ===== リスク要因 =====
  { id: "q15", statement: "初潮が早いと乳がんリスクが上がることがある。", correct: "O" },
  { id: "q16", statement: "閉経が遅いと乳がんリスクが上がることがある。", correct: "O" },
  { id: "q17", statement: "飲酒は乳がんリスクに影響することがある。", correct: "O" },
  { id: "q18", statement: "運動習慣は乳がんリスクと無関係である。", correct: "X" },
  { id: "q19", statement: "肥満は閉経後乳がんのリスク因子の一つである。", correct: "O" },
  { id: "q20", statement: "出産経験がないことはリスク因子になり得る。", correct: "O" },

  // ===== 遺伝・難しめ =====
  { id: "q21", statement: "BRCA遺伝子変異は乳がんリスクを高める。", correct: "O" },
  { id: "q22", statement: "遺伝性乳がんは全体の約50%以上を占める。", correct: "X" },
  { id: "q23", statement: "遺伝子検査はすべての人に必須である。", correct: "X" },

  // ===== 治療 =====
  { id: "q24", statement: "乳がん治療には手術が行われることがある。", correct: "O" },
  { id: "q25", statement: "放射線治療が行われることがある。", correct: "O" },
  { id: "q26", statement: "抗がん剤治療が行われることがある。", correct: "O" },
  { id: "q27", statement: "乳房温存手術という選択肢がある。", correct: "O" },
  { id: "q28", statement: "治療法はがんの種類や進行度によって異なる。", correct: "O" },
  { id: "q29", statement: "乳がんは一種類しか存在しない。", correct: "X" },

  // ===== ホルモン・分子タイプ =====
  { id: "q30", statement: "ホルモン受容体陽性タイプがある。", correct: "O" },
  { id: "q31", statement: "HER2陽性乳がんというタイプがある。", correct: "O" },
  { id: "q32", statement: "トリプルネガティブ乳がんというタイプがある。", correct: "O" },
  { id: "q33", statement: "すべての乳がんに同じ薬が効く。", correct: "X" },

  // ===== さらに難しめ =====
  { id: "q34", statement: "乳がんはリンパ節に転移することがある。", correct: "O" },
  { id: "q35", statement: "転移があっても治療の選択肢は存在する。", correct: "O" },
  { id: "q36", statement: "早期乳がんの5年生存率は比較的高い。", correct: "O" },
  { id: "q37", statement: "乳がんは必ず再発する。", correct: "X" },
  { id: "q38", statement: "ホルモン療法は数年間続けることがある。", correct: "O" },
  { id: "q39", statement: "定期的なフォローアップは重要である。", correct: "O" },
  { id: "q40", statement: "乳がんは予防や早期発見の取り組みが重要である。", correct: "O" },
];

export const getQuizById = (id?: string): TFQuiz => {
  if (!id) return QUIZZES[0];
  return QUIZZES.find((q) => q.id === id) ?? QUIZZES[0];
};

export const ensureQuizSuffix = (statement: string) => {
  const s = statement.trim();
  return s.endsWith("（○か×？）") ? s : `${s}（○か×？）`;
};