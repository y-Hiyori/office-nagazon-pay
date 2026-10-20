// src/pages/AdminFailedOrders.tsx
// 管理者：決済が完了していない注文（未払い・決済失敗・未払い取消）だけを表示し、
// まとめて削除するための整理画面。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { appDialog } from "../lib/appDialog";
import "./AdminFailedOrders.css";

type FailedOrder = {
  id: string;
  created_at: string | null;
  user_id: string | null;
  name: string | null;
  email: string | null;
  total: number | null;
  status: string | null;
  paid_at: string | null;
  payment_method: string | null;
};

const fmt = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("ja-JP");

const dateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (status: string | null) => {
  const st = String(status || "").toLowerCase();
  if (st === "failed") return { text: "決済失敗", cls: "is-failed" };
  if (st === "pending") return { text: "未払い", cls: "is-pending" };
  if (st === "canceled") return { text: "未払い取消", cls: "is-canceled" };
  return { text: st || "不明", cls: "is-pending" };
};

export default function AdminFailedOrders() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<FailedOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("orders")
      .select("id,created_at,user_id,name,email,total,status,paid_at,payment_method")
      .in("status", ["pending", "failed", "canceled"])
      .is("paid_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setErr("決済失敗の注文を読み込めませんでした。");
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders((data ?? []) as FailedOrder[]);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const allSelected = orders.length > 0 && selected.size === orders.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  };

  const oldest = useMemo(() => {
    if (!orders.length) return null;
    return orders[orders.length - 1]?.created_at ?? null;
  }, [orders]);

  const handleBulkDelete = async () => {
    if (busy || selected.size === 0) return;

    const ids = Array.from(selected);

    const ok = await appDialog.confirm({
      title: "決済失敗の注文をまとめて削除",
      message:
        `選択した ${ids.length}件 を削除します。\n` +
        "支払い・在庫・ポイントへの影響はありません。\n" +
        "支払済みと判明した注文は削除されません。削除内容はログに残ります。\nよろしいですか？",
      okText: `${ids.length}件を削除する`,
      cancelText: "やめる",
    });
    if (!ok) return;

    setBusy(true);
    setProgress({ done: 0, total: ids.length });

    let deleted = 0;
    let skipped = 0;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      if (!accessToken) {
        await appDialog.alert({ message: "ログイン情報を取得できませんでした。再ログインしてください。" });
        return;
      }

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          const res = await fetch("/api/admin-delete-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: id, accessToken }),
          });
          const json = await res.json().catch(() => null);
          if (res.ok && json?.ok) deleted++;
          else skipped++;
        } catch {
          skipped++;
        }
        setProgress({ done: i + 1, total: ids.length });
      }

      await load();

      await appDialog.alert({
        message:
          `削除しました：${deleted}件` +
          (skipped > 0
            ? `\n残した注文：${skipped}件（支払済み・確認できなかった注文）`
            : ""),
      });
    } catch (e) {
      console.error(e);
      await appDialog.alert({ message: "削除処理中にエラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-failed-page">
        <div className="afo-container">
          <div className="afo-head">
            <div>
              <h2>決済失敗の整理</h2>
              <p>未払い・決済失敗・未払い取消の注文だけを表示しています。</p>
            </div>
            <button type="button" className="afo-refresh" onClick={load} disabled={loading || busy}>
              更新
            </button>
          </div>

          <div className="afo-note">
            ここに表示される注文は売上・在庫・ポイントに含まれていません。削除しても影響ありません。
          </div>

          {err && <div className="afo-error">{err}</div>}

          <div className="afo-summary">
            <div className="afo-stat">
              <span>対象の注文</span>
              <strong>{orders.length} 件</strong>
            </div>
            <div className="afo-stat">
              <span>最も古い注文</span>
              <strong className="afo-oldest">{dateTime(oldest)}</strong>
            </div>
          </div>

          {loading ? (
            <Loading />
          ) : orders.length === 0 ? (
            <p className="afo-empty">決済失敗の注文はありません。</p>
          ) : (
            <>
              <div className="afo-toolbar">
                <label className="afo-select-all">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span>すべて選択</span>
                </label>
                <span className="afo-selected-count">{selected.size}件選択中</span>
              </div>

              <div className="afo-list">
                {orders.map((o) => {
                  const badge = statusLabel(o.status);
                  const who = o.name || o.email || (o.user_id ? "会員" : "ゲスト");

                  return (
                    <div key={o.id} className={`afo-item ${selected.has(o.id) ? "is-selected" : ""}`}>
                      <label className="afo-check">
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggle(o.id)}
                          aria-label={`${o.id} を選択`}
                        />
                      </label>

                      <div className="afo-main">
                        <div className="afo-top">
                          <strong>{who}</strong>
                          <span className={`afo-badge ${badge.cls}`}>{badge.text}</span>
                        </div>
                        {o.email && <div className="afo-email">{o.email}</div>}
                        <div className="afo-meta">
                          <span>{dateTime(o.created_at)}</span>
                          <span className="afo-id">注文ID {o.id}</span>
                        </div>
                        <div className="afo-bottom">
                          <span className="afo-total">{fmt(o.total)}円</span>
                          <button
                            type="button"
                            className="afo-detail"
                            onClick={() => nav(`/admin-order-detail/${o.id}`)}
                          >
                            詳細
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="afo-bulkbar">
          <div className="afo-bulkbar-inner">
            <span className="afo-bulk-count">
              {busy
                ? `削除中... ${progress.done}/${progress.total}`
                : `${selected.size}件を選択中`}
            </span>
            <button
              type="button"
              className="afo-bulk-delete"
              onClick={handleBulkDelete}
              disabled={busy}
            >
              {busy ? "処理中..." : "まとめて削除"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
