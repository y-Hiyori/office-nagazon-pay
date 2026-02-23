// src/pages/game/lib/scoreApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";
import { getSavedGuestName } from "./guestName";

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

  // ゲストのときだけ使う（任意）
  displayNameOverride?: string | null;
};

export type SubmitResult =
  | {
      ok: true;
      mode:
        | "guest_insert"
        | "guest_best_update"
        | "guest_skip"
        | "user_insert"
        | "user_best_update"
        | "user_name_sync"
        | "user_skip";
    }
  | { ok: false; error: string };

/* =========================
   Utils
========================= */

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function safeName(v: unknown, max = 12): string {
  const s = typeof v === "string" ? v.trim() : "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!cleaned) return "ゲスト";
  return cleaned.slice(0, max);
}

async function getProfilesName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("profiles read error:", error.message);
    return null;
  }
  const n = typeof data?.name === "string" ? data.name.trim() : "";
  return n ? n.slice(0, 20) : null;
}

/* =========================
   Public: fetchTopScores
   - 今は「同名/同userで1行」運用を想定
========================= */

export async function fetchTopScores(
  args: FetchTopScoresArgs
): Promise<FetchTopScoresResult> {
  try {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 10)));
    const difficulty = args.difficulty ?? "all";

    let q = supabase
      .from("game_scores")
      .select("id, score, difficulty, display_name, user_id, is_guest, created_at")
      .order("score", { ascending: false })
      .limit(limit);

    if (difficulty !== "all") q = q.eq("difficulty", difficulty);

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };

    return { ok: true, rows: (data ?? []) as ScoreRow[] };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* =========================
   Public: getMyDisplayName
========================= */

export async function getMyDisplayName(): Promise<MyDisplayNameResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    const g = getSavedGuestName();
    return { displayName: g ?? "ゲスト", userId: null, isGuest: true };
  }

  const session = data.session ?? null;
  const userId = session?.user?.id ?? null;

  // ゲスト
  if (!userId) {
    const g = getSavedGuestName();
    return { displayName: g ?? "ゲスト", userId: null, isGuest: true };
  }

  // ログイン
  const pName = await getProfilesName(userId);
  return { displayName: pName ?? "User", userId, isGuest: false };
}

/* =========================
   Public: submitGameScore
   ✅ ゲスト：display_name(=ゲスト名) で 1行運用
   ✅ ログイン：user_id で 1行運用
   - スコアが伸びた時だけ score & difficulty 更新（difficultyは“ベストの難易度”）
   - 伸びなくてもログインは profiles.name を同期
========================= */

export async function submitGameScore(args: SubmitArgs): Promise<SubmitResult> {
  try {
    const score = clampScore(args.score);
    const difficulty = args.difficulty;

    // 実セッションで判断
    const { data: sessRes, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) console.warn("getSession failed:", sessErr.message);

    const session = sessRes?.session ?? null;
    const userId = session?.user?.id ?? null;

    // ==========================
    // ゲスト：display_name で1行（同名は全体一意運用）
    // ==========================
    if (!userId) {
      const saved = getSavedGuestName();
      const displayName = safeName(args.displayNameOverride ?? saved ?? "ゲスト", 12);

      // 既存（同名）を探す
      const { data: existing, error: selErr } = await supabase
        .from("game_scores")
        .select("id, score, difficulty")
        .eq("is_guest", true)
        .eq("display_name", displayName)
        .maybeSingle();

      if (selErr) return { ok: false, error: selErr.message };

      // ないなら insert
      if (!existing) {
        const { error: insErr } = await supabase.from("game_scores").insert({
          user_id: null,
          is_guest: true,
          display_name: displayName,
          difficulty,
          score,
        });
        if (insErr) return { ok: false, error: insErr.message };
        return { ok: true, mode: "guest_insert" };
      }

      const best = clampScore(existing.score);

      // ベスト更新の時だけ score & difficulty 更新（= ベストの難易度として保持）
      if (score > best) {
        const { error: updErr } = await supabase
          .from("game_scores")
          .update({ score, difficulty })
          .eq("id", existing.id);

        if (updErr) return { ok: false, error: updErr.message };
        return { ok: true, mode: "guest_best_update" };
      }

      return { ok: true, mode: "guest_skip" };
    }

    // ==========================
    // ログイン：user_id で1行
    // ==========================
    const displayName = (await getProfilesName(userId)) ?? "User";

    const { data: existing, error: selErr } = await supabase
      .from("game_scores")
      .select("id, score, display_name, difficulty")
      .eq("user_id", userId)
      .eq("is_guest", false)
      .maybeSingle();

    if (selErr) return { ok: false, error: selErr.message };

    // ないなら insert
    if (!existing) {
      const { error: insErr } = await supabase.from("game_scores").insert({
        user_id: userId,
        is_guest: false,
        display_name: displayName,
        difficulty,
        score,
      });

      if (insErr) return { ok: false, error: insErr.message };
      return { ok: true, mode: "user_insert" };
    }

    const best = clampScore(existing.score);

    // スコア更新しない場合でも “名前だけ同期”
    if ((existing.display_name ?? "").trim() !== displayName) {
      const { error: nameErr } = await supabase
        .from("game_scores")
        .update({ display_name: displayName })
        .eq("id", existing.id);

      if (nameErr) return { ok: false, error: nameErr.message };
      // スコアが伸びないならここで終了
      if (score <= best) return { ok: true, mode: "user_name_sync" };
    }

    if (score <= best) return { ok: true, mode: "user_skip" };

    // ベスト更新：score & difficulty を更新（difficultyは“ベストの難易度”）
    const { error: updErr } = await supabase
      .from("game_scores")
      .update({ score, difficulty, display_name: displayName })
      .eq("id", existing.id);

    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true, mode: "user_best_update" };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}