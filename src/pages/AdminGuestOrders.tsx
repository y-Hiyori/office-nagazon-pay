// src/pages/AdminGuestOrders.tsx
// ✅ v33：ゲスト（アカウント未登録）の購入履歴を管理者が確認する画面
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminGuestOrders.css";

type GuestOrder = {
  id: string;
  created_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;
  coupon_code: string | null;
  payment_method: string | null;
  status: string | null;
  fulfillment_type: string | null;
  shipping_status: string | null;
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

export default function AdminGuestOrders() {
  const nav = useNavigate();
  const [rows, setRows] = useState<GuestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,created_at,name,email,phone,subtotal,discount_amount,total,coupon_code,payment_method,status,fulfillment_type,shipping_status"
      )
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("guest orders error:", error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as GuestOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.id, r.name, r.email, r.phone, r.coupon_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, q]);

  const tv = useMemo(() => {
    let paid = 0;
    let discount = 0;
    for (const r of filtered) {
      paid += Number(r.total) || 0;
      discount += Number(r.discount_amount) || 0;
    }
    return { paid, discount };
  }, [filtered]);

  return (
    <>
      <AdminHeader />

      <div className="admin-guest-page">
        <div className="admin-guest-head">
          <div>
            <h2>ゲスト購入履歴</h2>
            <p className="admin-guest-sub">
              アカウントを作らずに購入した方の履歴です。氏名・メール・注文IDで検索できます。
            </p>
          </div>
          <div className="admin-guest-actions">
            <button className="btn ghost" onClick={load}>
              更新
            </button>
          </div>
        </div>

        <div className="admin-guest-stats">
          <div className="stat">
            <span className="stat-label">件数</span>
            <span className="stat-value">{filtered.length} 件</span>
          </div>
          <div className="stat">
            <span className="stat-label">入金額合計</span>
            <span className="stat-value">{fmt(tv.paid)} 円</span>
          </div>
          <div className="stat">
            <span className="stat-label">クーポン値引き合計</span>
            <span className="stat-value">{fmt(tv.discount)} 円</span>
          </div>
        </div>

        <div className="admin-guest-filter">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="氏名・メール・電話・注文ID・クーポンコードで検索"
          />
        </div>

        {loading ? (
          <p className="admin-guest-empty">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="admin-guest-empty">ゲスト購入の履歴はありません</p>
        ) : (
          <div className="admin-guest-list">
            {filtered.map((r) => (
              <button
                key={r.id}
                className="admin-guest-item"
                onClick={() => nav(`/admin-order-detail/${r.id}`)}
                type="button"
              >
                <div className="gi-main">
                  <div className="gi-top">
                    <span className="gi-name">{r.name || "(名前なし)"}</span>
                    <span className="gi-badge">ゲスト</span>
                    {r.coupon_code && <span className="gi-coupon">クーポン {r.coupon_code}</span>}
                    {r.fulfillment_type === "shipping" && (
                      <span className="gi-ship">
                        {r.shipping_status === "shipped" ? "発送完了" : "発送準備中"}
                      </span>
                    )}
                  </div>
                  <div className="gi-sub">{r.email || "-"}</div>
                  <div className="gi-sub">
                    {dateTime(r.created_at)}
                    {r.phone ? ` ／ ${r.phone}` : ""}
                  </div>
                  <div className="gi-id">注文ID {r.id}</div>
                </div>
                <div className="gi-right">
                  <div className="gi-total">{fmt(r.total)}円</div>
                  {Number(r.discount_amount) > 0 && (
                    <div className="gi-disc">-{fmt(r.discount_amount)}円</div>
                  )}
                  <div className="gi-open">注文詳細を見る ＞</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
