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

type WalletRow = {
  user_id: string;
  balance: number;
};

export default function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);

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

      // ✅ ポイント残高（存在しなければ0）
      const { data: w } = await supabase
        .from("points_wallet")
        .select("user_id,balance")
        .eq("user_id", id)
        .maybeSingle();

      if (w) {
        setWallet({
          user_id: w.user_id,
          balance: Number((w as any).balance ?? 0),
        });
      } else {
        setWallet({ user_id: id, balance: 0 });
      }

      setLoading(false);
    };

    load();
  }, [id, navigate]);

  // ✅ 管理者がこのユーザーへ「パスワード再設定メール」を送る（アプリだけで完結）
const handleSendResetMail = async () => {
  if (!profile?.email) {
    alert("このユーザーはメールアドレスが未設定です");
    return;
  }

  // ✅ 追加：送信前の確認
  const ok = confirm(`${profile.email} にパスワード再設定メールを送ります。よろしいですか？`);
  if (!ok) return;

  setSending(true);
  try {
    const redirectTo =
      (import.meta as any).env?.VITE_RESET_REDIRECT_TO ||
      `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo,
    });

    if (error) {
      alert("送信に失敗しました: " + error.message);
      return;
    }

    alert("パスワード再設定メールを送信しました。");
  } finally {
    setSending(false);
  }
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

                <div className="admin-user-detail-row">
                  <div className="admin-user-detail-label">ポイント</div>
                  <div className="admin-user-detail-value">
                    {Number(wallet?.balance ?? 0).toLocaleString("ja-JP")} pt
                  </div>
                </div>
              </section>

              {/* ✅ 追加：再設定メール送信 */}
              <section className="admin-user-detail-card">
                <button
                  className="admin-user-detail-secondary"
                  onClick={handleSendResetMail}
                  type="button"
                  disabled={sending}
                >
                  {sending ? "送信中..." : "パスワード再設定メールを送る"}
                </button>
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