// src/pages/game/Game.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import "./Game.css";

import { supabase } from "../../lib/supabase";

import { getConfig } from "./configs";
import { drawCell } from "./draw/drawCell";
import ScoreText from "./ui/ScoreText";
import MultiplierText from "./ui/MultiplierText";
import GameRankingMini from "./ui/GameRankingMini";

import { QUIZZES, ensureQuizSuffix, getQuizById } from "./quiz/quizzes";
import { getMyDisplayName, submitGameScore, fetchTopScores, type ScoreRow } from "./lib/scoreApi";

import type { Difficulty, Phase, Target, Obstacle, Motion, QuizChoice, TFQuiz } from "./types";

import {
  getOrCreateDeviceId,
  getSavedGuestName,
  setSavedGuestName,
  normalizeGuestName,
} from "./lib/guestName";

/* =========================
   Utils
========================= */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
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

function circleRectHit(cx: number, cy: number, cr: number, rx1: number, ry1: number, rx2: number, ry2: number) {
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

  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

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
function drawBigXTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
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
function drawBigOTarget(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
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
  ctx.lineWidth = Math.max(12, r * 0.2);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/* =========================
   Rewards / Coupon
========================= */

type CouponRewardRow = {
  id: string;
  is_active: boolean;
  store_name: string;
  store_info: string | null;
  product_name: string;
  score_threshold: number;
  coupon_title: string;
  description: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
};

type IssuedCouponView = {
  token: string;
  redeem_url: string;
  qr_png_base64: string | null;
  qr_svg: string | null;
  expires_at: string | null;

  coupon_title: string | null;
  store_name: string | null;
  product_name: string | null;
  description: string | null;
  score_threshold: number | null;
};

type CouponUiState =
  | { status: "idle" }
  | { status: "issuing" }
  | { status: "issued"; coupon: IssuedCouponView };

const COUPON_STORAGE_KEY = "game_last_coupon_v1";
const COUPON_STORAGE_KEY_ARRAY = "game_last_coupons_v1"; // ←追加

/* ✅ クーポン（報酬ごと1回）にしたので「全部1回」は使わない */
function isInValidWindow(r: CouponRewardRow, now = new Date()): boolean {
  const fromOk = !r.valid_from || now >= new Date(r.valid_from);
  const toOk = !r.valid_to || now <= new Date(r.valid_to);
  return fromOk && toOk;
}

async function fetchActiveRewards(): Promise<{ ok: true; rows: CouponRewardRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("coupon_rewards")
    .select("id,is_active,store_name,store_info,product_name,score_threshold,coupon_title,description,valid_from,valid_to")
    .eq("is_active", true)
    .order("score_threshold", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as CouponRewardRow[] };
}

function pickEligibleReward(rewards: CouponRewardRow[], score: number): CouponRewardRow | null {
  const now = new Date();
  const eligible = rewards
    .filter((r) => r.is_active)
    .filter((r) => Number(r.score_threshold) <= score)
    .filter((r) => isInValidWindow(r, now));

  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1] ?? null;
}

/* ✅ guest-name: 全体一意チェック＆予約 */
async function reserveGuestName(name: string, deviceId: string): Promise<
  | { ok: true; available: true }
  | { ok: true; available: false; reason: "taken" }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke("guest-name", {
      body: { name, device_id: deviceId },
    });
    if (error) return { ok: false, error: error.message };

    const obj = (data ?? null) as Record<string, unknown> | null;
    const ok = obj?.ok === true;
    if (!ok) return { ok: false, error: String(obj?.error ?? "guest-name failed") };

    const available = obj?.available === true;
    if (!available) return { ok: true, available: false, reason: "taken" };

    return { ok: true, available: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * ✅ issue-coupon: あなたのEdge Function返却に合わせる
 * 重要：device_id と display_name を必ず渡す（ゲストでも発行される）
 */
async function issueCouponByEdge(args: {
  score: number;
  difficulty: Difficulty;
  deviceId: string;
  displayName: string;
}): Promise<
  | { ok: true; issued: boolean; coupon?: IssuedCouponView; reason?: string }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke("issue-coupon", {
      body: {
        score: args.score,
        difficulty: args.difficulty,
        device_id: args.deviceId,
        display_name: args.displayName,
      },
    });

    if (error) return { ok: false, error: error.message };

    const obj = data as Record<string, unknown> | null;
    const ok = obj?.ok === true;
    if (!ok) return { ok: false, error: String(obj?.error ?? "issue-coupon failed") };

    const issued = obj?.issued === true;
    const reason = typeof obj?.reason === "string" ? obj.reason : undefined;

    if (!issued) return { ok: true, issued: false, reason };

    const token = typeof obj?.token === "string" ? obj.token : "";
    const redeem_url = typeof obj?.redeem_url === "string" ? obj.redeem_url : "";
    const qr_png_base64 = typeof obj?.qr_png_base64 === "string" ? obj.qr_png_base64 : null;
    const qr_svg = typeof obj?.qr_svg === "string" ? obj.qr_svg : null;
    const expires_at = typeof obj?.expires_at === "string" ? obj.expires_at : null;

    const reward = (obj?.reward ?? null) as Record<string, unknown> | null;

    const coupon: IssuedCouponView = {
      token,
      redeem_url,
      qr_png_base64,
      qr_svg,
      expires_at,

      coupon_title: typeof reward?.coupon_title === "string" ? (reward.coupon_title as string) : null,
      store_name: typeof reward?.store_name === "string" ? (reward.store_name as string) : null,
      product_name: typeof reward?.product_name === "string" ? (reward.product_name as string) : null,
      description: typeof reward?.description === "string" ? (reward.description as string) : null,
      score_threshold: typeof reward?.score_threshold === "number" ? (reward.score_threshold as number) : null,
    };

    return { ok: true, issued: true, coupon };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* =========================
   Top50 Ranking (inline)
========================= */
function RankTop50({ difficulty }: { difficulty: "all" | Difficulty }) {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      const res = await fetchTopScores({ difficulty, limit: 50 });
      if (!mounted) return;

      if (!res.ok) {
        setErr(res.error);
        setRows([]);
      } else {
        setRows(res.rows.slice(0, 50));
      }
      setLoading(false);
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [difficulty]);

  return (
    <div className="gSectionCard">
      <div className="gSectionHead">
        <div className="gSectionTitle">ランキング（TOP50）</div>
        <div className="gSectionSub">{difficulty === "all" ? "全体" : difficulty.toUpperCase()}</div>
      </div>

      {loading && <div className="gSectionInfo">読み込み中…</div>}
      {err && <div className="gSectionErr">取得失敗：{err}</div>}

      {!loading && !err && (
        <>
          {rows.length === 0 ? (
            <div className="gSectionInfo">まだ記録がありません</div>
          ) : (
            <div className="gRank50Wrap">
              <table className="gRank50Table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>名前</th>
                    <th>スコア</th>
                    <th>難易度</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="num">{i + 1}</td>
                      <td className="name">{(r.display_name ?? "").trim() || "ゲスト"}</td>
                      <td className="score">{r.score}</td>
                      <td className="diff">{String(r.difficulty).toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Game() {
  const nav = useNavigate();

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

  const [quizResult, setQuizResult] = useState<null | { correct: boolean; delta: number }>(null);

  const paddleRef = useRef({ x: 0, y: 0, w: 150, h: 16 });
  const ballRef = useRef({ x: 0, y: 0, r: 12, vx: 0, vy: 0, released: false });

  const targetsRef = useRef<Target[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);

  const keysRef = useRef({ left: false, right: false });
  const pointerRef = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  const lastTsRef = useRef(0);

  const scoreSentRef = useRef(false);
  const couponTriedRef = useRef(false);
  const [couponUi, setCouponUi] = useState<CouponUiState>({ status: "idle" });

  const [rewardRows, setRewardRows] = useState<CouponRewardRow[]>([]);
  const [rewardLoading, setRewardLoading] = useState(true);
  const [rewardErr, setRewardErr] = useState<string | null>(null);

  // ✅ 端末ID（クーポン・名前に使う）
  const deviceIdRef = useRef<string>("");
  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
  }, []);

  // ✅ ログイン名（ログイン時）
  const displayNameRef = useRef("ゲスト");
  const userIdRef = useRef<string | null>(null);
  const isGuestRef = useRef(true);

  // ✅ ゲスト名UI
  const [guestName, setGuestName] = useState<string>(() => getSavedGuestName() ?? "");
  const [guestEditing, setGuestEditing] = useState<boolean>(() => !getSavedGuestName());
  const [guestMsg, setGuestMsg] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    getMyDisplayName().then((v) => {
      displayNameRef.current = v.displayName;
      userIdRef.current = v.userId;
      isGuestRef.current = v.isGuest;

      // ログインしてたらゲスト入力UI不要
      if (!v.isGuest) {
        setGuestEditing(false);
        setGuestMsg(null);
      } else {
        // ゲストなら保存名があれば使う
        const saved = getSavedGuestName();
        if (saved) {
          displayNameRef.current = saved;
          setGuestName(saved);
          setGuestEditing(false);
        } else {
          displayNameRef.current = "ゲスト";
          setGuestEditing(true);
        }
      }
    });
  }, []);

  // ✅ rewards 読み込み
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setRewardLoading(true);
      setRewardErr(null);
      const res = await fetchActiveRewards();
      if (!mounted) return;

      if (!res.ok) {
        setRewardRows([]);
        setRewardErr(res.error);
      } else {
        setRewardRows(res.rows);
      }
      setRewardLoading(false);
    };
    void run();
    return () => {
      mounted = false;
    };
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
  }, []);

  const isControlLocked = (p: Phase) => p === "countdown" || p === "serve_auto" || p === "quiz_countdown";

  /* =========================
     ✅ ゲスト名確定（予約）
  ========================= */
  const confirmGuestName = async () => {
    if (!isGuestRef.current) return true;

    setGuestMsg(null);

    const name = normalizeGuestName(guestName);
    if (!name) {
      setGuestMsg("名前を入力してください（1〜12文字）");
      return false;
    }

    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    setGuestBusy(true);

    const res = await reserveGuestName(name, deviceId);

    setGuestBusy(false);

    if (!res.ok) {
      setGuestMsg(`登録できませんでした：${res.error}`);
      return false;
    }
    if (res.available === false) {
      setGuestMsg("この名前は使用できません（すでに使われています）");
      return false;
    }

    // ✅ OK：上書き保存
    setSavedGuestName(name);
    setGuestName(name);
    displayNameRef.current = name;

    setGuestEditing(false);
    setGuestMsg("OK！この名前でプレイします");
    window.setTimeout(() => setGuestMsg(null), 1200);
    return true;
  };

    /* =========================
     Resize / DPR  ✅ iOS対策：スクロールで高さが変わっても再計算しない
  ========================= */
  const baseCanvasCssHRef = useRef<number | null>(null);
  const lastCssWRef = useRef<number>(0);
  const lastDprRef = useRef<number>(1);

  useEffect(() => {
    const apply = (force = false) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const rect = wrap.getBoundingClientRect();

      // iOSのスクロールでinnerHeightが変わるのを拾わないため、
      // 「幅が変わった時だけ」canvas高さを作り直す
      const cssW = Math.max(1, rect.width);

      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

      const widthChanged = Math.abs(cssW - lastCssWRef.current) > 1;
      const dprChanged = dpr !== lastDprRef.current;

      // 初回 or 幅変更 or DPR変更 or force のときだけ高さを決め直す
      if (force || baseCanvasCssHRef.current == null || widthChanged || dprChanged) {
        // ✅ ここは「最初に決めた高さ」を使い続ける
        // 初回だけ innerHeight を参照する（以降、スクロールでは変えない）
        const baseH =
          baseCanvasCssHRef.current ?? Math.min(window.innerHeight * 0.72, 760);

        baseCanvasCssHRef.current = baseH;
        lastCssWRef.current = cssW;
        lastDprRef.current = dpr;

        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${baseH}px`;
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(baseH * dpr);

        // レイアウト更新した時だけリセット（スクロール由来では呼ばれない）
        resetGame(true);
        return;
      }

      // ✅ スクロールで高さだけ変わったケースは何もしない（縦幅固定）
      // ただし、幅は同じでもcanvasのCSSが外部要因で変わってたら戻す（保険）
      const currentW = parseFloat(canvas.style.width || "0");
      if (Math.abs(currentW - cssW) > 1) {
        canvas.style.width = `${cssW}px`;
      }
    };

    // 初回
    apply(true);

    const onResize = () => apply(false);
    const onOrientation = () => {
      // 回転したら「高さも作り直し」したいので base をリセット
      baseCanvasCssHRef.current = null;
      apply(true);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
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
      window.removeEventListener("keydown", onDown as unknown as EventListener);
      window.removeEventListener("keyup", onUp as unknown as EventListener);
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
    if (isControlLocked(pNow) || pNow === "quiz_prompt" || pNow === "quiz_result" || pNow === "gameover" || pNow === "timeup") return;

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

    const baseR = clamp(Math.min(w, h) * 0.06, params.baseR.min, params.baseR.max);

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
          clamp(spBase * 220, 120, 340) * (difficulty === "hard" ? 1.15 : difficulty === "normal" ? 1.05 : 0.95);

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
    couponTriedRef.current = false;
    setCouponUi({ status: "idle" });

    try {
      sessionStorage.removeItem(COUPON_STORAGE_KEY);
    } catch {
      // noop
    }

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

    paddleRef.current = { x: w / 2, y: h - 64, w: clamp(w * 0.24, 110, 190), h: 16 };

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

  const startGameFlow = async () => {
    // ✅ ゲストは名前確定が先
    if (isGuestRef.current) {
      const ok = await confirmGuestName();
      if (!ok) return;
    }

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
     ✅ GAME OVER / TIME UP
  ========================= */
  useEffect(() => {
  if (phase !== "gameover" && phase !== "timeup") return;

  // ✅ いまの表示名（ゲストは保存名、ログインはprofiles名）
  const nameNow = isGuestRef.current
    ? (getSavedGuestName() ?? displayNameRef.current)
    : displayNameRef.current;

  // ①スコア送信（1回だけ）
  if (!scoreSentRef.current) {
    scoreSentRef.current = true;

    submitGameScore({
      score: scoreRef.current,
      difficulty,
      displayNameOverride: nameNow,
    }).then((res) => {
      if (!res.ok) console.warn("score submit failed:", res.error);
    });
  }

  // ②クーポン（1回だけ）
  if (couponTriedRef.current) return;
  couponTriedRef.current = true;

  (async () => {
    // ✅ issuing を「達成した時だけ」出す
    if (rewardRows.length > 0) {
      const eligible = pickEligibleReward(rewardRows, scoreRef.current);
      if (!eligible) return;
      setCouponUi({ status: "issuing" });
    }

    const deviceId = deviceIdRef.current || getOrCreateDeviceId();

    // ✅ 複数発行：issued=false になるまで回す（安全上限）
    const issuedCoupons: IssuedCouponView[] = [];
    const MAX_LOOP = 6;

    for (let i = 0; i < MAX_LOOP; i++) {
      const res = await issueCouponByEdge({
        score: scoreRef.current,
        difficulty,
        deviceId,
        displayName: nameNow || "ゲスト",
      });

      if (!res.ok) {
        console.warn("coupon issue failed:", res.error);
        break;
      }
      if (!res.issued || !res.coupon) break;

      issuedCoupons.push(res.coupon);
    }

    if (issuedCoupons.length === 0) {
      setCouponUi({ status: "idle" });
      return;
    }

    // ✅ 互換：最後の1枚（従来キー）
    try {
      sessionStorage.setItem(
        COUPON_STORAGE_KEY,
        JSON.stringify(issuedCoupons[issuedCoupons.length - 1]),
      );
    } catch {
      // noop
    }

    // ✅ 本命：配列キー（一覧用）
    try {
      sessionStorage.setItem(COUPON_STORAGE_KEY_ARRAY, JSON.stringify(issuedCoupons));
    } catch {
      // noop
    }

    setCouponUi({ status: "issued", coupon: issuedCoupons[0] });
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.globalAlpha = 1;

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
              (difficulty === "hard" ? 1.25 : difficulty === "normal" ? 1.12 : 1.0);

            const a = rand(0, Math.PI * 2);
            const bias =
              t.motion === "circle" ? 1.05 : t.motion === "zigzag" ? 1.12 : t.motion === "drift" ? 1.18 : 1.0;

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

      const p = paddleRef.current;
      if (isControlLocked(pNow) || pNow === "quiz_prompt" || pNow === "quiz_result" || pNow === "gameover" || pNow === "timeup") {
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

      const b = ballRef.current;
      if (!b.released) {
        b.x = p.x;
        b.y = p.y - p.h / 2 - b.r - 8;
        b.vx = 0;
        b.vy = 0;
      }

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

      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#e6e6e6";
      roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 12);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fill();

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
        ctx.fillText(`${s} / x${multiplierRef.current.toFixed(1)}`, w / 2, h * 0.5);
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

  const gameTitle = "がん細胞をたおして、乳がんについて学ぼう！";
  const lockEndButtons = couponUi.status === "issuing" || couponUi.status === "issued";

  const isGuest = isGuestRef.current;

  return (
    <div className="gamePage">
      <SiteHeader />

      <main className="gameMain">
        <div className="gameWrap" ref={wrapRef}>
          <div className="canvasShell">
            <div className="hudBar">
              <div className="hudItem">TIME: {timeLeft}s</div>
              <div className="hudItem"><ScoreText score={score} /></div>
              <div className="hudItem"><MultiplierText multiplier={multiplierUi} /></div>
            </div>

            <canvas
              ref={canvasRef}
              className="gameCanvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {phase === "idle" && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="gStartGrid">
                    <div className="gStartLeft">
                      <div className="overlayTitle">{gameTitle}</div>

                      {/* ✅ ゲスト名（プレイ前） */}
                      {isGuest ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontWeight: 900, opacity: 0.92, marginBottom: 6 }}>
                            ゲスト名（ランキング/クーポン表示に使用）
                          </div>

                          {!guestEditing ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 950, fontSize: 16 }}>
                                {getSavedGuestName() ?? guestName ?? "ゲスト"}
                              </div>
                              <button
                                type="button"
                                className="overlayPrimary ghost"
                                style={{ width: "auto", padding: "10px 12px" }}
                                onClick={() => {
                                  setGuestEditing(true);
                                  setGuestMsg(null);
                                }}
                              >
                                変更
                              </button>
                            </div>
                          ) : (
                            <>
                              <input
                                className="input"
                                value={guestName}
                                onChange={(e) => {
                                  setGuestName(e.target.value);
                                  setGuestMsg(null);
                                }}
                                placeholder="（1〜12文字）"
                                style={{
                                  width: "100%",
                                  padding: "12px 12px",
                                  borderRadius: 14,
                                  border: "1px solid rgba(255,255,255,0.16)",
                                  background: "rgba(255,255,255,0.06)",
                                  color: "#fff",
                                  fontWeight: 900,
                                  outline: "none",
                                }}
                              />
                              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="overlayPrimary"
                                  style={{ width: "auto", padding: "10px 14px" }}
                                  disabled={guestBusy}
                                  onClick={() => void confirmGuestName()}
                                >
                                  {guestBusy ? "確認中…" : "この名前で決定"}
                                </button>
                                <button
                                  type="button"
                                  className="overlayPrimary ghost"
                                  style={{ width: "auto", padding: "10px 14px" }}
                                  onClick={() => {
                                    const saved = getSavedGuestName();
                                    if (saved) {
                                      setGuestName(saved);
                                      setGuestEditing(false);
                                      setGuestMsg(null);
                                    } else {
                                      setGuestMsg("名前を決めてください");
                                    }
                                  }}
                                >
                                  キャンセル
                                </button>
                              </div>
                            </>
                          )}

                          {guestMsg ? (
                            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.85 }}>
                              {guestMsg.startsWith("OK") ? (
                                <span style={{ color: "rgba(150,255,180,0.95)" }}>{guestMsg}</span>
                              ) : (
                                <span style={{ color: "rgba(255,160,160,0.95)" }}>{guestMsg}</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="overlayText center" style={{ marginBottom: 12 }}>
                          ログイン中：{displayNameRef.current}
                        </div>
                      )}

                      <div className="overlayText center">難易度を選んで START</div>

                      <div className="overlayRow">
                        <button type="button" className={difficulty === "easy" ? "diffBtn on" : "diffBtn"} onClick={() => setDifficulty("easy")}>
                          EASY
                        </button>
                        <button type="button" className={difficulty === "normal" ? "diffBtn on" : "diffBtn"} onClick={() => setDifficulty("normal")}>
                          NORMAL
                        </button>
                        <button type="button" className={difficulty === "hard" ? "diffBtn on" : "diffBtn"} onClick={() => setDifficulty("hard")}>
                          HARD
                        </button>
                      </div>

                      <button
                        type="button"
                        className="overlayPrimary"
                        onClick={() => void startGameFlow()}
                        disabled={isGuest && (guestEditing || !(getSavedGuestName() ?? "").trim())}
                      >
                        START
                      </button>

                      {isGuest && (guestEditing || !(getSavedGuestName() ?? "").trim()) ? (
                        <div className="overlayHint" style={{ color: "rgba(255,170,170,0.95)" }}>
                          ※ゲスト名を決定してからSTARTできます
                        </div>
                      ) : (
                        <div className="overlayHint">操作：左右キー / スワイプ</div>
                      )}
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
                  <button type="button" className="overlayPrimary" onClick={onQuizConfirm}>
                    クイズ開始
                  </button>
                </div>
              </div>
            )}

            {(phase === "gameover" || phase === "timeup") && (
              <div className="overlay">
                <div className="overlayCard">
                  <div className="overlayTitle">{phase === "gameover" ? "GAME OVER" : "TIME UP"}</div>
                  <div className="overlayText center">SCORE: {score}</div>

                  {couponUi.status === "issuing" && (
                    <div className="overlayText center" style={{ marginTop: 12 }}>
                      クーポン発行中…
                    </div>
                  )}

                  {couponUi.status === "issued" ? (
                    <div style={{ textAlign: "center", marginTop: 14 }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>🎉 クーポン獲得！</div>
                      <button type="button" className="overlayPrimary" onClick={() => nav("/game/coupons")}>
  獲得クーポン一覧を見る
</button>
                    </div>
                  ) : null}

                  {!lockEndButtons && (
                    <div className="overlayRow" style={{ marginTop: 14 }}>
                      <button type="button" className="overlayPrimary ghost" onClick={() => resetGame(false)}>
                        TOP（ゲーム最初へ）
                      </button>
                      <button type="button" className="overlayPrimary" onClick={() => void startGameFlow()}>
                        もう一度
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 下セクション */}
          <div className="gBelow">
            <div className="gSectionCard">
              <div className="gSectionHead">
                <div className="gSectionTitle">スコア達成で報酬ゲット</div>
                <div className="gSectionSub">達成するとクーポンが出る（報酬ごとに端末1回）</div>
              </div>

              {rewardLoading ? (
                <div className="gSectionInfo">読み込み中…</div>
              ) : rewardErr ? (
                <div className="gSectionErr">取得失敗：{rewardErr}</div>
              ) : rewardRows.length === 0 ? (
                <div className="gSectionInfo">現在、配布中の報酬がありません</div>
              ) : (
                <ul className="gRewardList">
  {rewardRows
    .slice()
    .sort((a, b) => Number(a.score_threshold) - Number(b.score_threshold))
    .map((r) => (
      <li key={r.id}>
        <button
          type="button"
          className="gRewardItemBtn"
          onClick={() => nav(`/game/reward/${r.id}`)}
        >
          <span className="badge">{r.score_threshold}点</span>
          {r.coupon_title || "（タイトル未設定）"}
        </button>
      </li>
    ))}
</ul>
              )}

              <div className="gSectionNote">※報酬は「coupon_rewards」の設定がそのまま表示されます</div>
            </div>

            <div className="gSectionCard">
              <div className="gSectionHead">
                <div className="gSectionTitle">遊び方</div>
                <div className="gSectionSub">操作・ルール</div>
              </div>

              <div className="gHowto">
                <div className="step">
                  <div className="n">1</div>
                  <div className="t">左右キー / スワイプでバーを動かしてボールを落とさない</div>
                </div>
                <div className="step">
                  <div className="n">2</div>
                  <div className="t">「?」に当たると○×クイズ！ボールで○/×に当てて回答</div>
                </div>
                <div className="step">
                  <div className="n">3</div>
                  <div className="t">高スコアで報酬が出たら「詳細を確認する」からQRを表示</div>
                </div>
              </div>

              <div className="gHowtoImgs">
                <div className="gHowtoImgPh">ここに説明画像①（後で差し替え）</div>
                <div className="gHowtoImgPh">ここに説明画像②（後で差し替え）</div>
                <div className="gHowtoImgPh">ここに説明画像③（後で差し替え）</div>
              </div>
            </div>

            <RankTop50 difficulty="all" />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}