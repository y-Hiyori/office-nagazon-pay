// src/pages/game/Game.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./Game.css";

import { getConfig } from "./configs";
import { drawCell } from "./draw/drawCell";
import ScoreText from "./ui/ScoreText";
import MultiplierText from "./ui/MultiplierText";

// ✅ 追加：最初の画面にランキングを出す（更新ボタンなし）
import GameRankingMini from "./ui/GameRankingMini";

import { QUIZZES, ensureQuizSuffix, getQuizById } from "./quiz/quizzes";
import { getMyDisplayName, submitGameScore } from "./lib/scoreApi";

import type {
  Difficulty,
  Phase,
  Target,
  Obstacle,
  Motion,
  QuizChoice,
  TFQuiz,
} from "./types";

/* =========================
   Utils
========================= */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function circleRectHit(
  cx: number,
  cy: number,
  cr: number,
  rx1: number,
  ry1: number,
  rx2: number,
  ry2: number
) {
  const x = clamp(cx, rx1, rx2);
  const y = clamp(cy, ry1, ry2);
  const dx = cx - x;
  const dy = cy - y;
  return dx * dx + dy * dy <= cr * cr;
}

function resolveCircleRectBounce(
  b: { x: number; y: number; r: number; vx: number; vy: number },
  rx1: number,
  ry1: number,
  rx2: number,
  ry2: number
) {
  const overlapLeft = Math.abs(b.x - rx1);
  const overlapRight = Math.abs(b.x - rx2);
  const overlapTop = Math.abs(b.y - ry1);
  const overlapBottom = Math.abs(b.y - ry2);

  const minOverlap = Math.min(
    overlapLeft,
    overlapRight,
    overlapTop,
    overlapBottom
  );

  if (minOverlap === overlapLeft) {
    b.x = rx1 - b.r - 0.6;
    b.vx = -Math.abs(b.vx);
  } else if (minOverlap === overlapRight) {
    b.x = rx2 + b.r + 0.6;
    b.vx = Math.abs(b.vx);
  } else if (minOverlap === overlapTop) {
    b.y = ry1 - b.r - 0.6;
    b.vy = -Math.abs(b.vy);
  } else {
    b.y = ry2 + b.r + 0.6;
    b.vy = Math.abs(b.vy);
  }
}

/** ✅ クイズ：×（青） */
function drawBigXTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  ctx.save();
  ctx.globalAlpha = 0.98;

  ctx.shadowColor = "rgba(58,134,255,0.55)";
  ctx.shadowBlur = Math.max(10, r * 0.35);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(58,134,255,0.95)";
  ctx.lineWidth = Math.max(10, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  const s = r * 0.56;
  ctx.strokeStyle = "rgba(58,134,255,0.98)";
  ctx.lineWidth = Math.max(10, r * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();

  ctx.restore();
}

/** ✅ クイズ：○（赤） */
function drawBigOTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  ctx.save();
  ctx.globalAlpha = 0.98;

  ctx.shadowColor = "rgba(255,77,109,0.55)";
  ctx.shadowBlur = Math.max(10, r * 0.35);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,77,109,0.96)";
  ctx.lineWidth = Math.max(12, r * 0.20);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const params = useMemo(() => getConfig(difficulty), [difficulty]);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [countdown, setCountdown] = useState(3);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const multiplierRef = useRef(1);
  const [multiplierUi, setMultiplierUi] = useState(1);

  const [timeLeft, setTimeLeft] = useState(60);
  const timeRef = useRef(60);

  const [activeQuiz, setActiveQuiz] = useState<TFQuiz | null>(null);
  const activeQuizRef = useRef<TFQuiz | null>(null);
  useEffect(() => {
    activeQuizRef.current = activeQuiz;
  }, [activeQuiz]);

  const [quizResult, setQuizResult] = useState<null | {
    correct: boolean;
    delta: number;
  }>(null);

  const paddleRef = useRef({ x: 0, y: 0, w: 150, h: 16 });
  const ballRef = useRef({
    x: 0,
    y: 0,
    r: 12,
    vx: 0,
    vy: 0,
    released: false,
  });

  const targetsRef = useRef<Target[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);

  const keysRef = useRef({ left: false, right: false });
  const pointerRef = useRef<{ active: boolean; x: number }>({
    active: false,
    x: 0,
  });

  const lastTsRef = useRef(0);

  // ✅ スコア送信「1回だけ」ガード
  const scoreSentRef = useRef(false);

  // ✅ 名前を事前に確保して保持（重要）
  const displayNameRef = useRef("ゲスト");
  const userIdRef = useRef<string | null>(null);
  const isGuestRef = useRef(true);

  useEffect(() => {
    getMyDisplayName().then((v) => {
      displayNameRef.current = v.displayName;
      userIdRef.current = v.userId;
      isGuestRef.current = v.isGuest;
    });
  }, []);

  // countdown duplication safe
  const countdownTokenRef = useRef(0);
  const countdownIntervalRef = useRef<number | null>(null);
  const countdownTimeoutRef = useRef<number | null>(null);

  const stopCountdown = () => {
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

  useEffect(() => {
    return () => stopCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isControlLocked = (p: Phase) =>
    p === "countdown" || p === "serve_auto" || p === "quiz_countdown";

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
     Keyboard
  ========================= */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft") keysRef.current.left = true;
      if (e.key === "ArrowRight") keysRef.current.right = true;

      if (phaseRef.current === "quiz_prompt") {
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
     Pointer
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
    const pNow = phaseRef.current;
    if (
      isControlLocked(pNow) ||
      pNow === "quiz_prompt" ||
      pNow === "quiz_result" ||
      pNow === "gameover" ||
      pNow === "timeup"
    )
      return;

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
     Targets / Obstacles
  ========================= */
  const makeTargets = (w: number, h: number) => {
    const marginX = clamp(w * 0.05, 16, 34);
    const marginTop = clamp(h * 0.12, 86, 170);
    const areaBottom = Math.floor(h * 0.48);

    const baseR = clamp(
      Math.min(w, h) * 0.060,
      params.baseR.min,
      params.baseR.max
    );

    const areaLeft = marginX;
    const areaRight = w - marginX;
    const areaTop = marginTop;

    const normalColors = ["#ff4d6d", "#ffb703", "#3a86ff", "#2ec4b6"];
    const quizColor = "#b14dff";

    const total = params.rows * params.cols;

    const quizIdx = new Set<number>();
    while (quizIdx.size < Math.min(params.quizCount, total)) {
      quizIdx.add(Math.floor(rand(0, total)));
    }

    const list: Target[] = [];
    const minMul = 1.22;

    const canPlace = (t: Target) => {
      for (const ex of list) {
        if (ex.hp <= 0) continue;
        const rr = (t.r + ex.r) * minMul;
        if (dist2(t.x, t.y, ex.x, ex.y) <= rr * rr) return false;
      }
      return true;
    };

    for (let idx = 0; idx < total; idx++) {
      const isQuiz = quizIdx.has(idx);
      const motion = params.moveSet[idx % params.moveSet.length] as Motion;

      let placed: Target | null = null;

      for (let attempt = 0; attempt < 60; attempt++) {
        const r = baseR * rand(0.88, 1.06);
        const x = rand(areaLeft + r, areaRight - r);
        const y = rand(areaTop + r, areaBottom - r);

        const spBase = rand(params.motionSpd[0], params.motionSpd[1]);
        const pxPerSec =
          clamp(spBase * 220, 120, 340) *
          (difficulty === "hard"
            ? 1.15
            : difficulty === "normal"
            ? 1.05
            : 0.95);

        const ang = rand(0, Math.PI * 2);
        const vx = Math.cos(ang) * pxPerSec;
        const vy = Math.sin(ang) * pxPerSec * 0.75;

        const t: Target = {
          id: `t_${idx}_${Math.random().toString(16).slice(2)}`,
          x,
          y,
          r,
          baseX: x,
          baseY: y,
          color: isQuiz ? quizColor : normalColors[idx % normalColors.length],
          hp: 1,
          isQuiz,
          quizId: isQuiz ? QUIZZES[idx % QUIZZES.length].id : undefined,

          motion,
          t: rand(0, 100),
          amp: baseR * rand(0.45, 0.95),
          spd: spBase,

          dx: rand(-1, 1),
          dy: rand(-1, 1),
          driftSpd: rand(0.12, 0.28),

          vx,
          vy,
          steerT: rand(0.2, 0.9),
        };

        if (canPlace(t)) {
          placed = t;
          break;
        }
      }

      if (!placed) {
        const r = baseR * 0.94;
        const x = rand(areaLeft + r, areaRight - r);
        const y = rand(areaTop + r, areaBottom - r);
        const spBase = rand(params.motionSpd[0], params.motionSpd[1]);
        const pxPerSec = clamp(spBase * 200, 120, 320);
        const ang = rand(0, Math.PI * 2);

        placed = {
          id: `t_${idx}_${Math.random().toString(16).slice(2)}`,
          x,
          y,
          r,
          baseX: x,
          baseY: y,
          color: isQuiz ? quizColor : normalColors[idx % normalColors.length],
          hp: 1,
          isQuiz,
          quizId: isQuiz ? QUIZZES[idx % QUIZZES.length].id : undefined,

          motion,
          t: rand(0, 100),
          amp: baseR * rand(0.45, 0.95),
          spd: spBase,

          dx: rand(-1, 1),
          dy: rand(-1, 1),
          driftSpd: rand(0.12, 0.28),

          vx: Math.cos(ang) * pxPerSec,
          vy: Math.sin(ang) * pxPerSec * 0.75,
          steerT: rand(0.2, 0.9),
        };
      }

      list.push(placed);
    }

    targetsRef.current = list;
  };

  const makeObstacles = (w: number, h: number) => {
    const list: Obstacle[] = [];
    for (let i = 0; i < params.obstacleCount; i++) {
      const ww = clamp(w * 0.28, 160, 320);
      const hh = 16;
      const y = clamp(h * (0.62 + i * 0.1), Math.floor(h * 0.55), h - 210);
      const vx = rand(150, 260) * (Math.random() < 0.5 ? -1 : 1);

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

    stopCountdown();

    scoreSentRef.current = false;

    scoreRef.current = 0;
    setScore(0);

    multiplierRef.current = 1;
    setMultiplierUi(1);

    timeRef.current = params.time;
    setTimeLeft(params.time);

    setActiveQuiz(null);
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
     Countdown
  ========================= */
  const runCountdown = (nextPhase: Phase, serveAfter: boolean) => {
    stopCountdown();
    const token = ++countdownTokenRef.current;

    setCountdown(3);
    if (serveAfter && nextPhase === "quiz_play") setPhase("quiz_countdown");
    else setPhase(serveAfter ? "serve_auto" : "countdown");

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
    b.vx = 0;
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
     Quiz
  ========================= */
  const onQuizConfirm = () => {
    if (phaseRef.current !== "quiz_prompt") return;
    runCountdown("quiz_play", true);
  };

  const resolveQuiz = (ans: QuizChoice) => {
    const q = activeQuizRef.current;
    if (!q) return;

    const correct =
      (ans === "O" && q.correct === "O") || (ans === "X" && q.correct === "X");

    let delta = 0;
    if (correct) {
      delta = Math.round(160 * multiplierRef.current);
      scoreRef.current += delta;
      multiplierRef.current = clamp(
        Number((multiplierRef.current + 0.5).toFixed(1)),
        1,
        5
      );
    } else {
      delta = -90;
      scoreRef.current += delta;
      multiplierRef.current = clamp(
        Number((multiplierRef.current - 0.5).toFixed(1)),
        1,
        5
      );
    }

    setScore(scoreRef.current);
    setMultiplierUi(multiplierRef.current);

    setQuizResult({ correct, delta });
    setPhase("quiz_result");

    window.setTimeout(() => {
      setQuizResult(null);
      setActiveQuiz(null);
      runCountdown("playing", true);
    }, 1200);
  };

  const quizText = useMemo(() => {
    if (!activeQuiz) return "";
    return ensureQuizSuffix(activeQuiz.statement);
  }, [activeQuiz]);

  /* =========================
     ✅ GAME OVER / TIME UP：スコア送信（1回だけ）
  ========================= */
  useEffect(() => {
    if (phase !== "gameover" && phase !== "timeup") return;
    if (scoreSentRef.current) return;

    scoreSentRef.current = true;

    // ✅ 事前に確保した名前を必ず送る
    submitGameScore({
      score: scoreRef.current,
      difficulty,
      displayNameOverride: displayNameRef.current,
      userIdOverride: userIdRef.current,
      isGuestOverride: isGuestRef.current,
    }).then((res) => {
      if (!res.ok) console.warn("score submit failed:", res.error);
    });
  }, [phase, difficulty]);

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

      const dtRaw = (ts - (lastTsRef.current || ts)) / 1000;
      const dt = Math.min(0.033, Math.max(0.001, dtRaw));
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

      // targets movement
      if (pNow === "playing") {
        const top = clamp(h * 0.12, 86, 170);
        const bottom = Math.floor(h * 0.48);
        const left = clamp(w * 0.05, 16, 34);
        const right = w - left;

        for (const t of targetsRef.current) {
          if (t.hp <= 0) continue;

          t.steerT -= dt;
          if (t.steerT <= 0) {
            t.steerT = rand(0.35, 1.05);

            const spBase = rand(params.motionSpd[0], params.motionSpd[1]);
            const pxPerSec =
              clamp(spBase * 240, 140, 380) *
              (difficulty === "hard"
                ? 1.25
                : difficulty === "normal"
                ? 1.12
                : 1.0);

            const a = rand(0, Math.PI * 2);
            const bias =
              t.motion === "circle"
                ? 1.05
                : t.motion === "zigzag"
                ? 1.12
                : t.motion === "drift"
                ? 1.18
                : 1.0;

            const nx = Math.cos(a) * pxPerSec * bias;
            const ny = Math.sin(a) * pxPerSec * 0.75 * bias;

            t.vx = t.vx * 0.55 + nx * 0.45;
            t.vy = t.vy * 0.55 + ny * 0.45;
          }

          t.x += t.vx * dt;
          t.y += t.vy * dt;

          if (t.x - t.r < left) {
            t.x = left + t.r;
            t.vx = Math.abs(t.vx) * 0.92;
          }
          if (t.x + t.r > right) {
            t.x = right - t.r;
            t.vx = -Math.abs(t.vx) * 0.92;
          }
          if (t.y - t.r < top) {
            t.y = top + t.r;
            t.vy = Math.abs(t.vy) * 0.92;
          }
          if (t.y + t.r > bottom) {
            t.y = bottom - t.r;
            t.vy = -Math.abs(t.vy) * 0.92;
          }
        }

        // push apart
        const list = targetsRef.current;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (a.hp <= 0) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b2 = list[j];
            if (b2.hp <= 0) continue;

            const rr = (a.r + b2.r) * 1.04;
            const dx = a.x - b2.x;
            const dy = a.y - b2.y;
            const d2 = dx * dx + dy * dy;

            if (d2 > 0 && d2 < rr * rr) {
              const d = Math.sqrt(d2);
              const push = (rr - d) * 0.52;
              const nx = dx / d;
              const ny = dy / d;

              a.x += nx * push;
              a.y += ny * push;
              b2.x -= nx * push;
              b2.y -= ny * push;

              a.vx += nx * push * 8;
              a.vy += ny * push * 8;
              b2.vx -= nx * push * 8;
              b2.vy -= ny * push * 8;
            }
          }
        }
      }

      // obstacles update
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

      // paddle
      const p = paddleRef.current;
      if (
        isControlLocked(pNow) ||
        pNow === "quiz_prompt" ||
        pNow === "quiz_result" ||
        pNow === "gameover" ||
        pNow === "timeup"
      ) {
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

      // ball follow
      const b = ballRef.current;
      if (!b.released) {
        b.x = p.x;
        b.y = p.y - p.h / 2 - b.r - 8;
        b.vx = 0;
        b.vy = 0;
      }

      // ===== physics (substeps：貫通対策) =====
      if ((pNow === "playing" || pNow === "quiz_play") && b.released) {
        const minSp = 380;
        const maxSp = 700;

        const speed = Math.hypot(b.vx, b.vy);

        const stepDist = clamp(b.r * 0.45, 3, 9);
        const steps = clamp(Math.ceil((speed * dt) / stepDist), 1, 10);
        const stepDt = dt / steps;

        for (let si = 0; si < steps; si++) {
          b.x += b.vx * stepDt;
          b.y += b.vy * stepDt;

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

          // paddle
          const px1 = p.x - p.w / 2;
          const px2 = p.x + p.w / 2;
          const py1 = p.y - p.h / 2;
          const py2 = p.y + p.h / 2;

          if (circleRectHit(b.x, b.y, b.r, px1, py1, px2, py2) && b.vy > 0) {
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

          // obstacles (playing)
          if (pNow === "playing") {
            for (const o of obstaclesRef.current) {
              const ox1 = o.x - o.w / 2;
              const ox2 = o.x + o.w / 2;
              const oy1 = o.y - o.h / 2;
              const oy2 = o.y + o.h / 2;

              if (circleRectHit(b.x, b.y, b.r, ox1, oy1, ox2, oy2)) {
                resolveCircleRectBounce(b, ox1, oy1, ox2, oy2);
              }
            }
          }

          // ✅ quiz "逆T" bumper（横を長く）
          if (pNow === "quiz_play") {
            const barW = clamp(Math.min(w, h) * 0.72, 260, 520);
            const barH = 16;
            const barX = w / 2;
            const barY = h * 0.52;

            const hx1 = barX - barW / 2;
            const hx2 = barX + barW / 2;
            const hy1 = barY - barH / 2;
            const hy2 = barY + barH / 2;

            const vW = 16;
            const vx1 = barX - vW / 2;
            const vx2 = barX + vW / 2;

            const vy2 = hy1;
            const vy1 = 14;

            let hit = false;

            if (circleRectHit(b.x, b.y, b.r, hx1, hy1, hx2, hy2)) {
              resolveCircleRectBounce(b, hx1, hy1, hx2, hy2);
              hit = true;
            }
            if (circleRectHit(b.x, b.y, b.r, vx1, vy1, vx2, vy2)) {
              resolveCircleRectBounce(b, vx1, vy1, vx2, vy2);
              hit = true;
            }

            if (hit) {
              const sp = Math.hypot(b.vx, b.vy);
              const targetSp = clamp(sp, minSp, maxSp);
              const k = targetSp / (sp || 1);
              b.vx *= k;
              b.vy *= k;
            }
          }

          // target collision (playing)
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
                    const q = getQuizById(t.quizId);
                    setActiveQuiz(q);

                    b.released = false;
                    setPhase("quiz_prompt");
                  }
                }
                b.y += b.vy * 0.01;
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

          // quiz big targets（もっと大きく）
          if (pNow === "quiz_play") {
            const rBig = clamp(Math.min(w, h) * 0.1 * 1.65, 78, 150);
            const yBig = h * 0.3;

            const left = { x: w * 0.32, y: yBig, r: rBig };
            const right = { x: w * 0.68, y: yBig, r: rBig };

            if (dist2(b.x, b.y, left.x, left.y) <= (b.r + left.r) ** 2) {
              b.released = false;
              resolveQuiz("X");
              break;
            }
            if (dist2(b.x, b.y, right.x, right.y) <= (b.r + right.r) ** 2) {
              b.released = false;
              resolveQuiz("O");
              break;
            }
          }

          // fell
          if (b.y - b.r > h + 28) {
            if (pNow === "playing") setPhase("gameover");
            else if (pNow === "quiz_play") {
              b.released = false;
              runCountdown("quiz_play", true);
            }
            break;
          }
        }
      }

      // ===== DRAW =====
      // obstacles
      if (pNow === "playing") {
        for (const o of obstaclesRef.current) {
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 10);
          ctx.fill();
          ctx.restore();
        }
      }

      // targets
      if (
        pNow === "playing" ||
        pNow === "idle" ||
        pNow === "countdown" ||
        pNow === "serve_auto"
      ) {
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

      // quiz play targets + reverse T bumper
      if (pNow === "quiz_play") {
        const rBig = clamp(Math.min(w, h) * 0.1 * 1.65, 78, 150);
        const yBig = h * 0.3;

        drawBigXTarget(ctx, w * 0.32, yBig, rBig);
        drawBigOTarget(ctx, w * 0.68, yBig, rBig);

        const barW = clamp(Math.min(w, h) * 0.72, 260, 520);
        const barH = 16;
        const barX = w / 2;
        const barY = h * 0.52;

        const vW = 16;
        const topWall = 14;
        const vY1 = topWall;
        const vY2 = barY - barH / 2;
        const vH = Math.max(0, vY2 - vY1);

        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = "rgba(255,255,255,0.18)";

        roundRect(ctx, barX - vW / 2, vY1, vW, vH, 10);
        ctx.fill();

        roundRect(ctx, barX - barW / 2, barY - barH / 2, barW, barH, 10);
        ctx.fill();

        ctx.restore();
      }

      // paddle
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#e6e6e6";
      roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 12);
      ctx.fill();
      ctx.restore();

      // ball
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        b.x - b.r * 0.25,
        b.y - b.r * 0.25,
        b.r * 0.35,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fill();

      // countdown overlay
      if (
        pNow === "countdown" ||
        pNow === "serve_auto" ||
        pNow === "quiz_countdown"
      ) {
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
        const s =
          quizResult.delta >= 0 ? `+${quizResult.delta}` : `${quizResult.delta}`;
        ctx.fillText(
          `${s} / x${multiplierRef.current.toFixed(1)}`,
          w / 2,
          h * 0.5
        );
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [difficulty, timeLeft, countdown, quizResult, params]);

  useEffect(() => {
    const t = window.setTimeout(() => resetGame(true), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gamePage">
      <SiteHeader />

      <main className="gameMain">
        <div className="gameWrap" ref={wrapRef}>
          <div className="canvasShell">
            <div className="hudBar">
              <div className="hudItem">TIME: {timeLeft}s</div>
              <div className="hudItem">
                <ScoreText score={score} />
              </div>
              <div className="hudItem">
                <MultiplierText multiplier={multiplierUi} />
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className="gameCanvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {/* ✅ 最初の画面：STARTカード内にランキング追加（更新ボタンなし） */}
            {phase === "idle" && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="gStartGrid">
                    <div className="gStartLeft">
                      <div className="overlayTitle">Body Defense Hockey</div>
                      <div className="overlayText center">
                        難易度を選んで START
                      </div>

                      <div className="overlayRow">
                        <button
                          type="button"
                          className={
                            difficulty === "easy" ? "diffBtn on" : "diffBtn"
                          }
                          onClick={() => setDifficulty("easy")}
                        >
                          EASY
                        </button>
                        <button
                          type="button"
                          className={
                            difficulty === "normal" ? "diffBtn on" : "diffBtn"
                          }
                          onClick={() => setDifficulty("normal")}
                        >
                          NORMAL
                        </button>
                        <button
                          type="button"
                          className={
                            difficulty === "hard" ? "diffBtn on" : "diffBtn"
                          }
                          onClick={() => setDifficulty("hard")}
                        >
                          HARD
                        </button>
                      </div>

                      <button
                        type="button"
                        className="overlayPrimary"
                        onClick={startGameFlow}
                      >
                        START
                      </button>

                      <div className="overlayHint">操作：左右キー / スワイプ</div>
                    </div>

                    <div className="gStartRight">
                      <GameRankingMini limit={8} difficulty="all" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === "quiz_prompt" && activeQuiz && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">○×クイズ</div>
                  <div className="overlayText quizQuestion">{quizText}</div>
                  <button
                    type="button"
                    className="overlayPrimary"
                    onClick={onQuizConfirm}
                  >
                    クイズ開始
                  </button>
                </div>
              </div>
            )}

            {(phase === "gameover" || phase === "timeup") && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">
                    {phase === "gameover" ? "GAME OVER" : "TIME UP"}
                  </div>
                  <div className="overlayText center">SCORE: {score}</div>

                  <div className="overlayRow">
                    <button
                      type="button"
                      className="overlayPrimary ghost"
                      onClick={() => resetGame(false)}
                    >
                      TOP（ゲーム最初へ）
                    </button>
                    <button
                      type="button"
                      className="overlayPrimary"
                      onClick={startGameFlow}
                    >
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