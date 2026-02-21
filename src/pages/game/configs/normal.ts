import type { GameConfig } from "../types";

export const normalConfig: GameConfig = {
  rows: 3,
  cols: 5,
  baseR: { min: 26, max: 46 },
  quizCount: 2,
  obstacleCount: 1,
  moveSet: ["static", "sway", "zigzag", "drift"],
  motionAmpMul: 0.85,
  motionSpd: [0.55, 0.95],
  topRate: 0.2,
  rowGapMul: 1.95,
  time: 60,
};