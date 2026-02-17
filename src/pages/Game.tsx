import React, { useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./Game.css";

/* =========================
   Types
========================= */

type Difficulty = "easy" | "normal" | "hard";

type Phase =
  | "idle"
  | "countdown" // start 3,2,1
  | "serve_auto" // auto serve 3,2,1
  | "playing"
  | "quiz_prompt" // question + buttons
  | "quiz_countdown" // 3,2,1 before quiz shot
  | "quiz_play" // hit big X/O targets
  | "quiz_result" // show correct/incorrect
  | "gameover"
  | "timeup";

type TFQuiz = {
  id: string;
  statement: string;
  correct: "O" | "X";
};

type Motion = "static" | "sway" | "circle" | "zigzag" | "drift";

type Target = {
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

  // drift
  dx: number;
  dy: number;
  driftSpd: number;
};

type Obstacle = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number; // horizontal moving
};

type QuizChoice = "X" | "O"; // left = ×, right = ○

/* =========================
   Utils
========================= */

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);

  const bumps = 11;
  ctx.beginPath();
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const k = 0.16 + 0.10 * Math.sin(i * 1.8);
    const rr = r * (1 + k);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.25, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r * 0.18, r * 0.10, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fill();

  ctx.restore();
}

function drawBigX(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.80)";
  ctx.lineWidth = Math.max(7, r * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  const s = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `900 ${Math.max(18, r * 0.32)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("×", x, y + r * 0.02);

  ctx.restore();
}

function drawBigO(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.80)";
  ctx.lineWidth = Math.max(9, r * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.70, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `900 ${Math.max(18, r * 0.32)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("○", x, y + r * 0.02);

  ctx.restore();
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export default function Game() {
  const quizzes: TFQuiz[] = useMemo(
    () => [
      { id: "q1", statement: "乳がんは早期発見が重要。", correct: "O" },
      { id: "q2", statement: "検診は受けなくてよい。", correct: "X" },
      { id: "q3", statement: "違和感があれば医療機関へ。", correct: "O" },
      { id: "q4", statement: "生活習慣は関係ない。", correct: "X" },
      { id: "q5", statement: "気になる変化があれば相談する。", correct: "O" },
    ],
    []
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [countdown, setCountdown] = useState(3);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const [multiplier, setMultiplier] = useState(1);
  const multiplierRef = useRef(1);

  const [timeLeft, setTimeLeft] = useState(60);
  const timeRef = useRef(60);

  const [activeQuiz, setActiveQuiz] = useState<TFQuiz | null>(null);
  const activeQuizRef = useRef<TFQuiz | null>(null);
  useEffect(() => {
    activeQuizRef.current = activeQuiz;
  }, [activeQuiz]);

  const [quizSelected, setQuizSelected] = useState<QuizChoice>("X");
  const [quizResult, setQuizResult] = useState<null | { correct: boolean; delta: number }>(null);

  const paddleRef = useRef({ x: 0, y: 0, w: 150, h: 16 });
  const ballRef = useRef({ x: 0, y: 0, r: 12, vx: 0, vy: 0, released: false });

  const targetsRef = useRef<Target[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);

  const keysRef = useRef({ left: false, right: false });
  const pointerRef = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  const lastTsRef = useRef(0);

  // countdown duplication fix (COMPLETE)
  const countdownTokenRef = useRef(0);
  const countdownRunningRef = useRef(false);
  const countdownIntervalRef = useRef<number | null>(null);
  const countdownTimeoutRef = useRef<number | null>(null);

  const stopCountdown = () => {
    countdownRunningRef.current = false;
    countdownTokenRef.current++;

    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (countdownTimeoutRef.current !== null) {
      window.clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
  };

  // lock control before shot
  const isControlLocked = (p: Phase) => p === "countdown" || p === "serve_auto" || p === "quiz_countdown";

  /* =========================
     Difficulty params
  ========================= */

  const params = useMemo(() => {
    if (difficulty === "easy") {
      return {
        rows: 2,
        cols: 3,
        baseR: { min: 34, max: 60 },
        quizCount: 1,
        obstacleCount: 0,
        moveSet: ["static", "sway"] as Motion[],
        motionAmpMul: 0.55,
        motionSpd: [0.35, 0.6],
        topRate: 0.23,
        rowGapMul: 2.05,
        time: 60,
      };
    }
    if (difficulty === "normal") {
      return {
        rows: 3,
        cols: 5,
        baseR: { min: 26, max: 46 },
        quizCount: 2,
        obstacleCount: 1,
        moveSet: ["static", "sway", "zigzag", "drift"] as Motion[],
        motionAmpMul: 0.85,
        motionSpd: [0.55, 0.95],
        topRate: 0.20,
        rowGapMul: 1.95,
        time: 60,
      };
    }
    return {
      rows: 4,
      cols: 6,
      // HARDだけ少し小さく
      baseR: { min: 18, max: 32 },
      quizCount: 3,
      obstacleCount: 2,
      moveSet: ["sway", "zigzag", "circle", "drift"] as Motion[],
      motionAmpMul: 1.05,
      motionSpd: [0.8, 1.35],
      topRate: 0.18,
      rowGapMul: 1.85,
      time: 60,
    };
  }, [difficulty]);

  /* =========================
     Resize / DPR
  ========================= */

  useEffect(() => {
    const apply = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const rect = wrap.getBoundingClientRect();
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

      const cssW = rect.width;
      const cssH = Math.min(window.innerHeight * 0.72, 760);

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);

      resetGame(true);
    };

    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  /* =========================
     Prevent arrow scroll (PC)
  ========================= */

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();

      if (e.key === "ArrowLeft") keysRef.current.left = true;
      if (e.key === "ArrowRight") keysRef.current.right = true;

      if (phaseRef.current === "quiz_prompt") {
        if (e.key === "ArrowLeft") setQuizSelected("X");
        if (e.key === "ArrowRight") setQuizSelected("O");
        if (e.key === " ") onQuizConfirm();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.left = false;
      if (e.key === "ArrowRight") keysRef.current.right = false;
    };

    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown as any);
      window.removeEventListener("keyup", onUp as any);
    };
  }, []);

  /* =========================
     Pointer (swipe)
  ========================= */

  const toCanvasX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return clientX;
    const rect = canvas.getBoundingClientRect();
    const xCss = clientX - rect.left;
    const dpr = canvas.width / rect.width;
    return xCss * dpr;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // 操作ロック中は入力無効
    const pNow = phaseRef.current;
    if (
      isControlLocked(pNow) ||
      pNow === "quiz_prompt" ||
      pNow === "quiz_result" ||
      pNow === "gameover" ||
      pNow === "timeup"
    ) {
      return;
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerRef.current.active = true;
    pointerRef.current.x = toCanvasX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerRef.current.active) return;
    pointerRef.current.x = toCanvasX(e.clientX);
  };
  const onPointerUp = () => {
    pointerRef.current.active = false;
  };

  /* =========================
     Create targets/obstacles
  ========================= */

  const makeTargets = (w: number, h: number) => {
    const marginX = clamp(w * 0.07, 22, 46);
    const topY = clamp(h * params.topRate, 120, 230);

    const baseR = clamp(Math.min(w, h) * 0.060, params.baseR.min, params.baseR.max);
    const gapX = (w - marginX * 2) / params.cols;

    const normalColors = ["#ff4d6d", "#ffb703", "#3a86ff", "#2ec4b6"];
    const quizColor = "#b14dff";

    const total = params.rows * params.cols;
    const quizIdx = new Set<number>();
    while (quizIdx.size < Math.min(params.quizCount, total)) {
      quizIdx.add(Math.floor(rand(0, total)));
    }

    const list: Target[] = [];
    for (let rr = 0; rr < params.rows; rr++) {
      for (let cc = 0; cc < params.cols; cc++) {
        const idx = rr * params.cols + cc;

        const x = marginX + gapX * (cc + 0.5);
        const y = topY + rr * (baseR * params.rowGapMul);

        const isQuiz = quizIdx.has(idx);
        const motion = params.moveSet[idx % params.moveSet.length];

        const ampBase = baseR * params.motionAmpMul;

        list.push({
          id: `t_${idx}_${Math.random().toString(16).slice(2)}`,
          x,
          y,
          r: baseR,
          baseX: x,
          baseY: y,
          color: isQuiz ? quizColor : normalColors[idx % normalColors.length],
          hp: 1,
          isQuiz,
          quizId: isQuiz ? quizzes[idx % quizzes.length].id : undefined,

          motion,
          t: rand(0, 100),
          amp: rand(ampBase * 0.6, ampBase * 1.15),
          spd: rand(params.motionSpd[0], params.motionSpd[1]),

          dx: rand(-1, 1),
          dy: rand(-1, 1),
          driftSpd: rand(0.12, 0.28),
        });
      }
    }

    targetsRef.current = list;
  };

  const makeObstacles = (w: number, h: number) => {
    const list: Obstacle[] = [];
    for (let i = 0; i < params.obstacleCount; i++) {
      const ww = clamp(w * 0.26, 140, 280);
      const hh = 16;
      const y = clamp(h * (0.52 + i * 0.11), 260, h - 240);
      const vx = rand(140, 240) * (Math.random() < 0.5 ? -1 : 1);

      list.push({
        id: `o_${i}_${Math.random().toString(16).slice(2)}`,
        x: rand(ww / 2 + 18, w - ww / 2 - 18),
        y,
        w: ww,
        h: hh,
        vx,
      });
    }
    obstaclesRef.current = list;
  };

  /* =========================
     Reset
  ========================= */

  const resetGame = (keepPhaseIdle = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    // countdown完全停止
    stopCountdown();

    scoreRef.current = 0;
    multiplierRef.current = 1;

    timeRef.current = params.time;

    setScore(0);
    setMultiplier(1);
    setTimeLeft(params.time);

    setActiveQuiz(null);
    setQuizSelected("X");
    setQuizResult(null);

    pointerRef.current.active = false;
    keysRef.current.left = false;
    keysRef.current.right = false;

    paddleRef.current = {
      x: w / 2,
      y: h - 64,
      w: clamp(w * 0.24, 110, 190),
      h: 16,
    };

    ballRef.current = {
      x: w / 2,
      y: h - 96,
      r: clamp(w * 0.022, 10, 14),
      vx: 0,
      vy: 0,
      released: false,
    };

    makeTargets(w, h);
    makeObstacles(w, h);

    lastTsRef.current = performance.now();

    if (!keepPhaseIdle) setPhase("idle");
  };

  /* =========================
     Auto countdown (NO DUPLICATION)
  ========================= */

  const runCountdown = (nextPhase: Phase, serveAfter: boolean) => {
    // 多重起動ゼロ：毎回必ず止めてから開始
    stopCountdown();

    const token = ++countdownTokenRef.current;
    countdownRunningRef.current = true;

    setCountdown(3);
    setPhase(serveAfter ? "serve_auto" : "countdown");

    countdownIntervalRef.current = window.setInterval(() => {
      if (token !== countdownTokenRef.current) {
        stopCountdown();
        return;
      }

      setCountdown((c) => {
        if (token !== countdownTokenRef.current) return c;

        if (c <= 1) {
          stopCountdown();
          if (serveAfter) doAutoServe(nextPhase);
          else setPhase(nextPhase);
          return 0;
        }
        return c - 1;
      });
    }, 650);

    countdownTimeoutRef.current = window.setTimeout(() => {
      if (token === countdownTokenRef.current) stopCountdown();
    }, 5000);
  };

  const doAutoServe = (next: Phase) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.width;

    // ロック：必ず真ん中
    paddleRef.current.x = w / 2;
    pointerRef.current.active = false;
    keysRef.current.left = false;
    keysRef.current.right = false;

    const p = paddleRef.current;
    const b = ballRef.current;

    b.released = false;
    b.x = p.x;
    b.y = p.y - p.h / 2 - b.r - 8;

    const base = 460;
    b.vx = rand(-170, 170);
    b.vy = -base;
    b.released = true;

    setPhase(next);
  };

  const startGameFlow = () => {
    resetGame(true);
    timeRef.current = params.time;
    setTimeLeft(params.time);
    runCountdown("playing", true);
  };

  /* =========================
     Quiz flow
  ========================= */

  const onQuizConfirm = () => {
    if (phaseRef.current !== "quiz_prompt") return;

    // ここで直接quiz_countdownにしない（runCountdown側がphaseを正しくセットする）
    runCountdown("quiz_play", true);
  };

  const resolveQuiz = (ans: QuizChoice) => {
    const q = activeQuizRef.current;
    if (!q) return;

    const correct = (ans === "O" && q.correct === "O") || (ans === "X" && q.correct === "X");

    let delta = 0;
    if (correct) {
      delta = Math.round(160 * multiplierRef.current);
      scoreRef.current += delta;
      multiplierRef.current = clamp(Number((multiplierRef.current + 0.5).toFixed(1)), 1, 5);
    } else {
      delta = -90;
      scoreRef.current += delta;
      multiplierRef.current = clamp(Number((multiplierRef.current - 0.5).toFixed(1)), 1, 5);
    }

    setScore(scoreRef.current);
    setMultiplier(multiplierRef.current);

    setQuizResult({ correct, delta });
    setPhase("quiz_result");

    window.setTimeout(() => {
      setQuizResult(null);
      setActiveQuiz(null);
      runCountdown("playing", true);
    }, 1200);
  };

  /* =========================
     Game loop
  ========================= */

  useEffect(() => {
    let raf = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      const dt = Math.min(0.033, Math.max(0.001, (ts - (lastTsRef.current || ts)) / 1000));
      lastTsRef.current = ts;

      const pNow = phaseRef.current;

      // BG
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);

      // frame
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.globalAlpha = 1;

      // HUD
      drawHUD(ctx, w);

      // time only in playing
      if (pNow === "playing") {
        timeRef.current -= dt;
        if (timeRef.current <= 0) {
          timeRef.current = 0;
          setTimeLeft(0);
          setPhase("timeup");
        } else {
          const show = Math.ceil(timeRef.current);
          if (show !== timeLeft) setTimeLeft(show);
        }
      }

      // update targets (only playing)
      if (pNow === "playing") {
        for (const t of targetsRef.current) {
          if (t.hp <= 0) continue;

          t.t += dt * t.spd;

          if (t.motion === "static") {
            t.x = t.baseX;
            t.y = t.baseY;
          } else if (t.motion === "sway") {
            t.x = t.baseX + Math.sin(t.t) * t.amp;
            t.y = t.baseY + Math.sin(t.t * 0.6) * (t.amp * 0.12);
          } else if (t.motion === "circle") {
            t.x = t.baseX + Math.cos(t.t) * t.amp;
            t.y = t.baseY + Math.sin(t.t) * (t.amp * 0.42);
          } else if (t.motion === "zigzag") {
            t.x = t.baseX + Math.sin(t.t * 1.5) * t.amp;
            t.y = t.baseY + Math.sin(t.t * 0.9) * (t.amp * 0.20);
          } else {
            const drift = Math.sin(t.t * t.driftSpd) + Math.cos(t.t * t.driftSpd * 0.8);
            t.x = t.baseX + Math.sin(t.t) * (t.amp * 0.7) + drift * t.amp * 0.20 * t.dx;
            t.y = t.baseY + Math.sin(t.t * 0.6) * (t.amp * 0.18) + drift * t.amp * 0.12 * t.dy;
          }
        }
      }

      // update obstacles (only playing)
      if (pNow === "playing") {
        for (const o of obstaclesRef.current) {
          o.x += o.vx * dt;
          if (o.x - o.w / 2 < 18) {
            o.x = 18 + o.w / 2;
            o.vx *= -1;
          }
          if (o.x + o.w / 2 > w - 18) {
            o.x = w - 18 - o.w / 2;
            o.vx *= -1;
          }
        }
      }

      // paddle control
      const p = paddleRef.current;

      if (
        isControlLocked(pNow) ||
        pNow === "quiz_prompt" ||
        pNow === "quiz_result" ||
        pNow === "gameover" ||
        pNow === "timeup"
      ) {
        // 固定中は入力も完全無効 + 絶対中央
        pointerRef.current.active = false;
        keysRef.current.left = false;
        keysRef.current.right = false;
        p.x = w / 2;
      } else if (pNow === "playing" || pNow === "quiz_play") {
        if (pointerRef.current.active) {
          p.x = pointerRef.current.x;
        } else {
          const speed = 860;
          let vx = 0;
          if (keysRef.current.left) vx -= speed;
          if (keysRef.current.right) vx += speed;
          p.x += vx * dt;
        }
        p.x = clamp(p.x, p.w / 2 + 14, w - p.w / 2 - 14);
      }

      // ball follow paddle when not released
      const b = ballRef.current;
      if (!b.released) {
        b.x = p.x;
        b.y = p.y - p.h / 2 - b.r - 8;
        b.vx = 0;
        b.vy = 0;
      }

      // physics when released
      if ((pNow === "playing" || pNow === "quiz_play") && b.released) {
        const minSp = 380;
        const maxSp = 700;

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // walls
        if (b.x - b.r < 14) {
          b.x = 14 + b.r;
          b.vx = Math.abs(b.vx);
        }
        if (b.x + b.r > w - 14) {
          b.x = w - 14 - b.r;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y - b.r < 14) {
          b.y = 14 + b.r;
          b.vy = Math.abs(b.vy);
        }

        // paddle collision
        const px1 = p.x - p.w / 2;
        const px2 = p.x + p.w / 2;
        const py1 = p.y - p.h / 2;
        const py2 = p.y + p.h / 2;

        const cx = clamp(b.x, px1, px2);
        const cy = clamp(b.y, py1, py2);

        const dx = b.x - cx;
        const dy = b.y - cy;

        if (dx * dx + dy * dy <= b.r * b.r && b.vy > 0) {
          b.y = py1 - b.r - 1;

          const hit = (b.x - p.x) / (p.w / 2);
          b.vy = -Math.abs(b.vy);
          b.vx += hit * 320;

          const sp = Math.hypot(b.vx, b.vy);
          const targetSp = clamp(sp, minSp, maxSp);
          const k = targetSp / (sp || 1);
          b.vx *= k;
          b.vy *= k;
        }

        // obstacles collision (playing)
        if (pNow === "playing") {
          for (const o of obstaclesRef.current) {
            const ox1 = o.x - o.w / 2;
            const ox2 = o.x + o.w / 2;
            const oy1 = o.y - o.h / 2;
            const oy2 = o.y + o.h / 2;

            const ccx = clamp(b.x, ox1, ox2);
            const ccy = clamp(b.y, oy1, oy2);

            const ddx = b.x - ccx;
            const ddy = b.y - ccy;

            if (ddx * ddx + ddy * ddy <= b.r * b.r) {
              const overlapX = Math.min(Math.abs(b.x - ox1), Math.abs(b.x - ox2));
              const overlapY = Math.min(Math.abs(b.y - oy1), Math.abs(b.y - oy2));
              if (overlapX < overlapY) b.vx *= -1;
              else b.vy *= -1;

              b.x += b.vx * 0.02;
              b.y += b.vy * 0.02;
            }
          }
        }

        // QUIZ middle bumper
        if (pNow === "quiz_play") {
          // 自然サイズ（スマホでもデカすぎない）
          const barW = clamp(Math.min(w, h) * 0.55, 200, 420);
          const barH = 16;
          const barX = w / 2;
          const barY = h * 0.52;

          const ox1 = barX - barW / 2;
          const ox2 = barX + barW / 2;
          const oy1 = barY - barH / 2;
          const oy2 = barY + barH / 2;

          const ccx = clamp(b.x, ox1, ox2);
          const ccy = clamp(b.y, oy1, oy2);

          const ddx = b.x - ccx;
          const ddy = b.y - ccy;

          if (ddx * ddx + ddy * ddy <= b.r * b.r) {
            const overlapX = Math.min(Math.abs(b.x - ox1), Math.abs(b.x - ox2));
            const overlapY = Math.min(Math.abs(b.y - oy1), Math.abs(b.y - oy2));
            if (overlapX < overlapY) b.vx *= -1;
            else b.vy *= -1;

            b.x += b.vx * 0.02;
            b.y += b.vy * 0.02;
          }
        }

        // target collision (playing only)
        if (pNow === "playing") {
          for (const t of targetsRef.current) {
            if (t.hp <= 0) continue;

            const rr = b.r + t.r;
            if (dist2(b.x, b.y, t.x, t.y) <= rr * rr) {
              b.vy *= -1;
              t.hp -= 1;

              if (t.hp <= 0) {
                if (!t.isQuiz) {
                  const add = Math.round(60 * multiplierRef.current);
                  scoreRef.current += add;
                  setScore(scoreRef.current);
                } else {
                  const q = quizzes.find((qq) => qq.id === t.quizId) || quizzes[0];
                  setActiveQuiz(q);
                  setQuizSelected("X");
                  b.released = false;
                  setPhase("quiz_prompt");
                }
              }

              b.y += b.vy * 0.016;
              break;
            }
          }

          const remain = targetsRef.current.filter((x) => x.hp > 0).length;
          if (remain === 0) {
            scoreRef.current += 300;
            setScore(scoreRef.current);
            makeTargets(w, h);
          }
        }

        // quiz big targets collision
        if (pNow === "quiz_play") {
          const rBig = clamp(Math.min(w, h) * 0.10, 46, 90);
          const yBig = h * 0.30;

          const left = { x: w * 0.32, y: yBig, r: rBig };
          const right = { x: w * 0.68, y: yBig, r: rBig };

          if (dist2(b.x, b.y, left.x, left.y) <= (b.r + left.r) * (b.r + left.r)) {
            b.released = false;
            resolveQuiz("X");
          }
          if (dist2(b.x, b.y, right.x, right.y) <= (b.r + right.r) * (b.r + right.r)) {
            b.released = false;
            resolveQuiz("O");
          }
        }

        // fell
        if (b.y - b.r > h + 28) {
          if (pNow === "playing") {
            setPhase("gameover");
          } else if (pNow === "quiz_play") {
            b.released = false;
            runCountdown("quiz_play", true);
          }
        }
      }

      // draw world AFTER update
      drawWorld(ctx, w, h, pNow);

      // overlays inside canvas (countdown)
      if (pNow === "countdown" || pNow === "serve_auto" || pNow === "quiz_countdown") {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.max(52, Math.min(w, h) * 0.12)}px system-ui`;
        ctx.fillText(String(countdown), w / 2, h / 2 - 10);

        ctx.font = `800 ${Math.max(14, Math.min(w, h) * 0.028)}px system-ui`;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        const sub = pNow === "quiz_countdown" ? "クイズ開始…" : "スタート…";
        ctx.fillText(sub, w / 2, h / 2 + 44);
        ctx.restore();
      }

      // quiz result overlay
      if (pNow === "quiz_result" && quizResult) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "rgba(12,16,28,0.96)";
        roundRect(ctx, w * 0.18, h * 0.38, w * 0.64, h * 0.18, 18);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.max(26, Math.min(w, h) * 0.055)}px system-ui`;
        ctx.fillText(quizResult.correct ? "正解！" : "不正解…", w / 2, h * 0.44);

        ctx.font = "800 16px system-ui";
        const s = quizResult.delta >= 0 ? `+${quizResult.delta}` : `${quizResult.delta}`;
        ctx.fillText(`${s} / x${multiplierRef.current.toFixed(1)}`, w / 2, h * 0.50);
        ctx.restore();
      }
    };

    const drawHUD = (ctx: CanvasRenderingContext2D, w: number) => {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 18, 18, w - 36, 44, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.font = "800 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

      ctx.textAlign = "left";
      ctx.fillText(`TIME: ${Math.ceil(timeRef.current)}s`, 34, 40);

      ctx.textAlign = "center";
      ctx.fillText(`SCORE: ${scoreRef.current}`, w / 2, 40);

      ctx.textAlign = "right";
      ctx.fillText(`x${multiplierRef.current.toFixed(1)}`, w - 34, 40);

      ctx.restore();
    };

    const drawWorld = (ctx: CanvasRenderingContext2D, w: number, h: number, pNow: Phase) => {
      // obstacles only in playing
      if (pNow === "playing") {
        for (const o of obstaclesRef.current) {
          ctx.save();
          ctx.globalAlpha = 0.70;
          ctx.fillStyle = "rgba(255,255,255,0.20)";
          roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 10);
          ctx.fill();
          ctx.restore();
        }
      }

      // targets hidden during quiz_play
      if (pNow === "playing" || pNow === "idle" || pNow === "countdown" || pNow === "serve_auto") {
        for (const t of targetsRef.current) {
          if (t.hp <= 0) continue;
          drawCell(ctx, t.x, t.y, t.r, t.color);

          if (t.isQuiz) {
            ctx.save();
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = `900 ${Math.max(12, t.r)}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("?", t.x, t.y + 1);
            ctx.restore();
          }
        }
      }

      // quiz big targets + center bumper
      if (pNow === "quiz_play") {
        const rBig = clamp(Math.min(w, h) * 0.10, 46, 90);
        const yBig = h * 0.30;
        drawBigX(ctx, w * 0.32, yBig, rBig);
        drawBigO(ctx, w * 0.68, yBig, rBig);

        const barW = clamp(Math.min(w, h) * 0.55, 200, 420);
        const barH = 16;
        const barX = w / 2;
        const barY = h * 0.52;

        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        roundRect(ctx, barX - barW / 2, barY - barH / 2, barW, barH, 10);
        ctx.fill();
        ctx.restore();
      }

      // paddle
      const p = paddleRef.current;
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#e6e6e6";
      roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 12);
      ctx.fill();
      ctx.restore();

      // ball
      const b = ballRef.current;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fill();
    };

    requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [difficulty, timeLeft, countdown, quizResult]);

  /* =========================
     Initial
  ========================= */

  useEffect(() => {
    const t = window.setTimeout(() => resetGame(true), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Button actions
  ========================= */

  const goTopInGame = () => {
    resetGame(false);
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="gamePage">
      <SiteHeader />

      <main className="gameMain">
        <div className="gameWrap" ref={wrapRef}>
          <div className="canvasShell">
            <canvas
              ref={canvasRef}
              className="gameCanvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {/* IDLE overlay center */}
            {phase === "idle" && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">Body Defense Hockey</div>
                  <div className="overlayText center">難易度を選んで START</div>

                  <div className="overlayRow">
                    <button
                      type="button"
                      className={difficulty === "easy" ? "diffBtn on" : "diffBtn"}
                      onClick={() => setDifficulty("easy")}
                    >
                      EASY
                    </button>
                    <button
                      type="button"
                      className={difficulty === "normal" ? "diffBtn on" : "diffBtn"}
                      onClick={() => setDifficulty("normal")}
                    >
                      NORMAL
                    </button>
                    <button
                      type="button"
                      className={difficulty === "hard" ? "diffBtn on" : "diffBtn"}
                      onClick={() => setDifficulty("hard")}
                    >
                      HARD
                    </button>
                  </div>

                  <button type="button" className="overlayPrimary" onClick={startGameFlow}>
                    START（3,2,1で自動発射）
                  </button>

                  <div className="overlayHint">操作：左右キー / スワイプ</div>
                </div>
              </div>
            )}

            {/* QUIZ prompt overlay */}
            {phase === "quiz_prompt" && activeQuiz && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">○×クイズ</div>
                  <div className="overlayText">{activeQuiz.statement}</div>

                  <div className="overlayRow">
                    <button
                      type="button"
                      className={quizSelected === "X" ? "quizBtn on" : "quizBtn"}
                      onClick={() => setQuizSelected("X")}
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className={quizSelected === "O" ? "quizBtn on" : "quizBtn"}
                      onClick={() => setQuizSelected("O")}
                    >
                      ○
                    </button>
                  </div>

                  <button type="button" className="overlayPrimary" onClick={onQuizConfirm}>
                    回答する（3,2,1で投げる）
                  </button>

                  <div className="overlayHint">PC：← →で選択 / Spaceで決定</div>
                </div>
              </div>
            )}

            {/* GAMEOVER / TIMEUP */}
            {(phase === "gameover" || phase === "timeup") && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">{phase === "gameover" ? "GAME OVER" : "TIME UP"}</div>
                  <div className="overlayText center">SCORE: {score}</div>

                  <div className="overlayRow">
                    <button type="button" className="overlayPrimary ghost" onClick={goTopInGame}>
                      TOP（ゲーム最初へ）
                    </button>
                    <button type="button" className="overlayPrimary" onClick={startGameFlow}>
                      もう一度
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}