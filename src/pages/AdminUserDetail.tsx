// src/pages/AdminUserDetail.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminUserDetail.css";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
};

export default function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("id", id)
        .single();

      if (profErr || !prof) {
        alert("ユーザーが見つかりません");
        navigate("/admin-users");
        return;
      }

      setProfile(prof);
      setEditName(prof.name || "");
      setLoading(false);
    };

    load();
  }, [id, navigate]);

  const handleUpdateName = async () => {
    if (!id) return;
    const nextName = editName.trim();
    if (!nextName) {
      alert("名前を入力してください");
      return;
    }

    const { error } = await supabase.from("profiles").update({ name: nextName }).eq("id", id);

    if (error) {
      alert("名前の変更に失敗しました: " + error.message);
      return;
    }

    alert("名前を更新しました！");
    setProfile((p) => (p ? { ...p, name: nextName } : p));
  };

  const handleDeleteUser = async () => {
    if (!id) return;

    const ok = confirm("このユーザーを完全に削除しますか？（元に戻せません）");
    if (!ok) return;

    const { error } = await supabase.rpc("delete_user_by_admin", {
      target_user_id: id,
    });

    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }

    alert("ユーザーを削除しました");
    navigate("/admin-users");
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-user-detail-wrap">
        <main className="admin-user-detail-page">
          <header className="admin-user-detail-top">
            <button
              className="admin-user-detail-back"
              onClick={() => navigate(-1)}
              type="button"
              aria-label="戻る"
            >
              ← 戻る
            </button>
            <h2 className="admin-user-detail-title">ユーザー詳細</h2>
          </header>

          {loading || !profile ? (
            <p className="admin-user-detail-loading">読み込み中...</p>
          ) : (
            <>
              <section className="admin-user-detail-card">
                <div className="admin-user-detail-row">
                  <div className="admin-user-detail-label">名前</div>
                  <div className="admin-user-detail-value">
                    {profile.name || "(名前なし)"}
                  </div>
                </div>

                <div className="admin-user-detail-row">
                  <div className="admin-user-detail-label">メール</div>
                  <div className="admin-user-detail-value admin-user-detail-email">
                    {profile.email || "(未設定)"}
                  </div>
                </div>
              </section>

              <section className="admin-user-detail-card">
                <h3 className="admin-user-detail-cardtitle">名前を変更</h3>

                <div className="admin-user-detail-inputrow">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="admin-user-detail-input"
                    placeholder="新しい名前"
                  />
                  <button
                    className="admin-user-detail-primary"
                    onClick={handleUpdateName}
                    type="button"
                  >
                    更新
                  </button>
                </div>
              </section>

              <section className="admin-user-detail-card">
                <button
                  className="admin-user-detail-secondary"
                  onClick={() => navigate(`/admin-user-orders/${id}`)}
                  type="button"
                >
                  このユーザーの購入履歴を見る
                </button>
              </section>

              <button
                className="admin-user-detail-danger"
                onClick={handleDeleteUser}
                type="button"
              >
                このユーザーを削除する
              </button>
            </>
          )}
        </main>
      </div>
    </>
  );
}