// src/pages/AdminUsers.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminUsers.css";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
};

function AdminUsers() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);

      // ① ログインユーザー取得
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        alert("管理者としてログインしてください。");
        navigate("/admin-login");
        return;
      }

      const loginUser = authData.user;

      // ② 自分が管理者かどうか確認（profiles の is_admin）
      const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", loginUser.id)
        .single();

      if (meError || !me?.is_admin) {
        // is_admin が TRUE じゃなければトップへ追い返す
        alert("このページは管理者専用です。");
        navigate("/");
        return;
      }

      // ③ ここまで来たら「管理者」なので、全ユーザーを取得
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("profiles 読み込みエラー:", error);
      } else {
        setProfiles((data || []) as Profile[]);
      }

      setLoading(false);
    };

    loadProfiles();
  }, [navigate]);

  if (loading) {
    return <p style={{ padding: 20 }}>読み込み中...</p>;
  }

  return (
    <div className="admin-users-page">
      {/* 固定ヘッダー */}
      <header className="admin-users-header">
        <button
          className="admin-users-back"
          onClick={() => navigate("/admin-menu")}
        >
          ←
        </button>

        <h2 className="admin-users-title">アカウント管理</h2>
      </header>

      {/* 一覧 */}
      <div className="admin-users-list">
        {profiles.length === 0 ? (
          <p>登録されているアカウントがありません。</p>
        ) : (
          profiles.map((u) => (
            <div
              key={u.id}
              className="admin-users-item"
              onClick={() => navigate(`/admin-user-detail/${u.id}`)}
            >
              <div className="admin-users-icon">👤</div>
              <div className="admin-users-info">
                <p className="admin-users-name">{u.name || "(名前なし)"}</p>
                {/* メールは今は非表示のまま */}
                {/* <p className="admin-users-email">{u.email}</p> */}
              </div>
              <div className="admin-users-arrow">＞</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AdminUsers;