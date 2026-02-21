// src/pages/game/lib/adminScoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

export type AdminScoreRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  display_name: string;
  score: number;
  difficulty: Difficulty;
  is_guest: boolean;
};

export async function adminFetchScores(args: {
  q?: string; // 名前検索（部分一致）
  difficulty?: "all" | Difficulty;
  from?: string; // "YYYY-MM-DD"
  to?: string;   // "YYYY-MM-DD"
  limit?: number;
}): Promise<{ ok: true; rows: AdminScoreRow[] } | { ok: false; error: string }> {
  try {
    const {
      q = "",
      difficulty = "all",
      from = "",
      to = "",
      limit = 200,
    } = args;

    let query = supabase
      .from("game_scores")
      .select("id, created_at, user_id, display_name, score, difficulty, is_guest")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (difficulty !== "all") query = query.eq("difficulty", difficulty);

    if (q.trim()) query = query.ilike("display_name", `%${q.trim()}%`);

    // 期間（created_at は timestamptz想定）
    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as AdminScoreRow[] };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function adminDeleteScoreById(id: string) {
  try {
    const { error } = await supabase.from("game_scores").delete().eq("id", id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function adminDeleteScoresByRange(args: {
  from: string; // "YYYY-MM-DD"
  to: string;   // "YYYY-MM-DD"
  difficulty?: "all" | Difficulty;
}) {
  try {
    const { from, to, difficulty = "all" } = args;

    let q = supabase
      .from("game_scores")
      .delete()
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`);

    if (difficulty !== "all") q = q.eq("difficulty", difficulty);

    const { error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : "unknown" };
  }
}