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

function AccountMenu() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<SiteProfile | null>(null);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

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
    // ✅ alert → アプリ内
    await appDialog.alert({
      title: "ログアウト",
      message: "ログアウトしました",
    });
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    // ✅ confirm → アプリ内（cancelなら何もしない）
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
              <button className="account-points-reload" onClick={loadWallet} disabled={walletLoading}>
                {walletLoading ? "更新中..." : "更新"}
              </button>
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

      <SiteFooter />
    </div>
  );
}

export default AccountMenu;
