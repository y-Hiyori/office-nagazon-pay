// src/pages/game/lib/scoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

/* =========================
   Types
========================= */

export type ScoreRow = {
  id: string;
  score: number;
  difficulty: Difficulty | string;
  display_name: string | null;
  user_id: string | null;
  is_guest: boolean | null;
  created_at?: string | null;
};

export type FetchTopScoresArgs = {
  limit?: number;
  difficulty?: "all" | Difficulty;
};

export type FetchTopScoresResult =
  | { ok: true; rows: ScoreRow[] }
  | { ok: false; error: string };

export type MyDisplayNameResult = {
  displayName: string;
  userId: string | null;
  isGuest: boolean;
};

export type SubmitArgs = {
  score: number;
  difficulty: Difficulty;
  displayNameOverride?: string | null;

  // Game.tsx 互換用（偽装には使わない）
  userIdOverride?: string | null;
  isGuestOverride?: boolean;
};

export type SubmitResult =
  | { ok: true; mode: "guest_insert" | "user_best_update" | "user_skip" }
  | { ok: false; error: string };

/* =========================
   Utils
========================= */

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function safeName(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "Guest";
  return s.slice(0, 20);
}

/* =========================
   Public: fetchTopScores
========================= */

export async function fetchTopScores(args: FetchTopScoresArgs): Promise<FetchTopScoresResult> {
  try {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 10)));
    const difficulty = args.difficulty ?? "all";

    let q = supabase
      .from("game_scores")
      .select("id, score, difficulty, display_name, user_id, is_guest, created_at")
      .order("score", { ascending: false })
      .limit(limit);

    if (difficulty !== "all") {
      q = q.eq("difficulty", difficulty);
    }

    const { data, error } = await q;

    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as ScoreRow[];
    return { ok: true, rows };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* =========================
   Public: getMyDisplayName
========================= */

export async function getMyDisplayName(): Promise<MyDisplayNameResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { displayName: "ゲスト", userId: null, isGuest: true };

  const session = data.session ?? null;
  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  if (!userId || !user) return { displayName: "ゲスト", userId: null, isGuest: true };

  const md = user.user_metadata as Record<string, unknown> | undefined;
  const d1 = typeof md?.display_name === "string" ? md.display_name : "";
  const d2 = typeof md?.name === "string" ? md.name : "";
  const displayName = (d1 || d2 || "User").trim().slice(0, 20);

  return { displayName, userId, isGuest: false };
}

/* =========================
   Public: submitGameScore
========================= */

export async function submitGameScore(args: SubmitArgs): Promise<SubmitResult> {
  try {
    const score = clampScore(args.score);
    const difficulty = args.difficulty;

    const { data: sessRes, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) console.warn("getSession failed:", sessErr.message);

    const session = sessRes?.session ?? null;
    const user = session?.user ?? null;
    const userId = user?.id ?? null;

    // ==========================
    // ✅ ゲスト：毎回insert
    // ==========================
    if (!userId || !user) {
      const displayName = safeName(args.displayNameOverride ?? "Guest");

      const { error } = await supabase.from("game_scores").insert({
        user_id: null,
        is_guest: true,
        display_name: displayName,
        difficulty,
        score,
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true, mode: "guest_insert" };
    }

    const md = user.user_metadata as Record<string, unknown> | undefined;

    const displayName = safeName(
      args.displayNameOverride ??
        (typeof md?.display_name === "string" ? md.display_name : undefined) ??
        (typeof md?.name === "string" ? md.name : undefined) ??
        "User"
    );

    // ==========================
    // ✅ ログイン：自己ベスト管理（user_id + difficulty を1行に）
    // ==========================
    const { data: existing, error: selErr } = await supabase
      .from("game_scores")
      .select("id, score")
      .eq("user_id", userId)
      .eq("difficulty", difficulty)
      .eq("is_guest", false)
      .maybeSingle();

    if (selErr) return { ok: false, error: selErr.message };

    if (!existing) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: userId,
        is_guest: false,
        display_name: displayName,
        difficulty,
        score,
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true, mode: "user_best_update" };
    }

    const best = clampScore(existing.score);
    if (score <= best) return { ok: true, mode: "user_skip" };

    const { error: updErr } = await supabase
      .from("game_scores")
      .update({ score, display_name: displayName })
      .eq("id", existing.id);

    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, mode: "user_best_update" };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}