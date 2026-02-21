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

// ✅ Game.tsx で先に名前を確保する用（400回避：profilesの実在列だけ読む）
export async function getMyDisplayName(): Promise<{
  displayName: string;
  userId: string | null;
  isGuest: boolean;
}> {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      return { displayName: "ゲスト", userId: null, isGuest: true };
    }

    const user = authData.user;

    // ✅ profilesには「name」しか無い前提（スクショ通り）
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      console.warn("profiles read failed:", profErr);
      // 失敗したらメール等から最低限作る
      const fallback =
        (user.user_metadata?.name as string | undefined)?.trim() ||
        user.email?.split("@")[0] ||
        "ユーザー";
      return { displayName: fallback, userId: user.id, isGuest: false };
    }

    const name = (prof?.name as string | undefined)?.trim();
    const displayName =
      name ||
      (user.user_metadata?.name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "ユーザー";

    return { displayName, userId: user.id, isGuest: false };
  } catch {
    return { displayName: "ゲスト", userId: null, isGuest: true };
  }
}

export async function submitGameScore(args: {
  score: number;
  difficulty: Difficulty;

  // ✅ Game.tsx 側で確保した名前を渡せる
  displayNameOverride?: string;
  isGuestOverride?: boolean;
  userIdOverride?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { score, difficulty, displayNameOverride, isGuestOverride, userIdOverride } = args;

  try {
    // ✅ override があればそれを最優先
    if (displayNameOverride != null) {
      const { error } = await supabase.from("game_scores").insert({
        user_id: userIdOverride ?? null,
        display_name: displayNameOverride.trim() || "ユーザー",
        score,
        difficulty,
        is_guest: Boolean(isGuestOverride),
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    // --- 従来通り（保険）
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
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

    const user = authData.user;

    // profiles.name を取りに行く（400回避：nameだけ）
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) console.warn("profiles read failed:", profErr);

    const picked = (prof?.name as string | undefined)?.trim() || "";
    const displayName =
      picked ||
      (user.user_metadata?.name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "ユーザー";

    const { error } = await supabase.from("game_scores").insert({
      user_id: user.id,
      display_name: displayName,
      score,
      difficulty,
      is_guest: false,
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