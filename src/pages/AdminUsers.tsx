// src/pages/AdminUsers.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminUsers.css";

type Profile = {
  id: string;
  name: string;
  email: string; // ← ここは残してOK（詳細画面で使う想定）
};

function AdminUsers() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfiles = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email") // 取得はこのままでOK
        .order("created_at", { ascending: true });

      if (error) {
        console.error("profiles 読み込みエラー:", error);
      } else {
        setProfiles(data as Profile[]);
      }

      setLoading(false);
    };

    loadProfiles();
  }, []);

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
                <p className="admin-users-name">{u.name}</p>
                {/* メール表示は削除 */}
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