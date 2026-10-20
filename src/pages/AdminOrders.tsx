// src/pages/AdminOrders.tsx
// 管理者：注文検索・キャンセル（返金）対応
// スマホでもPCでも探しやすいようにカード一覧＋大きな操作領域にしています。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import Loading from "../components/Loading";
import { isUnpaidCanceled } from "../lib/orderCancel";
import "./AdminOrders.css";

type OrderRow = {
  id: string;
  created_at: string | null;
  user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  total: number | null;
  status: string | null;
  paid_at: string | null;
  payment_method: string | null;
  fulfillment_type: string | null;
  shipping_status: string | null;
  refund_amount: number | null;
  canceled_at: string | null;
};

type RequestRow = {
  id: string;
  order_id: string;
  reason: string | null;
  status: string;
  created_at: string | null;
};

type ItemRow = {
  order_id: string;
  product_name: string | null;
  quantity: number | null;
};

type Filter = "all" | "requested" | "paid" | "shipped" | "canceled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "requested", label: "キャンセル申請中" },
  { key: "paid", label: "支払済（発送前）" },
  { key: "shipped", label: "発送済み" },
  { key: "canceled", label: "キャンセル済み" },
];

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

const isCanceled = (o: OrderRow) => String(o.status || "").toLowerCase() === "canceled";
const isShipped = (o: OrderRow) =>
  o.fulfillment_type === "shipping" && String(o.shipping_status || "") === "shipped";
const isPaid = (o: OrderRow) => String(o.status || "").toLowerCase() === "paid";

export default function AdminOrders() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [requests, setRequests] = useState<Record<string, RequestRow>>({});
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, ItemRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    setErr("");

    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id,created_at,user_id,name,email,phone,total,status,paid_at,payment_method,fulfillment_type,shipping_status,refund_amount,canceled_at"
      )
      .order("created_at", { ascending: false })
      .limit(400);

    if (orderErr) {
      setErr("注文を読み込めませんでした。");
      setOrders([]);
      setLoading(false);
      return;
    }

    const safeOrders = (orderData ?? []) as OrderRow[];
    setOrders(safeOrders);

    // 申請中（未対応）の一覧
    const { data: reqData, error: reqErr } = await supabase
      .from("order_cancel_requests")
      .select("id,order_id,reason,status,created_at")
      .eq("status", "requested")
      .order("created_at", { ascending: true });

    if (!reqErr) {
      const m: Record<string, RequestRow> = {};
      for (const r of (reqData ?? []) as RequestRow[]) m[r.order_id] = r;
      setRequests(m);
    } else {
      console.error("cancel requests error:", reqErr);
      setRequests({});
    }

    // 商品名（カードに1〜2件だけ表示）
    const ids = safeOrders.map((o) => o.id);
    if (ids.length) {
      const { data: itemData } = await supabase
        .from("order_items")
        .select("order_id,product_name,quantity")
        .in("order_id", ids);

      const grouped: Record<string, ItemRow[]> = {};
      for (const it of (itemData ?? []) as ItemRow[]) {
        if (!grouped[it.order_id]) grouped[it.order_id] = [];
        grouped[it.order_id].push(it);
      }
      setItemsByOrder(grouped);
    } else {
      setItemsByOrder({});
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    let requested = 0;
    let paid = 0;
    let shipped = 0;
    let canceled = 0;
    for (const o of orders) {
      if (isCanceled(o)) {
        if (!isUnpaidCanceled(o)) canceled++;
      } else if (isShipped(o)) shipped++;
      else if (isPaid(o)) paid++;
      if (requests[o.id]) requested++;
    }
    return { requested, paid, shipped, canceled };
  }, [orders, requests]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "requested" && !requests[o.id]) return false;
      if (filter === "paid" && (!isPaid(o) || isShipped(o))) return false;
      if (filter === "shipped" && !isShipped(o)) return false;
      if (filter === "canceled" && (!isCanceled(o) || isUnpaidCanceled(o))) return false;

      if (!s) return true;
      const hay = [o.id, o.name, o.email, o.phone, o.user_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [orders, requests, q, filter]);

  const statusBadge = (o: OrderRow) => {
    const req = requests[o.id];
    if (isUnpaidCanceled(o)) return { cls: "is-pending", text: "未払い取消" };
    if (isCanceled(o)) return { cls: "is-canceled", text: "キャンセル済み" };
    if (req) return { cls: "is-requested", text: "キャンセル申請中" };
    if (isShipped(o)) return { cls: "is-shipped", text: "発送済み" };
    if (isPaid(o)) return { cls: "is-paid", text: "支払済" };
    if (String(o.status || "").toLowerCase() === "pending") return { cls: "is-pending", text: "未払い" };
    return { cls: "is-pending", text: o.status || "不明" };
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-orders-search-page">
        <div className="aos-container">
          <div className="aos-head">
            <div>
              <h2>注文検索・キャンセル</h2>
              <p>注文ID・お名前・メール・電話番号で検索できます。</p>
            </div>
            <button type="button" className="aos-refresh" onClick={load} disabled={loading}>
              更新
            </button>
          </div>

          {err && <div className="aos-error">{err}</div>}

          <div className="aos-stats">
            <button
              type="button"
              className={`aos-stat is-request ${filter === "requested" ? "is-active" : ""}`}
              onClick={() => setFilter("requested")}
            >
              <span>キャンセル申請中</span>
              <strong>{counts.requested} 件</strong>
            </button>
            <div className="aos-stat">
              <span>支払済（発送前）</span>
              <strong>{counts.paid} 件</strong>
            </div>
            <div className="aos-stat">
              <span>発送済み</span>
              <strong>{counts.shipped} 件</strong>
            </div>
            <div className="aos-stat">
              <span>キャンセル済み</span>
              <strong>{counts.canceled} 件</strong>
            </div>
          </div>

          <div className="aos-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="注文ID・氏名・メール・電話で検索"
              inputMode="search"
              autoComplete="off"
            />
            {q && (
              <button type="button" className="aos-search-clear" onClick={() => setQ("")} aria-label="クリア">
                ×
              </button>
            )}
          </div>

          <div className="aos-filters" role="tablist" aria-label="絞り込み">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`aos-filter ${filter === f.key ? "is-active" : ""} ${
                  f.key === "requested" && counts.requested > 0 ? "has-request" : ""
                }`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key === "requested" && counts.requested > 0 && (
                  <span className="aos-filter-count">{counts.requested}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <p className="aos-empty">該当する注文がありません。</p>
          ) : (
            <div className="aos-list">
              {filtered.map((o) => {
                const badge = statusBadge(o);
                const req = requests[o.id];
                const items = itemsByOrder[o.id] ?? [];
                const preview = items.slice(0, 2);
                const more = items.length - preview.length;
                const who = o.name || o.email || (o.user_id ? "会員" : "ゲスト");

                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`aos-card ${req ? "is-request" : ""}`}
                    onClick={() => nav(`/admin-order-detail/${o.id}`)}
                  >
                    <div className="aos-card-top">
                      <div className="aos-who">
                        <strong>{who}</strong>
                        <span className="aos-member">{o.user_id ? "会員" : "ゲスト"}</span>
                      </div>
                      <span className={`aos-badge ${badge.cls}`}>{badge.text}</span>
                    </div>

                    {o.email && <div className="aos-email">{o.email}</div>}

                    <div className="aos-meta">
                      <span>{dateTime(o.created_at)}</span>
                      <span className="aos-id">注文ID {o.id}</span>
                    </div>

                    {preview.length > 0 && (
                      <div className="aos-items">
                        {preview.map((it, idx) => (
                          <span key={idx}>
                            {it.product_name || "商品"} ×{Number(it.quantity) || 0}
                          </span>
                        ))}
                        {more > 0 && <span>＋{more}件</span>}
                      </div>
                    )}

                    {req && (
                      <div className="aos-request">
                        <span className="aos-request-label">申請理由</span>
                        <span>{req.reason || "（理由なし）"}</span>
                      </div>
                    )}

                    <div className="aos-card-bottom">
                      <div className="aos-total">
                        {fmt(o.total)}円
                        {isCanceled(o) && Number(o.refund_amount) > 0 && (
                          <span className="aos-refunded">返金済み {fmt(o.refund_amount)}円</span>
                        )}
                      </div>
                      <span className="aos-open">詳細・対応する ›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
