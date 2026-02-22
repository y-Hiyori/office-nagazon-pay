// src/pages/game/lib/scoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

type SubmitArgs = {
  score: number;
  difficulty: Difficulty;
  displayNameOverride?: string | null;
};

type SubmitOk = {
  ok: true;
  mode: "guest_insert" | "user_best_update" | "user_skip";
};

type SubmitNg = {
  ok: false;
  error: string;
};

export type SubmitResult = SubmitOk | SubmitNg;

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
    if (!userId) {
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

    // ここに来た時点で user は必ず存在する
    const displayName = safeName(
      args.displayNameOverride ??
        (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : undefined) ??
        (typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : undefined) ??
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
    if (score <= best) {
      return { ok: true, mode: "user_skip" };
    }

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