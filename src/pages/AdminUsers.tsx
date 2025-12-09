// src/pages/AdminUsers.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminUsers.css";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  is_admin: boolean | null;
};

function AdminUsers() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);

      // ① ログインユーザー取得
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError || !authData.user) {
        alert("管理者としてログインしてください。");
        navigate("/admin-login");
        return;
      }

      const loginUser = authData.user;

      // ② 自分が管理者かどうか確認
      const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", loginUser.id)
        .single();

      if (meError || !me?.is_admin) {
        alert("このページは管理者専用です。");
        navigate("/");
        return;
      }

      // ③ 全ユーザー取得（is_admin も取る）
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, is_admin, created_at")
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

  // 🔽 管理者を上に、そのあと名前順で並べ替え
  const sorted = [...profiles].sort((a, b) => {
    const aAdmin = a.is_admin ? 1 : 0;
    const bAdmin = b.is_admin ? 1 : 0;
    if (aAdmin !== bAdmin) {
      return bAdmin - aAdmin; // 管理者(true) が先
    }

    const aName = a.name || "";
    const bName = b.name || "";
    return aName.localeCompare(bName, "ja");
  });

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
        {sorted.length === 0 ? (
          <p>登録されているアカウントがありません。</p>
        ) : (
          sorted.map((u) => {
            const isAdmin = !!u.is_admin;

            return (
              <div
                key={u.id}
                className="admin-users-item"
                onClick={() => navigate(`/admin-user-detail/${u.id}`)}
              >
                {/* 👤 アイコンの色を管理者だけ変える */}
                <div
                  className={`admin-users-icon ${
                    isAdmin ? "admin" : "normal"
                  }`}
                >
                  👤
                </div>

                <div className="admin-users-info">
                  <p className="admin-users-name">
                    {u.name || "(名前なし)"}
                  </p>

                  {/* 必要ならメールも表示できる */}
                  {/* <p className="admin-users-email">{u.email}</p> */}

                  {isAdmin && (
                    <span className="admin-users-role-badge">
                      管理者
                    </span>
                  )}
                </div>

                <div className="admin-users-arrow">＞</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default AdminUsers;