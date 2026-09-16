import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./AccountMenu.css";

import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

type SiteProfile = {
  id: string;
  name: string | null;
  email: string | null;
  is_admin?: boolean;
};

type Wallet = {
  balance: number;
};

// ✅ ポイント履歴1件
type PointTx = {
  id: string;
  type: "earn" | "use" | "expire" | "adjust";
  amount: number;
  balance_after: number;
  order_id: string | null;
  description: string | null;
  created_at: string;
};

const TX_INFO: Record<string, { label: string }> = {
  earn: { label: "獲得" },
  use: { label: "使用" },
  expire: { label: "失効" },
  adjust: { label: "調整" },
};

const formatTxDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function AccountMenu() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<SiteProfile | null>(null);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // ✅ ポイント履歴（モーダル）
  const [history, setHistory] = useState<PointTx[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) => Number(n || 0).toLocaleString("ja-JP");

  const loadWallet = async () => {
    setWalletLoading(true);
    try {
      const { data, error } = await supabase.rpc("points_get_my_wallet");
      if (error) {
        console.error("points_get_my_wallet error:", error);
        setWallet({ balance: 0 });
        return;
      }

      const row: any = Array.isArray(data) ? data?.[0] : data;
      setWallet({ balance: Number(row?.balance ?? 0) });
    } finally {
      setWalletLoading(false);
    }
  };

  // ✅ ポイント履歴を取得
  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data, error } = await supabase.rpc("points_get_my_history");
      if (error) {
        console.error("points_get_my_history error:", error);
        setHistoryError("ポイント履歴の取得に失敗しました");
        setHistory([]);
        return;
      }
      setHistory((data as PointTx[] | null) ?? []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    if (history === null) void loadHistory();
  };

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("getUser error:", userError);
        setError("ログイン情報の取得に失敗しました");
        return;
      }

      if (!user) {
        navigate("/auth");
        return;
      }

      setUser(user);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("profiles select error:", profileError);
        setError("プロフィールの読み込みに失敗しました");
        return;
      }

      if (!data) {
        setError("プロフィールが見つかりませんでした");
        return;
      }

      setProfile(data as SiteProfile);
      await loadWallet();
    };

    loadUser();
  }, [navigate]);

  const initials = useMemo(() => {
    const n = (profile?.name ?? "").trim();
    if (!n) return "👤";
    return n.slice(0, 1);
  }, [profile?.name]);

  const displayEmail = useMemo(() => {
    const profileEmail = (profile?.email ?? "").trim();
    const authEmail = (user?.email ?? "").trim();
    return profileEmail || authEmail || "メール未設定";
  }, [profile?.email, user?.email]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await appDialog.alert({
      title: "ログアウト",
      message: "ログアウトしました",
    });
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    const check = await appDialog.confirm({
      title: "アカウント削除",
      message: "本当にアカウントを削除しますか？",
      okText: "削除する",
      cancelText: "戻る",
    });
    if (!check) return;

    const { error } = await supabase.rpc("delete_user");
    if (error) {
      await appDialog.alert({
        title: "削除に失敗しました",
        message: "削除に失敗しました: " + error.message,
      });
      return;
    }

    await appDialog.alert({
      title: "削除完了",
      message: "アカウントを削除しました",
    });
    navigate("/");
  };

  if (error) {
    return (
      <div className="account-wrap">
        <SiteHeader />
        <main className="account-main">
          <div className="account-shell">
            <p className="account-error">{error}</p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="account-wrap">
        <SiteHeader />
        <main className="account-main">
          <div className="account-shell">
            <p className="account-ghost">読み込み中...</p>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="account-wrap">
      <SiteHeader />

      <main className="account-main">
        <div className="account-shell">
          <section className="account-profile">
            <div className="account-avatar" aria-hidden="true">
              {initials}
            </div>

            <div className="account-profile-text">
              <div className="account-name-row">
                <h2 className="account-name">{profile.name || "ユーザー"}</h2>
                {profile.is_admin && <span className="account-badge">管理者</span>}
              </div>
              <p className="account-email">{displayEmail}</p>
            </div>
          </section>

          <section className="account-points">
            <div className="account-points-head">
              <h3 className="account-points-title">ポイント</h3>
              <div className="account-points-actions">
                <button className="account-points-history" onClick={openHistory}>
                  履歴を見る
                </button>
                <button className="account-points-reload" onClick={loadWallet} disabled={walletLoading}>
                  {walletLoading ? "更新中..." : "更新"}
                </button>
              </div>
            </div>

            <div className="account-points-row">
              <div className="account-points-label">保有ポイント</div>
              <div className="account-points-value">{walletLoading ? "…" : fmt(wallet?.balance ?? 0)} pt</div>
            </div>

            <div className="account-points-note">決済時にポイントを使用できます（1pt = 1円）。</div>
          </section>

          <section className="account-actions">
            <button className="acc-btn" onClick={() => navigate("/orders")}>
              購入履歴を見る
            </button>

            <button className="acc-btn" onClick={() => navigate("/account-edit")}>
              アカウント編集
            </button>

            {profile.is_admin && (
              <button className="acc-btn acc-btn-admin" onClick={() => navigate("/admin-menu")}>
                管理者メニューへ
              </button>
            )}

            <button className="acc-btn acc-btn-ghost" onClick={handleLogout}>
              ログアウト
            </button>

            <button className="acc-btn acc-btn-danger" onClick={handleDeleteAccount}>
              アカウント削除
            </button>
          </section>
        </div>
      </main>

      {/* ✅ ポイント履歴モーダル */}
      {showHistory && (
        <div
          className="ptx-overlay"
          onClick={() => setShowHistory(false)}
          role="presentation"
        >
          <div className="ptx-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ptx-head">
              <h3 className="ptx-title">ポイント履歴</h3>
              <button
                type="button"
                className="ptx-close"
                onClick={() => setShowHistory(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="ptx-sub">ポイントの獲得・使用・失効の履歴です（1pt = 1円）。</div>

            {historyLoading ? (
              <p className="ptx-ghost">読み込み中...</p>
            ) : historyError ? (
              <p className="ptx-error">{historyError}</p>
            ) : !history || history.length === 0 ? (
              <p className="ptx-empty">
                履歴がまだありません
                <br />
                購入でポイントが付与されると、ここに表示されます
              </p>
            ) : (
              <div className="ptx-list">
                {history.map((tx) => {
                  const info = TX_INFO[tx.type] ?? TX_INFO.adjust;
                  const sign = tx.amount > 0 ? "+" : "";
                  return (
                    <div key={tx.id} className="ptx-row">
                      <span className={`ptx-badge ptx-badge-${tx.type}`}>{info.label}</span>
                      <div className="ptx-main">
                        <div className="ptx-desc">{tx.description || info.label}</div>
                        <div className="ptx-date">
                          {formatTxDate(tx.created_at)}・残高 {fmt(tx.balance_after)} pt
                        </div>
                      </div>
                      <div className={`ptx-amount ptx-amount-${tx.type}`}>
                        {sign}
                        {fmt(tx.amount)} pt
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ptx-foot">
              付与から1年（365日）を過ぎた未使用ポイントは自動で失効します。
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}

export default AccountMenu;
