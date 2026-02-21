export type Difficulty = "easy" | "normal" | "hard";

export type Phase =
  | "idle"
  | "countdown"
  | "serve_auto"
  | "playing"
  | "quiz_prompt"
  | "quiz_countdown"
  | "quiz_play"
  | "quiz_result"
  | "gameover"
  | "timeup";

export type TFQuiz = {
  id: string;
  statement: string;
  correct: "O" | "X";
};

export type Motion = "static" | "sway" | "circle" | "zigzag" | "drift";

export type GameConfig = {
  rows: number;
  cols: number;
  baseR: { min: number; max: number };
  quizCount: number;
  obstacleCount: number;
  moveSet: Motion[];
  motionAmpMul: number;
  motionSpd: [number, number];
  topRate: number;
  rowGapMul: number;
  time: number;
};

export type Target = {
  id: string;
  x: number;
  y: number;
  r: number;
  baseX: number;
  baseY: number;
  color: string;
  hp: number;
  isQuiz: boolean;
  quizId?: string;

  motion: Motion;
  t: number;
  amp: number;
  spd: number;

  dx: number;
  dy: number;
  driftSpd: number;

  // ✅ 追加
  vx: number;
  vy: number;
  steerT: number;
};

export type Obstacle = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
};

export type QuizChoice = "X" | "O";