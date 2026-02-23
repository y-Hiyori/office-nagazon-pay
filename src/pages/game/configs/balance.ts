// src/pages/game/configs/balance.ts
import type { Difficulty } from "../types";

export type QuizRange = { from: number; to: number }; // inclusive

export type BalanceConfig = {
  multiplier: {
    initial: number;
    min: number;
    max: number;
    stepCorrect: number;
    stepWrong: number;
  };
  points: {
    hitCell: number;       // 通常セル破壊
    quizCorrect: number;   // ○×正解
    quizWrong: number;     // ○×不正解（マイナス）
    waveClearBonus: number;
  };
  quiz: {
    range: QuizRange;      // QUIZZESの何番〜何番を使うか
  };
  physics: {
    serveVy: number;       // オートサーブの上向き速度（負）
    ballSpeedMin: number;
    ballSpeedMax: number;
  };
};

// ✅ 難易度別に調整しやすいように分ける（必要なら数値は好きに）
export const BALANCE: Record<Difficulty, BalanceConfig> = {
  easy: {
    multiplier: { initial: 1, min: 1, max: 5, stepCorrect: 0.5, stepWrong: 0.5 },
    points: { hitCell: 60, quizCorrect: 160, quizWrong: -90, waveClearBonus: 300 },
    quiz: { range: { from: 0, to: 39 } },
    physics: { serveVy: 460, ballSpeedMin: 380, ballSpeedMax: 700 },
  },
  normal: {
    multiplier: { initial: 1, min: 1, max: 5, stepCorrect: 0.5, stepWrong: 0.5 },
    points: { hitCell: 60, quizCorrect: 180, quizWrong: -100, waveClearBonus: 320 },
    quiz: { range: { from: 0, to: 39 } },
    physics: { serveVy: 480, ballSpeedMin: 400, ballSpeedMax: 740 },
  },
  hard: {
    multiplier: { initial: 1, min: 1, max: 5, stepCorrect: 0.5, stepWrong: 0.5 },
    points: { hitCell: 60, quizCorrect: 200, quizWrong: -110, waveClearBonus: 350 },
    quiz: { range: { from: 0, to: 39 } },
    physics: { serveVy: 500, ballSpeedMin: 420, ballSpeedMax: 780 },
  },
};

// QUIZZES配列から、範囲だけ切り出して使う
export function pickQuizPool<T>(all: T[], range: QuizRange): T[] {
  const from = Math.max(0, Math.floor(range.from));
  const to = Math.min(all.length - 1, Math.floor(range.to));
  if (all.length === 0) return [];
  if (to < from) return all.slice(0, Math.min(all.length, 1));
  return all.slice(from, to + 1);
}