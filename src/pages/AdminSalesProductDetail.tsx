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
  lineSubtotal: number; // この商品の小計（数量×単価の合計）
  orderTotal: number;   // 注文全体の支払合計（orders.total）
};

type LocationState = {
  startIso?: string;
  endIso?: string;
};

function AdminSalesProductDetail() {
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

  const formatPrice = (v: any) => (Number(v) || 0).toLocaleString("ja-JP");
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

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
        // 1) 対象期間の orders を取得（売上画面から来る想定なので paid のみ）
        let q = supabase
          .from("orders")
          .select("id, user_id, created_at, total, status")
          .eq("status", "paid"); // ✅ 売上＝支払い完了のみ（外したいならこの1行消す）

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

        // 3) プロフィール（名前/メール）を取る
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

        // 4) ✅ 注文IDごとに集計（同一注文に同商品行が複数ある可能性も吸収）
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

        // 5) 画面用の配列へ
        const list: OrderViewRow[] = [];

        for (const [orderId, agg] of byOrder.entries()) {
          const o = orderMap.get(orderId);
          if (!o) continue;

          const userId = String(o.user_id || "");
          const prof = profileMap.get(userId);

          list.push({
            orderId,
            createdAt: String(o.created_at || ""),
            userId,
            userName: prof?.name || "(名前未設定)",
            userEmail: prof?.email || "",
            qty: agg.qty,
            lineSubtotal: agg.sub,
            orderTotal: toNumber(o.total),
          });
        }

        // 日時の新しい順
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
                  <p>
                    <strong>注文ID：</strong> <span>{r.orderId}</span>
                  </p>
                  <p>
                    <strong>日時：</strong> <span>{r.createdAt ? formatDateJST(r.createdAt) : "-"}</span>
                  </p>
                  <p>
                    <strong>購入者：</strong>{" "}
                    <span>
                      {r.userName}（{r.userId || "-"}）
                    </span>
                  </p>
                  <p>
                    <strong>メール：</strong> <span>{r.userEmail || "(未設定)"}</span>
                  </p>
                  <p>
                    <strong>数量：</strong> <span>{r.qty.toLocaleString()} 個</span>
                  </p>
                  <p>
                    <strong>この商品小計：</strong> <span>{formatPrice(r.lineSubtotal)} 円</span>
                  </p>
                  <p>
                    <strong>注文合計：</strong> <span>{formatPrice(r.orderTotal)} 円</span>
                  </p>

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

export default AdminSalesProductDetail;