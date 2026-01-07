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

  // 全員付与
  const [allAmount, setAllAmount] = useState(100);
  const [allReason, setAllReason] = useState("");

  // ユーザー検索
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  // 選択ユーザーのwallet
  const [wallet, setWallet] = useState<WalletRow | null>(null);

  // ✅ 「変更後の残高」入力（初期値＝現在残高）
  const [newBalance, setNewBalance] = useState<number>(0);

  const [reason, setReason] = useState("");

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

    const b = Number((data as any).balance ?? 0);
    setWallet({ user_id: data.user_id, balance: b });
    setNewBalance(b); // ✅ 初期値＝現在残高
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

  // 全員付与
  const grantAll = async () => {
    setMsg("");
    const v = Math.floor(Number(allAmount || 0));
    if (v <= 0) {
      setMsg("付与ポイントは 1以上にしてください");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("points_admin_grant_all", {
        p_amount: v,
        p_reason: allReason || null,
      });

      if (error) {
        console.error(error);
        setMsg("全員付与に失敗しました: " + error.message);
        return;
      }

      setMsg(`全員に ${v}pt 付与しました（対象 ${Number(data ?? 0)} 件）`);
      setAllReason("");
      if (selected) await loadWallet(selected.id);
    } finally {
      setBusy(false);
    }
  };

  // ✅ 変更後残高へ「増減どっちも」合わせる
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
    const next = Math.max(Math.floor(Number(newBalance || 0)), 0); // 0未満は禁止

    if (next === cur) {
      setMsg("変更がありません");
      return;
    }

    const delta = next - cur; // ✅ +なら付与 / -なら減算

    setBusy(true);
    try {
      const { error } = await supabase.rpc("points_admin_adjust_user", {
        p_user_id: selected.id,
        p_amount: delta,
        p_reason: reason || null,
      });

      if (error) {
        console.error(error);
        setMsg("反映に失敗しました: " + error.message);
        return;
      }

      const sign = delta > 0 ? "+" : "-";
      setMsg(`残高を ${next}pt に変更しました（${sign}${Math.abs(delta)}pt）`);
      setReason("");
      await loadWallet(selected.id); // ✅ 再読み込みで入力欄も更新
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
                value={String(allAmount)}
                onChange={(e) =>
                  setAllAmount(Number(e.target.value.replace(/[^\d]/g, "") || 0))
                }
              />
            </div>

            <div className="ap-row">
              <label className="ap-label">理由（任意）</label>
              <input
                className="ap-input"
                value={allReason}
                onChange={(e) => setAllReason(e.target.value)}
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
                {users.map((u) => (
                  <button
                    key={u.id}
                    className={`ap-user ${selected?.id === u.id ? "active" : ""}`}
                    onClick={async () => {
                      setSelected(u);
                      await loadWallet(u.id);
                    }}
                    type="button"
                  >
                    <div className="ap-user-name">{u.name || "（名前なし）"}</div>
                    <div className="ap-user-email">{u.email || ""}</div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <>
                <div className="ap-selected">
                  選択中：<b>{selectedLabel}</b>
                </div>

                <div className="ap-wallet">
                  現在残高：<b>{Number(wallet?.balance ?? 0).toLocaleString("ja-JP")} pt</b>
                </div>

                <div className="ap-row">
                  <label className="ap-label">変更後の残高</label>
                  <input
                    className="ap-input"
                    inputMode="numeric"
                    value={String(newBalance)}
                    onChange={(e) =>
                      setNewBalance(Number(e.target.value.replace(/[^\d]/g, "") || 0))
                    }
                    placeholder="例：200"
                  />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    ※ 数字を増やすと付与 / 減らすと減算されます（変更後の残高に合わせます）
                  </div>
                </div>

                <div className="ap-row">
                  <label className="ap-label">理由（任意）</label>
                  <input
                    className="ap-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <button className="ap-btn" disabled={busy} onClick={applyNewBalance}>
                  反映
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}