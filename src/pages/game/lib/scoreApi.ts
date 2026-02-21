// src/pages/game/lib/scoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

export type ScoreRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  display_name: string;
  score: number;
  difficulty: Difficulty;
  is_guest: boolean;
};

export async function submitGameScore(args: {
  score: number;
  difficulty: Difficulty;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { score, difficulty } = args;

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: null,
        display_name: "ゲスト",
        score,
        difficulty,
        is_guest: true,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const user = authData.user ?? null;

    let displayName = "ゲスト";
    let isGuest = true;
    let userId: string | null = null;

    if (user) {
      userId = user.id;
      isGuest = false;

      const { data: prof } = await supabase
        .from("profiles")
        .select("name, display_name, username, full_name")
        .eq("id", user.id)
        .maybeSingle();

      displayName =
        (prof?.display_name as string | undefined) ||
        (prof?.name as string | undefined) ||
        (prof?.username as string | undefined) ||
        (prof?.full_name as string | undefined) ||
        user.email?.split("@")[0] ||
        "Player";
    }

    const { error } = await supabase.from("game_scores").insert({
      user_id: userId,
      display_name: displayName,
      score,
      difficulty,
      is_guest: isGuest,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}

export async function fetchTopScores(args: {
  difficulty?: Difficulty | "all";
  limit?: number;
}): Promise<{ ok: true; rows: ScoreRow[] } | { ok: false; error: string }> {
  const { difficulty = "all", limit = 20 } = args;

  try {
    let q = supabase
      .from("game_scores")
      .select("id, created_at, user_id, display_name, score, difficulty, is_guest")
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (difficulty !== "all") q = q.eq("difficulty", difficulty);

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as ScoreRow[] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}