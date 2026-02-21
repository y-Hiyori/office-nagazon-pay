import type { GameConfig } from "../types";

export const easyConfig: GameConfig = {
  rows: 2,
  cols: 3,
  baseR: { min: 34, max: 60 },
  quizCount: 1,
  obstacleCount: 0,
  moveSet: ["static", "sway"],
  motionAmpMul: 0.55,
  motionSpd: [0.35, 0.6],
  topRate: 0.23,
  rowGapMul: 2.05,
  time: 60,
};