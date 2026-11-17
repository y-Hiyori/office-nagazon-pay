// src/context/UserContext.tsx
// ログイン状態・お気に入り・未読のお知らせ数をアプリ全体で共有する
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";

type UserContextValue = {
  userId: string | null;
  ready: boolean; // ログイン状態の確認が終わったか
  favoriteIds: Set<number>;
  favoritesReady: boolean; // お気に入りの読み込みが終わったか
  isFavorite: (productId: number) => boolean;
  toggleFavorite: (productId: number) => Promise<"added" | "removed" | "login" | "error">;
  refreshFavorites: () => Promise<void>;
  unreadCount: number;
  refreshUnread: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshFavorites = useCallback(async () => {
    if (!userId) {
      setFavoriteIds(new Set());
      setFavoritesReady(true);
      return;
    }
    const { data, error } = await supabase.from("favorites").select("product_id").eq("user_id", userId);
    if (error) {
      console.error("favorites load error:", error);
      setFavoritesReady(true);
      return;
    }
    setFavoriteIds(new Set((data ?? []).map((r: { product_id: number }) => Number(r.product_id))));
    setFavoritesReady(true);
  }, [userId]);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const { count, error } = await supabase
      .from("user_notice_recipients")
      .select("notice_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      console.error("unread load error:", error);
      return;
    }
    setUnreadCount(count ?? 0);
  }, [userId]);

  useEffect(() => {
    setFavoritesReady(false);
    refreshFavorites();
    refreshUnread();
  }, [refreshFavorites, refreshUnread]);

  // アプリに戻ってきた時に未読数を更新
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshUnread]);

  const isFavorite = useCallback((id: number) => favoriteIds.has(id), [favoriteIds]);

  const toggleFavorite = useCallback(
    async (productId: number): Promise<"added" | "removed" | "login" | "error"> => {
      if (!userId) return "login";
      const has = favoriteIds.has(productId);

      // 先に画面へ反映し、失敗したら戻す
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (has) next.delete(productId);
        else next.add(productId);
        return next;
      });

      const { error } = has
        ? await supabase.from("favorites").delete().eq("user_id", userId).eq("product_id", productId)
        : await supabase.from("favorites").insert({ user_id: userId, product_id: productId });

      if (error && !(error.code === "23505" && !has)) {
        console.error("favorite toggle error:", error);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (has) next.add(productId);
          else next.delete(productId);
          return next;
        });
        return "error";
      }
      return has ? "removed" : "added";
    },
    [userId, favoriteIds]
  );

  const value = useMemo(
    () => ({
      userId,
      ready,
      favoriteIds,
      favoritesReady,
      isFavorite,
      toggleFavorite,
      refreshFavorites,
      unreadCount,
      refreshUnread,
    }),
    [userId, ready, favoriteIds, favoritesReady, isFavorite, toggleFavorite, refreshFavorites, unreadCount, refreshUnread]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
