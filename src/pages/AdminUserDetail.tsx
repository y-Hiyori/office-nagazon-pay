// src/pages/AdminUserDetail.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
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

type PointTx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  order_id: string | null;
  description: string | null;
  created_at: string;
};

export default function AdminUserDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);

  // ✅ ポイント履歴（管理者用RPC）
  const [pointTxs, setPointTxs] = useState<PointTx[]>([]);
  const [pointErr, setPointErr] = useState("");
  const [pointLoading, setPointLoading] = useState(true);

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
        await appDialog.alert({ message: "ユーザーが見つかりません" });
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

      // ✅ ポイント履歴を取得（管理者のみ実行できるRPC）
      try {
        const { data: hist, error: histErr } = await supabase.rpc("admin_point_history", {
          p_user_id: id,
          p_limit: 200,
        });

        if (histErr) {
          console.error("admin_point_history error:", histErr);
          setPointErr("ポイント履歴の取得に失敗しました: " + histErr.message);
        } else {
          const h: any = hist;
          setPointTxs(Array.isArray(h?.transactions) ? (h.transactions as PointTx[]) : []);
        }
      } catch (eHist) {
        console.error(eHist);
        setPointErr("ポイント履歴の取得に失敗しました");
      } finally {
        setPointLoading(false);
      }

      setLoading(false);
    };

    load();
  }, [id, navigate]);

  // ✅ 管理者がこのユーザーへ「パスワード再設定メール」を送る（アプリだけで完結）
const handleSendResetMail = async () => {
  if (!profile?.email) {
    await appDialog.alert({ message: "このユーザーはメールアドレスが未設定です" });
    return;
  }

  // ✅ 追加：送信前の確認
  const ok = await appDialog.confirm({ message: `${profile.email} にパスワード再設定メールを送ります。よろしいですか？` });
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
      await appDialog.alert({ message: "送信に失敗しました: " + error.message });
      return;
    }

    await appDialog.alert({ message: "パスワード再設定メールを送信しました。" });
  } finally {
    setSending(false);
  }
};

  const handleDeleteUser = async () => {
    if (!id) return;

    const ok = await appDialog.confirm({ message: "このユーザーを完全に削除しますか？（元に戻せません）" });
    if (!ok) return;

    const { error } = await supabase.rpc("delete_user_by_admin", {
      target_user_id: id,
    });

    if (error) {
      await appDialog.alert({ message: "削除に失敗しました: " + error.message });
      return;
    }

    await appDialog.alert({ message: "ユーザーを削除しました" });
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

              {/* ✅ ポイント履歴（管理者がユーザーの増減を確認できる） */}
              <section className="admin-user-detail-card">
                <div className="admin-user-detail-history-head">
                  <h3>ポイント履歴</h3>
                  <span>{pointTxs.length} 件</span>
                </div>

                {pointLoading ? (
                  <p className="admin-user-detail-loading">読み込み中...</p>
                ) : pointErr ? (
                  <p className="admin-user-detail-error">{pointErr}</p>
                ) : pointTxs.length === 0 ? (
                  <p className="admin-user-detail-loading">ポイント履歴はありません</p>
                ) : (
                  <div className="admin-user-detail-history">
                    {pointTxs.map((t) => {
                      const label =
                        t.type === "earn"
                          ? "獲得"
                          : t.type === "use"
                          ? "使用"
                          : t.type === "expire"
                          ? "失効"
                          : "調整";
                      const amount = Number(t.amount || 0);
                      const cls = amount > 0 ? "plus" : "minus";

                      return (
                        <div className="admin-user-detail-history-row" key={t.id}>
                          <div className="admin-user-detail-history-main">
                            <span className={`admin-user-detail-history-type ${cls}`}>{label}</span>
                            <span className="admin-user-detail-history-desc">
                              {t.description || "-"}
                            </span>
                          </div>

                          <div className="admin-user-detail-history-right">
                            <span className={`admin-user-detail-history-amount ${cls}`}>
                              {amount > 0 ? "+" : ""}
                              {amount.toLocaleString("ja-JP")} pt
                            </span>
                            <span className="admin-user-detail-history-date">
                              {t.created_at
                                ? new Date(t.created_at).toLocaleString("ja-JP", {
                                    timeZone: "Asia/Tokyo",
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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