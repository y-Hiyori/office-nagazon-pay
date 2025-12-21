import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
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

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        alert("管理者としてログインしてください。");
        navigate("/login");
        return;
      }

      const loginUser = authData.user;

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

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  const sorted = [...profiles].sort((a, b) => {
    const aAdmin = a.is_admin ? 1 : 0;
    const bAdmin = b.is_admin ? 1 : 0;
    if (aAdmin !== bAdmin) return bAdmin - aAdmin;
    const aName = a.name || "";
    const bName = b.name || "";
    return aName.localeCompare(bName, "ja");
  });

  return (
    <>
      <AdminHeader />

      <div className="admin-users-page" style={{ paddingTop: 80 }}>
        <h2 style={{ margin: "6px 0 12px", fontSize: 21, fontWeight: 800 }}>
          アカウント管理
        </h2>

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
                  <div className={`admin-users-icon ${isAdmin ? "admin" : "normal"}`}>
                    👤
                  </div>

                  <div className="admin-users-info">
                    <p className="admin-users-name">{u.name || "(名前なし)"}</p>

                    {isAdmin && (
                      <span className="admin-users-role-badge">管理者</span>
                    )}
                  </div>

                  <div className="admin-users-arrow">＞</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default AdminUsers;