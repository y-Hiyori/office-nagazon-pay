// src/pages/game/configs/rules.ts
import type { Difficulty } from "../types";

/**
 * ✅ ここだけ見ればルール全部わかる
 * - 初期倍率
 * - 的の点数
 * - クイズ正解/不正解の点数
 * - 倍率の増減
 * - クイズ出す範囲（QUIZZESの何番から何番まで）
 */

export type GameRules = {
  timeSec: number;

  startMultiplier: number;
  maxMultiplier: number;

  hitBaseScore: number;     // 通常の的を壊したときの基礎点（×倍率）
  clearBonus: number;       // 全部壊したときのボーナス

  quizCorrectBase: number;  // 正解時の基礎点（×倍率）
  quizWrongPenalty: number; // 不正解の減点

  quizMulUp: number;        // 正解で倍率+?
  quizMulDown: number;      // 不正解で倍率-?

  quizIndexFrom: number;    // QUIZZESの開始index
  quizIndexTo: number;      // QUIZZESの終了index（含む）
};

export const RULES: Record<Difficulty, GameRules> = {
  easy: {
    timeSec: 60,
    startMultiplier: 1,
    maxMultiplier: 10,
    hitBaseScore: 50,
    clearBonus: 300,
    quizCorrectBase: 150,
    quizWrongPenalty: 100,
    quizMulUp: 0.5,
    quizMulDown: 0.5,
    quizIndexFrom: 0,
    quizIndexTo: 8,
  },
  normal: {
    timeSec: 60,
    startMultiplier: 1,
    maxMultiplier: 50,
    hitBaseScore: 50,
    clearBonus: 400,
    quizCorrectBase: 300,
    quizWrongPenalty: 500,
    quizMulUp: 1.0,
    quizMulDown: 1.0,
    quizIndexFrom: 0,
    quizIndexTo: 20,
  },
  hard: {
    timeSec: 60,
    startMultiplier: 1,
    maxMultiplier: 100,
    hitBaseScore: 50,
    clearBonus: 500,
    quizCorrectBase: 500,
    quizWrongPenalty: 1000,
    quizMulUp: 2.0,
    quizMulDown: 2.0,
    quizIndexFrom: 21,
    quizIndexTo: 40,
  },
};