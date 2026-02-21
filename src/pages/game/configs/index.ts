import type { Difficulty, GameConfig } from "../types";
import { easyConfig } from "./easy";
import { normalConfig } from "./normal";
import { hardConfig } from "./hard";

export const getConfig = (difficulty: Difficulty): GameConfig => {
  if (difficulty === "easy") return easyConfig;
  if (difficulty === "normal") return normalConfig;
  return hardConfig;
};

export { easyConfig, normalConfig, hardConfig };