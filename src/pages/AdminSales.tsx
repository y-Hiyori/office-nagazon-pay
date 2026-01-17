// src/pages/AdminSales.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminSales.css";

type SalesItem = {
  product_name: string;

  // 合計
  quantity: number;

  // ✅ 割引前（= order_items の 数量×単価 合計）
  subtotal_raw: number;

  // ✅ 割引後（注文全体の割引を “この商品” に割合按分して反映）
  subtotal_after_discount: number;

  // ✅ 件数（この商品が含まれる注文のうち）
  coupon_orders_count: number; // クーポン使用
  points_orders_count: number; // ポイント使用
};

type RangeMode = "day" | "week" | "month" | "year";

type OrderRow = {
  id: string;
  total: number | null;
  created_at: string | null;
  status?: string | null;

  // ✅ CSVにある列
  subtotal: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  points_used: number | null;
  points_applied: number | null;
};

type OrderItemRow = {
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  price: number | null;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const formatWeekday = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return weekdayLabels[d.getDay()];
};

// ✅ 「モードだけ」覚える（※日付は毎回“開いた日”にリセット）
const STORAGE_KEY = "admin-sales-state-mode";

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round0 = (v: any) => Math.max(0, Math.round(toNumber(v)));

export default function AdminSales() {
  const navigate = useNavigate();
  const today = new Date();

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const formatYM = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  // ✅ 画面を開いた日の値
  const openedDay = formatYMD(today);
  const openedMonth = formatYM(today);
  const openedYear = String(today.getFullYear());

  const loadInitialMode = (): RangeMode => {
    if (typeof window === "undefined") return "day";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const m = (raw || "").trim() as RangeMode;
      if (m === "day" || m === "week" || m === "month" || m === "year") return m;
      return "day";
    } catch {
      return "day";
    }
  };

  const [mode, setMode] = useState<RangeMode>(loadInitialMode());

  // ✅ 日付系は “開いた日” に必ずリセット
  const [day, setDay] = useState<string>(openedDay);
  const [weekBase, setWeekBase] = useState<string>(openedDay);
  const [month, setMonth] = useState<string>(openedMonth);
  const [year, setYear] = useState<string>(openedYear);

  const [totalSales, setTotalSales] = useState<number>(0); // 支払合計（割引後）
  const [orderCount, setOrderCount] = useState<number>(0);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [currentRange, setCurrentRange] = useState<{
    startIso: string;
    endIso: string;
    rangeLabel: string;
  } | null>(null);

  const getWeekStartDate = (dateStr: string) => {
    const base = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime())) return null;
    const dow = base.getDay();
    base.setDate(base.getDate() - dow); // 日曜始まり
    return base;
  };

  const getWeekLabel = (weekBaseStr: string) => {
    if (!weekBaseStr) return "";
    const weekStart = getWeekStartDate(weekBaseStr);
    if (!weekStart) return "";
    const start = weekStart;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${formatYMD(start)} ～ ${formatYMD(end)}`;
  };

  // ✅ 注文全体の割引額（確定）は “subtotal - total”
  const getOrderDiscountTotal = (orderSubtotal: number, orderTotal: number) => {
    return Math.max(0, round0(orderSubtotal) - round0(orderTotal));
  };

  const loadSales = async (
    mode: RangeMode,
    day: string,
    weekBase: string,
    month: string,
    year: string
  ) => {
    setLoading(true);
    setError("");
    setItems([]);
    setTotalSales(0);
    setOrderCount(0);

    try {
      let start: Date;
      let end: Date;

      if (mode === "day") {
        if (!day) return;
        start = new Date(day + "T00:00:00");
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else if (mode === "week") {
        if (!weekBase) return;
        const weekStart = getWeekStartDate(weekBase);
        if (!weekStart) return;
        start = weekStart;
        end = new Date(weekStart);
        end.setDate(end.getDate() + 7);
      } else if (mode === "month") {
        if (!month) return;
        start = new Date(month + "-01T00:00:00");
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
      } else {
        if (!year) return;
        start = new Date(year + "-01-01T00:00:00");
        end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
      }

      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const rangeLabel =
        mode === "day"
          ? day
          : mode === "week"
          ? getWeekLabel(weekBase)
          : mode === "month"
          ? month
          : `${year}年`;

      setCurrentRange({ startIso, endIso, rangeLabel });

      // ✅ orders（割引やクーポン判定に必要な列も取得）
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id,total,created_at,status,subtotal,discount_amount,coupon_code,points_used,points_applied"
        )
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .eq("status", "paid")
        .order("created_at", { ascending: true });

      if (ordersError) {
        console.error("ordersError:", ordersError);
        setError("売上データの取得に失敗しました（orders）");
        return;
      }

      if (!orders || orders.length === 0) {
        setItems([]);
        setTotalSales(0);
        setOrderCount(0);
        return;
      }

      const orderRows = orders as any as OrderRow[];
      const orderIds = orderRows.map((o) => o.id);
      setOrderCount(orderRows.length);

      // ✅ 売上合計（割引後＝orders.total）
      const sumTotal = orderRows.reduce((sum, o) => sum + round0(o.total), 0);
      setTotalSales(sumTotal);

      // ✅ order_items（この期間の全注文の明細）
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, price")
        .in("order_id", orderIds);

      if (itemsError) {
        console.error("itemsError:", itemsError);
        setError("売上データの取得に失敗しました（order_items）");
        return;
      }

      if (!orderItems || orderItems.length === 0) {
        setItems([]);
        return;
      }

      // --- ここから集計（割引按分も含む） ---

      // 注文メタ
      const orderMap = new Map<string, OrderRow>(orderRows.map((o) => [o.id, o]));

      // 注文の割引前小計（itemsから計算）※ orders.subtotal が null の時の保険
      const orderSubtotalFromItems = new Map<string, number>();

      // 注文×商品 単位で一旦集計（同じ商品が同一注文で複数行あっても合算）
      const byOrderProduct = new Map<
        string,
        { orderId: string; productName: string; qty: number; rawSub: number }
      >();

      for (const row of orderItems as any as OrderItemRow[]) {
        const orderId = String(row.order_id || "");
        if (!orderId) continue;

        const productName = (row.product_name ?? "不明な商品") as string;
        const qty = round0(row.quantity);
        const price = round0(row.price);
        const rawSub = qty * price;

        // 注文小計（明細合計）
        orderSubtotalFromItems.set(
          orderId,
          (orderSubtotalFromItems.get(orderId) || 0) + rawSub
        );

        const key = `${orderId}__${productName}`;
        if (!byOrderProduct.has(key)) {
          byOrderProduct.set(key, { orderId, productName, qty: 0, rawSub: 0 });
        }
        const cur = byOrderProduct.get(key)!;
        cur.qty += qty;
        cur.rawSub += rawSub;
      }

      // 商品ごとの集計
      const productAgg = new Map<
        string,
        {
          quantity: number;
          subtotal_raw: number;
          subtotal_after_discount: number;
          couponOrders: Set<string>;
          pointsOrders: Set<string>;
        }
      >();

      const isCouponUsed = (o: OrderRow) => {
        const code = String(o.coupon_code || "").trim();
        // discount_amount が入る運用でもOK。両方0でも code があればクーポン使用扱い
        return !!code || round0(o.discount_amount) > 0;
      };

      const isPointsUsed = (o: OrderRow) => {
        return round0(o.points_used) > 0 || round0(o.points_applied) > 0;
      };

      // 按分：注文全体の割引を “商品rawSubの比率” で配分して、この商品の割引後小計を作る
      for (const { orderId, productName, qty, rawSub } of byOrderProduct.values()) {
        const o = orderMap.get(orderId);
        if (!o) continue;

        // 注文小計（orders.subtotal が正なら優先。無いなら items 合計）
        const orderSubtotal =
          round0(o.subtotal) > 0
            ? round0(o.subtotal)
            : round0(orderSubtotalFromItems.get(orderId) || 0);

        const orderTotal = round0(o.total);
        const orderDiscountTotal = getOrderDiscountTotal(orderSubtotal, orderTotal);

        let share = 0;
        if (orderSubtotal > 0 && orderDiscountTotal > 0 && rawSub > 0) {
          const ratio = Math.min(1, Math.max(0, rawSub / orderSubtotal));
          share = Math.min(rawSub, Math.round(orderDiscountTotal * ratio));
        }

        const after = Math.max(0, rawSub - share);

        if (!productAgg.has(productName)) {
          productAgg.set(productName, {
            quantity: 0,
            subtotal_raw: 0,
            subtotal_after_discount: 0,
            couponOrders: new Set<string>(),
            pointsOrders: new Set<string>(),
          });
        }

        const p = productAgg.get(productName)!;
        p.quantity += qty;
        p.subtotal_raw += rawSub;
        p.subtotal_after_discount += after;

        if (isCouponUsed(o)) p.couponOrders.add(orderId);
        if (isPointsUsed(o)) p.pointsOrders.add(orderId);
      }

      const list: SalesItem[] = Array.from(productAgg.entries())
        .map(([product_name, v]) => ({
          product_name,
          quantity: v.quantity,
          subtotal_raw: Math.round(v.subtotal_raw),
          subtotal_after_discount: Math.round(v.subtotal_after_discount),
          coupon_orders_count: v.couponOrders.size,
          points_orders_count: v.pointsOrders.size,
        }))
        // ✅ 並び：割引後売上の高い順
        .sort((a, b) => b.subtotal_after_discount - a.subtotal_after_discount);

      setItems(list);
    } catch (e) {
      console.error(e);
      setError("予期せぬエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 初回表示時に「開いた日」に必ず合わせる
  useEffect(() => {
    setDay(openedDay);
    setWeekBase(openedDay);
    setMonth(openedMonth);
    setYear(openedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSales(mode, day, weekBase, month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, weekBase, month, year]);

  // ✅ モードだけ保存
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const rangeLabel =
    mode === "day"
      ? day
      : mode === "week"
      ? getWeekLabel(weekBase)
      : mode === "month"
      ? month
      : `${year}年`;

  return (
    <>
      <AdminHeader />

      <div className="admin-sales-page" style={{ paddingTop: 80 }}>
        <div className="admin-sales-card">
          <h2 className="admin-sales-title">売上状況</h2>

          <div className="admin-sales-mode">
            <button
              className={mode === "day" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("day")}
            >
              日
            </button>
            <button
              className={mode === "week" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("week")}
            >
              週
            </button>
            <button
              className={mode === "month" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("month")}
            >
              月
            </button>
            <button
              className={mode === "year" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("year")}
            >
              年
            </button>
          </div>

          <div className="admin-sales-date-row">
            {mode === "day" && (
              <>
                <label>日付：</label>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </>
            )}

            {mode === "week" && (
              <>
                <label>週の任意の日付：</label>
                <input
                  type="date"
                  value={weekBase}
                  onChange={(e) => setWeekBase(e.target.value)}
                />
              </>
            )}

            {mode === "month" && (
              <>
                <label>月：</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </>
            )}

            {mode === "year" && (
              <>
                <label>年：</label>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </>
            )}
          </div>

          {loading ? (
            <p className="admin-sales-loading">読み込み中...</p>
          ) : error ? (
            <p className="admin-sales-error">{error}</p>
          ) : (
            <>
              <div className="admin-sales-summary">
                <p>
                  対象：{rangeLabel}
                  {mode === "day" && formatWeekday(day) && `（${formatWeekday(day)}）`}
                </p>

                <p className="admin-sales-total">売上合計：{totalSales.toLocaleString()} 円</p>
                <p>注文件数：{orderCount.toLocaleString()} 件</p>
              </div>

              {items.length === 0 ? (
                <p className="admin-sales-empty">この期間の売上はありません</p>
              ) : (
                <div className="admin-sales-list">
                  {items.map((item) => {
                    const showCoupon = item.coupon_orders_count > 0;
                    const showPoints = item.points_orders_count > 0;
                    const showBadges = showCoupon || showPoints;

                    return (
                      <div
                        key={item.product_name}
                        className="admin-sales-item"
                        onClick={() => {
                          if (!currentRange) return;
                          navigate(
                            `/admin-sales-product/${encodeURIComponent(item.product_name)}`,
                            {
                              state: {
                                startIso: currentRange.startIso,
                                endIso: currentRange.endIso,
                                rangeLabel: currentRange.rangeLabel,
                              },
                            }
                          );
                        }}
                      >
                        <p className="sales-name">{item.product_name}</p>

                        {/* ✅ 0件は非表示（ある時だけ出す） */}
                        {showBadges && (
                          <div className="sales-badges">
                            {showCoupon && (
                              <span className="sales-badge">
                                クーポン：{item.coupon_orders_count}件
                              </span>
                            )}
                            {showPoints && (
                              <span className="sales-badge">
                                ポイント：{item.points_orders_count}件
                              </span>
                            )}
                          </div>
                        )}

                        <p className="sales-qty">個数：{item.quantity.toLocaleString()} 個</p>

                        {/* ✅ 表示順：割引前 → 割引後 */}
                        <p className="sales-subtotal-raw">
                          小計（割引前）：{item.subtotal_raw.toLocaleString()} 円
                        </p>

                        <p className="sales-subtotal">
                          売上（割引後）：{item.subtotal_after_discount.toLocaleString()} 円
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}