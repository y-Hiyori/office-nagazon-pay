import type { GameConfig } from "../types";

export const hardConfig: GameConfig = {
  rows: 4,
  cols: 6,
  baseR: { min: 18, max: 32 },
  quizCount: 3,
  obstacleCount: 2,
  moveSet: ["sway", "zigzag", "circle", "drift"],
  motionAmpMul: 1.05,
  motionSpd: [0.8, 1.35],
  topRate: 0.18,
  rowGapMul: 1.85,
  time: 60,
};