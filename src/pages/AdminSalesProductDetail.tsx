import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminSalesProductDetail.css";

type OrderBaseRow = {
  id: string;
  user_id: string | null;
  created_at: string | null;
  total: number | null;
  status?: string | null;

  subtotal: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  points_used: number | null;
  points_applied: number | null;
};

type ItemRow = {
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  price: number | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type OrderViewRow = {
  orderId: string;
  createdAt: string;

  userId: string;
  userName: string;
  userEmail: string;

  qty: number;

  // この商品（割引前）
  lineSubtotalRaw: number;

  // この商品（割引後：按分）
  lineSubtotalAfterDiscount: number;

  // この商品に乗った割引額（按分）
  lineDiscountShare: number;

  // 注文全体
  orderSubtotal: number;
  orderTotal: number;
  orderDiscountTotal: number;

  // 表示用（任意）
  couponCode: string;
  pointsUsed: number;
};

type LocationState = {
  startIso?: string;
  endIso?: string;
};

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatPrice = (v: any) => (Number(v) || 0).toLocaleString("ja-JP");

const formatDateJST = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatRangeEndJST = (iso: string) => {
  const d = new Date(iso);
  d.setMilliseconds(d.getMilliseconds() - 1);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ✅ 按分（割合配分）して「この商品割引後小計」を作る
const calcDiscountedLineSubtotal = (args: {
  lineSubtotalRaw: number;
  orderSubtotal: number;
  orderTotal: number;
}) => {
  const { lineSubtotalRaw, orderSubtotal, orderTotal } = args;

  const sub = Math.max(0, Math.round(orderSubtotal));
  const tot = Math.max(0, Math.round(orderTotal));
  const raw = Math.max(0, Math.round(lineSubtotalRaw));

  if (sub <= 0) {
    return { after: raw, share: 0, orderDiscountTotal: Math.max(0, sub - tot) };
  }

  // 注文全体の総割引（クーポン/ポイント/その他込み）
  const orderDiscountTotal = Math.max(0, sub - tot);

  const ratio = Math.min(1, Math.max(0, raw / sub));
  const share = Math.min(raw, Math.round(orderDiscountTotal * ratio));
  const after = Math.max(0, raw - share);

  return { after, share, orderDiscountTotal };
};

export default function AdminSalesProductDetail() {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const productName = name ? decodeURIComponent(name) : "";

  const [rows, setRows] = useState<OrderViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ✅ 検索（注文ID / user_id / 名前 / メール）
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!productName) {
        setError("商品名が不明です");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setRows([]);

      try {
        // 1) 対象期間の orders を取得（売上＝支払い完了のみ）
        let q = supabase
          .from("orders")
          .select(
            "id,user_id,created_at,total,status,subtotal,discount_amount,coupon_code,points_used,points_applied"
          )
          .eq("status", "paid");

        if (state.startIso && state.endIso) {
          q = q.gte("created_at", state.startIso).lt("created_at", state.endIso);
        }

        const { data: orders, error: ordersError } = await q.order("created_at", {
          ascending: false,
        });

        if (ordersError) {
          console.error(ordersError);
          setError("注文の取得に失敗しました");
          setLoading(false);
          return;
        }
        if (!orders || orders.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        const orderIds = (orders as OrderBaseRow[]).map((o) => o.id);
        const orderMap = new Map<string, OrderBaseRow>(
          (orders as OrderBaseRow[]).map((o) => [o.id, o])
        );

        // 2) その orders の中で、この商品だけの order_items を取得
        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select("order_id, product_name, quantity, price")
          .in("order_id", orderIds)
          .eq("product_name", productName);

        if (itemsError) {
          console.error(itemsError);
          setError("注文商品の取得に失敗しました");
          setLoading(false);
          return;
        }
        if (!items || items.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        // 3) プロフィール（名前/メール）
        const userIds = Array.from(
          new Set((orders as OrderBaseRow[]).map((o) => o.user_id).filter(Boolean))
        ) as string[];

        let profileMap = new Map<string, ProfileRow>();
        if (userIds.length > 0) {
          const { data: profiles, error: profError } = await supabase
            .from("profiles")
            .select("id, name, email")
            .in("id", userIds);

          if (profError) {
            console.error(profError);
            setError("ユーザー情報の取得に失敗しました");
            setLoading(false);
            return;
          }
          profileMap = new Map((profiles || []).map((p: any) => [p.id, p] as const));
        }

        // 4) 注文IDごとに集計（同一注文に同商品が複数行あっても合算）
        const byOrder = new Map<string, { qty: number; sub: number }>();
        for (const it of items as ItemRow[]) {
          const oid = it.order_id;
          if (!oid) continue;

          const qty = toNumber(it.quantity);
          const price = toNumber(it.price);
          const sub = qty * price;

          if (!byOrder.has(oid)) byOrder.set(oid, { qty: 0, sub: 0 });
          const cur = byOrder.get(oid)!;
          cur.qty += qty;
          cur.sub += sub;
        }

        // 5) 画面用配列
        const list: OrderViewRow[] = [];

        for (const [orderId, agg] of byOrder.entries()) {
          const o = orderMap.get(orderId);
          if (!o) continue;

          const userId = String(o.user_id || "");
          const prof = profileMap.get(userId);

          const orderSubtotal = toNumber((o as any).subtotal);
          const orderTotal = toNumber((o as any).total);

          const { after, share, orderDiscountTotal } = calcDiscountedLineSubtotal({
            lineSubtotalRaw: agg.sub,
            orderSubtotal,
            orderTotal,
          });

          list.push({
            orderId,
            createdAt: String(o.created_at || ""),

            userId,
            userName: prof?.name || "(名前未設定)",
            userEmail: prof?.email || "",

            qty: agg.qty,

            lineSubtotalRaw: Math.round(agg.sub),
            lineSubtotalAfterDiscount: after,
            lineDiscountShare: share,

            orderSubtotal: Math.round(orderSubtotal),
            orderTotal: Math.round(orderTotal),
            orderDiscountTotal,

            couponCode: String((o as any).coupon_code || "").trim(),
            pointsUsed: Math.floor(toNumber((o as any).points_used)),
          });
        }

        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRows(list);
      } catch (e) {
        console.error(e);
        setError("予期せぬエラーが発生しました");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [productName, state.startIso, state.endIso]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        (r.orderId || "").toLowerCase().includes(q) ||
        (r.userId || "").toLowerCase().includes(q) ||
        (r.userName || "").toLowerCase().includes(q) ||
        (r.userEmail || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  if (!productName) return <p style={{ padding: 20 }}>商品名が不明です。</p>;

  return (
    <>
      <AdminHeader />

      <div className="admin-sales-product-page" style={{ paddingTop: 80 }}>
        <div className="admin-sales-product-card">
          <button
            type="button"
            className="admin-sales-product-back"
            onClick={() => navigate(-1)}
            aria-label="戻る"
          >
            ← 戻る
          </button>

          <h2 className="admin-sales-product-title">
            「{productName}」
            <br />
            注文一覧
          </h2>

          {state.startIso && state.endIso && (
            <p className="admin-sales-product-range">
              期間：
              <span>
                {formatDateJST(state.startIso)} ～ {formatRangeEndJST(state.endIso)}
              </span>
            </p>
          )}

          {/* ✅ 検索 */}
          <div className="admin-sales-product-search">
            <input
              className="admin-sales-product-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="注文ID / user_id / 名前 / メールで検索"
              inputMode="search"
              autoComplete="off"
            />
            {query.trim() && (
              <button
                type="button"
                className="admin-sales-product-search-clear"
                onClick={() => setQuery("")}
                aria-label="検索をクリア"
              >
                ×
              </button>
            )}
          </div>

          {!loading && (
            <p className="admin-sales-product-count">
              {query.trim() ? `検索結果：${filtered.length}件` : `全${rows.length}件`}
            </p>
          )}

          {loading ? (
            <p className="admin-sales-product-loading">読み込み中...</p>
          ) : error ? (
            <p className="admin-sales-product-error">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="admin-sales-product-empty">
              {query.trim()
                ? "該当する注文がありません"
                : "この期間にこの商品が含まれる注文はありません"}
            </p>
          ) : (
            <div className="admin-sales-product-list">
              {filtered.map((r) => (
                <div
                  key={r.orderId}
                  className="admin-sales-product-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/admin-order-detail/${r.orderId}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/admin-order-detail/${r.orderId}`);
                    }
                  }}
                >
                  {/* ✅ ヘッダー：注文ID / 日時 */}
                  <div className="aspi-head">
                    <div className="aspi-oid">
                      <span className="aspi-label">注文ID</span>
                      <span className="aspi-oid-value">{r.orderId}</span>
                    </div>
                    <div className="aspi-date">{r.createdAt ? formatDateJST(r.createdAt) : "-"}</div>
                  </div>

                  {/* ✅ バッジ：クーポン / ポイント / 割引あり */}
                  <div className="aspi-badges">
                    {r.couponCode && <span className="aspi-badge">クーポン</span>}
                    {r.pointsUsed > 0 && <span className="aspi-badge">ポイント</span>}
                    {r.orderDiscountTotal > 0 && <span className="aspi-badge aspi-badge-strong">割引あり</span>}
                  </div>

                  {/* ✅ 購入者 */}
                  <div className="aspi-user">
                    <div className="aspi-user-name">{r.userName}</div>
                    <div className="aspi-user-sub">
                      <span className="aspi-user-id">user_id: {r.userId || "-"}</span>
                    </div>
                    <div className="aspi-user-email">{r.userEmail || "(未設定)"}</div>
                  </div>

                  {/* ✅ 金額：見たい所だけ太く */}
                  <div className="aspi-metrics">
                    <div className="aspi-metric">
                      <div className="aspi-metric-label">数量</div>
                      <div className="aspi-metric-value">{r.qty.toLocaleString()} 個</div>
                    </div>

                    <div className="aspi-metric aspi-metric-main">
  <div className="aspi-metric-label">この商品小計</div>
  <div className="aspi-metric-value">
    {formatPrice(r.lineSubtotalRaw)} 円
  </div>
</div>

                    <div className="aspi-metric">
                      <div className="aspi-metric-label">注文合計</div>
                      <div className="aspi-metric-value">{formatPrice(r.orderTotal)} 円</div>
                    </div>
                  </div>

                  <div className="admin-sales-product-open">注文詳細を見る ＞</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}