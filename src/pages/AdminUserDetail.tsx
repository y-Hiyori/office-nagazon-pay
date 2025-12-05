// src/pages/AdminUserDetail.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminUserDetail.css";

type Profile = {
  id: string;
  name: string;
  email: string;
};

function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);

  // 🔥 ユーザー情報読み込み
  useEffect(() => {
    if (!id) return;

    const load = async () => {
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
      setEditName(prof.name);
      setLoading(false);
    };

    load();
  }, [id, navigate]);

  // 🔵 名前更新
  const handleUpdateName = async () => {
    if (!editName) {
      alert("名前を入力してください");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ name: editName })
      .eq("id", id);

    if (error) {
      alert("名前の変更に失敗しました: " + error.message);
      return;
    }

    alert("名前を更新しました！");
  };

  // ❌ ユーザー削除
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

  if (loading || !profile) {
    return <p style={{ padding: 20 }}>読み込み中...</p>;
  }

  return (
    <div className="admin-user-detail-page">

      {/* ヘッダー */}
<header className="admin-user-detail-header">
        <button
          className="admin-user-detail-back"
          onClick={() => navigate("/admin-users")}
        >
          ←
        </button>
        <h2 className="admin-user-detail-title">ユーザー詳細</h2>
      </header>

      {/* 基本情報 */}
      <div className="admin-user-detail-card">
        <p><strong>名前：</strong> {profile.name}</p>
        <p><strong>メール：</strong> {profile.email}</p>
      </div>

      {/* 名前変更 */}
      <div className="admin-user-detail-card">
        <h3>名前を変更</h3>

        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="admin-user-detail-input"
          placeholder="新しい名前"
        />

        <button
          className="admin-user-detail-save"
          onClick={handleUpdateName}
        >
          名前を更新
        </button>
      </div>

      {/* 🔵 ここを追加：購入履歴ページへ */}
      <div className="admin-user-detail-card">
        <button
          className="admin-user-detail-save"
          onClick={() => navigate(`/admin-user-orders/${id}`)}
        >
          このユーザーの購入履歴を見る
        </button>
      </div>

      {/* 削除ボタン */}
      <button
        className="admin-user-detail-delete"
        onClick={handleDeleteUser}
      >
        このユーザーを削除する
      </button>
    </div>
  );
}

export default AdminUserDetail;