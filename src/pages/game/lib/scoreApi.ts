// src/pages/game/lib/scoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

export type SubmitScoreArgs = {
  score: number;
  difficulty: Difficulty;
  displayNameOverride?: string;
  userIdOverride?: string | null;
  isGuestOverride?: boolean;
};

export type SubmitScoreResult = { ok: true } | { ok: false; error: string };

export type GameScoreRow = {
  id: string;
  user_id: string | null;
  is_guest: boolean;
  display_name: string;
  score: number;
  difficulty: Difficulty;
  created_at?: string;
};

// ✅ Ranking側が求めてる型名を必ずexport（これでTSエラー消える）
export type ScoreRow = GameScoreRow;

export async function getMyDisplayName(): Promise<{
  displayName: string;
  userId: string | null;
  isGuest: boolean;
}> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    if (!userId) {
      return { displayName: "ゲスト", userId: null, isGuest: true };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return { displayName: "ユーザー", userId, isGuest: false };
    }

    const dn = (data as { name?: unknown } | null)?.name;
    return { displayName: String(dn || "ユーザー"), userId, isGuest: false };
  } catch {
    return { displayName: "ゲスト", userId: null, isGuest: true };
  }
}

/**
 * ✅ ランキング重複対策：
 * - guest: 毎回insert（複数OK）
 * - login: user_id + difficulty で 1行にまとめる（ベスト更新）
 */
export async function submitGameScore(
  args: SubmitScoreArgs
): Promise<SubmitScoreResult> {
  const score = Math.max(0, Math.floor(args.score || 0));
  const difficulty = args.difficulty;

  const { data: authRes, error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, error: authErr.message };

  const authedUserId = authRes?.user?.id ?? null;
  const userId = args.userIdOverride ?? authedUserId;

  const isGuest = args.isGuestOverride ?? !userId;
  const displayName = (args.displayNameOverride ?? "ゲスト").trim() || "ゲスト";

  try {
    if (isGuest || !userId) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: null,
        is_guest: true,
        display_name: displayName,
        score,
        difficulty,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const { data: existing, error: selErr } = await supabase
      .from("game_scores")
      .select("score")
      .eq("user_id", userId)
      .eq("difficulty", difficulty)
      .maybeSingle();

    if (selErr) return { ok: false, error: selErr.message };

    if (!existing) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: userId,
        is_guest: false,
        display_name: displayName,
        score,
        difficulty,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const oldScore = Number((existing as { score?: unknown } | null)?.score ?? 0);
    if (score <= oldScore) return { ok: true };

    const { error: updErr } = await supabase
      .from("game_scores")
      .update({
        score,
        display_name: displayName,
        is_guest: false,
      })
      .eq("user_id", userId)
      .eq("difficulty", difficulty);

    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true };
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as any).message) : String(e);
    return { ok: false, error: msg };
  }
}

export async function fetchTopScores(args: {
  limit?: number;
  difficulty?: Difficulty | "all";
}): Promise<{ ok: true; rows: GameScoreRow[] } | { ok: false; error: string }> {
  const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));
  const diff = args.difficulty ?? "all";

  try {
    let q = supabase
      .from("game_scores")
      .select("id,user_id,is_guest,display_name,score,difficulty,created_at")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (diff !== "all") q = q.eq("difficulty", diff);

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };

    return { ok: true, rows: (data ?? []) as GameScoreRow[] };
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e ? String((e as any).message) : String(e);
    return { ok: false, error: msg };
  }
}