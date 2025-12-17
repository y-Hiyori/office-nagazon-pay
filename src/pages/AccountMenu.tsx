// src/pages/AccountMenu.tsx
import { useEffect, useState } from "react";
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
      // ① ログインユーザー取得
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

      // ② profiles から自分の行だけ取得（is_admin も含める）
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

  // エラーがあれば先に表示（ヘッダー/フッターは付ける）
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <SiteHeader />
        <main style={{ flex: 1 }}>
          <p style={{ padding: 20, color: "red", whiteSpace: "pre-line" }}>
            {error}
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // データ読み込み中（ヘッダー/フッターは付ける）
  if (!user || !profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <SiteHeader />
        <main style={{ flex: 1 }}>
          <p style={{ padding: 20 }}>読み込み中...</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />

      <main style={{ flex: 1 }}>
        <div className="account-menu">
          <h2 style={{ fontSize: "26px", fontWeight: "bold" }}>
            アカウント情報
          </h2>

          <div style={{ width: "100%", maxWidth: "320px", textAlign: "left" }}>
            <p>
              <strong>名前:</strong> {profile.name}
            </p>
            <p>
              <strong>メール:</strong> {user.email}
            </p>
          </div>

          {/* 🔵 購入履歴ページへ */}
          <button className="acc-btn" onClick={() => navigate("/orders")}>
            購入履歴を見る
          </button>

          <button className="acc-btn" onClick={() => navigate("/account-edit")}>
            アカウント編集
          </button>

          {/* 🔵 管理者だけに表示するボタン */}
          {profile.is_admin && (
            <button
              className="acc-btn acc-btn-admin"
              onClick={() => navigate("/admin-menu")}
            >
              管理者メニューへ
            </button>
          )}

          <button
            className="acc-btn"
            onClick={handleLogout}
            style={{ background: "#555" }}
          >
            ログアウト
          </button>

          <button
            className="acc-btn"
            onClick={handleDeleteAccount}
            style={{ background: "red" }}
          >
            アカウント削除
          </button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default AccountMenu;