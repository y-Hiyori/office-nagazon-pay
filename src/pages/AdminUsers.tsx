import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import AdminHeader from "../components/AdminHeader";
import "./AdminUsers.css";
import Loading from "../components/Loading";

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
  // ✅ 複数選んでお知らせを送る
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (uid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        await appDialog.alert({ message: "管理者としてログインしてください。" });
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
        await appDialog.alert({ message: "このページは管理者専用です。" });
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

  if (loading) return <Loading />;

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
        <div className="admin-users-titlebar">
          <h2 style={{ margin: "6px 0 12px", fontSize: 21, fontWeight: 800 }}>
            アカウント管理
          </h2>
          <button
            type="button"
            className={`admin-users-select-toggle ${selectMode ? "on" : ""}`}
            onClick={() => {
              setSelectMode((v) => !v);
              setPicked(new Set());
            }}
          >
            {selectMode ? "選択をやめる" : "選んでお知らせ"}
          </button>
        </div>

        <div className="admin-users-list">
          {sorted.length === 0 ? (
            <p>登録されているアカウントがありません。</p>
          ) : (
            sorted.map((u) => {
              const isAdmin = !!u.is_admin;

              return (
                <div
                  key={u.id}
                  className={`admin-users-item ${selectMode && picked.has(u.id) ? "is-picked" : ""}`}
                  onClick={() =>
                    selectMode ? togglePick(u.id) : navigate(`/admin-user-detail/${u.id}`)
                  }
                >
                  {selectMode ? (
                    <input
                      type="checkbox"
                      className="admin-users-check"
                      checked={picked.has(u.id)}
                      onChange={() => togglePick(u.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${u.name || "名前なし"}を選ぶ`}
                    />
                  ) : null}
                  <div className={`admin-users-icon ${isAdmin ? "admin" : "normal"}`}>
                    👤
                  </div>

                  <div className="admin-users-info">
                    <p className="admin-users-name">{u.name || "(名前なし)"}</p>

                    {isAdmin && (
                      <span className="admin-users-role-badge">管理者</span>
                    )}
                  </div>

                  {!selectMode ? <div className="admin-users-arrow">＞</div> : null}
                </div>
              );
            })
          )}
        </div>

        {selectMode ? (
          <div className="admin-users-sendbar">
            <span>{picked.size}人を選択中</span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => navigate(`/admin-user-notice?to=${[...picked].join(",")}`)}
            >
              お知らせを作成
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default AdminUsers;