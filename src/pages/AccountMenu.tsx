import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./AccountMenu.css";

import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  is_admin?: boolean;
};

function AccountMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      setProfile(data as Profile);
    };

    loadUser();
  }, [navigate]);

  const initials = useMemo(() => {
    const n = (profile?.name ?? "").trim();
    if (!n) return "👤";
    return n.slice(0, 1);
  }, [profile?.name]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    alert("ログアウトしました");
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    const check = confirm("本当にアカウントを削除しますか？");
    if (!check) return;

    const { error } = await supabase.rpc("delete_user");
    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }

    alert("アカウントを削除しました");
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
          {/* ✅ プロフィール（基本情報の枠は作らない） */}
          <section className="account-profile">
            <div className="account-avatar" aria-hidden="true">
              {initials}
            </div>

            <div className="account-profile-text">
              <div className="account-name-row">
                <h2 className="account-name">{profile.name || "ユーザー"}</h2>
                {profile.is_admin && <span className="account-badge">管理者</span>}
              </div>
              <p className="account-email">{user.email}</p>
            </div>
          </section>

          {/* ✅ 操作ボタン */}
          <section className="account-actions">
            <button className="acc-btn" onClick={() => navigate("/orders")}>
              購入履歴を見る
            </button>

            <button className="acc-btn" onClick={() => navigate("/account-edit")}>
              アカウント編集
            </button>

            {profile.is_admin && (
              <button
                className="acc-btn acc-btn-admin"
                onClick={() => navigate("/admin-menu")}
              >
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