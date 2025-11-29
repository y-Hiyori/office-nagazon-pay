// src/pages/AccountMenu.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./AccountMenu.css";

function AccountMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/auth");
        return;
      }

      setUser(user);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(data);
    };

    loadUser();
  }, []);

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

  if (!user || !profile) {
    return <p style={{ padding: 20 }}>読み込み中...</p>;
  }

  return (
    <div className="account-menu">
      <button className="acc-back" onClick={() => navigate("/")}>
        ← ホームに戻る
      </button>

      <h2 style={{ fontSize: "26px", fontWeight: "bold" }}>
        アカウント情報
      </h2>

      <div style={{ width: "100%", maxWidth: "320px", textAlign: "left" }}>
        <p><strong>名前:</strong> {profile.name}</p>
        <p><strong>メール:</strong> {user.email}</p>
      </div>

      {/* 🔵 購入履歴ページへ */}
      <button
        className="acc-btn"
        onClick={() => navigate("/orders")}
      >
        購入履歴を見る
      </button>

      <button className="acc-btn" onClick={() => navigate("/account-edit")}>
        アカウント編集
      </button>

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
  );
}

export default AccountMenu;