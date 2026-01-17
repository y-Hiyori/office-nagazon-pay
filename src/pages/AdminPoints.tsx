// src/pages/AdminPoints.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminPoints.css";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type WalletRow = {
  user_id: string;
  balance: number;
};

export default function AdminPoints() {
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // ✅ 全員付与（初期値は空白）
  const [allAmount, setAllAmount] = useState<string>("");

  // ユーザー検索
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  // 選択ユーザーのwallet
  const [wallet, setWallet] = useState<WalletRow | null>(null);

  // 「変更後の残高」入力（初期値＝現在残高）
  const [newBalance, setNewBalance] = useState<number>(0);

  const selectedLabel = useMemo(() => {
    if (!selected) return "";
    const n = selected.name?.trim() || "（名前なし）";
    const e = selected.email?.trim() || "";
    return `${n}${e ? ` / ${e}` : ""}`;
  }, [selected]);

  const loadWallet = async (userId: string) => {
    const { data, error } = await supabase
      .from("points_wallet")
      .select("user_id,balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("wallet load error:", error);
      setWallet({ user_id: userId, balance: 0 });
      setNewBalance(0);
      return;
    }

    const b = Math.floor(Number((data as any).balance ?? 0));
    setWallet({ user_id: data.user_id, balance: b });
    setNewBalance(b);
  };

  const searchUsers = async () => {
    setMsg("");
    setUsers([]);
    setSelected(null);
    setWallet(null);

    const kw = q.trim();
    if (!kw) {
      setMsg("検索ワードを入力してください");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,email")
      .or(`name.ilike.%${kw}%,email.ilike.%${kw}%`)
      .limit(20);

    if (error) {
      console.error("profiles search error:", error);
      setMsg("検索に失敗しました");
      return;
    }

    setUsers((data ?? []) as ProfileRow[]);
    if ((data ?? []).length === 0) setMsg("見つかりませんでした");
  };

  // ✅ 全員付与（理由なし）
  const grantAll = async () => {
    setMsg("");

    if (!allAmount.trim()) {
      setMsg("付与ポイントを入力してください");
      return;
    }

    const v = Math.floor(Number(allAmount || 0));
    if (!Number.isFinite(v) || v <= 0) {
      setMsg("付与ポイントは 1以上の数字にしてください");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("points_admin_grant_all", {
        p_amount: v,
      });

      if (error) {
        console.error(error);
        setMsg("全員付与に失敗しました: " + error.message);
        return;
      }

      setMsg(`全員に ${v}pt 付与しました（対象 ${Number(data ?? 0)} 件）`);
      setAllAmount(""); // ✅ 付与後は空白に戻す
      if (selected) await loadWallet(selected.id);
    } finally {
      setBusy(false);
    }
  };

  // ✅ 変更後残高へ合わせる（理由なし）
  const applyNewBalance = async () => {
    setMsg("");

    if (!selected) {
      setMsg("ユーザーを選択してください");
      return;
    }
    if (!wallet) {
      setMsg("残高を読み込めていません");
      return;
    }

    const cur = Math.floor(Number(wallet.balance || 0));
    const next = Math.max(Math.floor(Number(newBalance || 0)), 0);

    if (next === cur) {
      setMsg("変更がありません");
      return;
    }

    const delta = next - cur;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("points_admin_adjust_user", {
        p_user_id: selected.id,
        p_amount: delta,
      });

      if (error) {
        console.error(error);
        setMsg("反映に失敗しました: " + error.message);
        return;
      }

      const sign = delta > 0 ? "+" : "-";
      setMsg(`残高を ${next}pt に変更しました（${sign}${Math.abs(delta)}pt）`);
      await loadWallet(selected.id);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  return (
    <>
      <AdminHeader />

      <div className="admin-points-page">
        <div className="admin-points-container">
          <h2 className="admin-points-title">ポイント管理</h2>

          {msg && <div className="admin-points-msg">{msg}</div>}

          {/* 全員付与 */}
          <section className="ap-card">
            <h3 className="ap-card-title">全アカウントへ付与</h3>

            <div className="ap-row">
              <label className="ap-label">付与ポイント</label>
              <input
                className="ap-input"
                inputMode="numeric"
                value={allAmount}
                placeholder="例：100"
                onChange={(e) => setAllAmount(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>

            <button className="ap-btn" disabled={busy} onClick={grantAll}>
              全員に付与
            </button>
          </section>

          {/* 特定ユーザー（変更後残高） */}
          <section className="ap-card">
            <h3 className="ap-card-title">特定ユーザーのポイント（変更後残高を指定）</h3>

            <div className="ap-search">
              <input
                className="ap-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="名前 or メールで検索"
              />
              <button className="ap-btn ap-btn-sub" disabled={busy} onClick={searchUsers}>
                検索
              </button>
            </div>

            {users.length > 0 && (
              <div className="ap-list">
                {users.map((u) => {
                  const isActive = selected?.id === u.id;
                  const walletReady = wallet && wallet.user_id === u.id;

                  return (
                    <div key={u.id}>
                      <button
                        className={`ap-user ${isActive ? "active" : ""}`}
                        onClick={async () => {
                          setSelected(u);
                          await loadWallet(u.id);
                        }}
                        type="button"
                      >
                        <div className="ap-user-name">{u.name || "（名前なし）"}</div>
                        <div className="ap-user-email">{u.email || ""}</div>
                      </button>

                      {/* ✅ 選択したアカウントの直下に表示 */}
                      {isActive && (
                        <div className="ap-inline-form">
                          <div className="ap-selected">
                            選択中：<b>{selectedLabel}</b>
                          </div>

                          <div className="ap-wallet">
                            現在残高：
                            <b>
                              {" "}
                              {walletReady
                                ? Number(wallet.balance ?? 0).toLocaleString("ja-JP")
                                : "…"}
                              pt
                            </b>
                          </div>

                          <div className="ap-row">
                            <label className="ap-label">変更後の残高</label>
                            <div>
                              <input
                                className="ap-input"
                                inputMode="numeric"
                                value={String(newBalance)}
                                onChange={(e) =>
                                  setNewBalance(
                                    Number(e.target.value.replace(/[^\d]/g, "") || 0)
                                  )
                                }
                                placeholder="例：200"
                              />
                              <div className="ap-hint">
                                ※ 数字を増やすと付与 / 減らすと減算（変更後の残高に合わせます）
                              </div>
                            </div>
                          </div>

                          <button className="ap-btn" disabled={busy} onClick={applyNewBalance}>
                            反映
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}