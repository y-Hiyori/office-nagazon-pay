// src/pages/AdminSales.tsx
// ✅ 安定化版：Supabase RPC「admin_sales_summary」でまとめて取得
// ✅ 商品別に クーポン円/ポイント円 を按分集計
// ✅ 期間比較（前日/前週/前月/前年）データを取得してExcelへ
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import { exportSalesXlsx, type PrevData } from "../lib/excelExport";
import "./AdminSales.css";

type SalesItem = {
  product_name: string;
  quantity: number;
  subtotal_raw: number;
  subtotal_after_discount: number;
  coupon_orders_count: number;
  points_orders_count: number;
  couponYen: number;
  pointsYen: number;
};

type RangeMode = "day" | "week" | "month" | "year";

type OrderRow = {
  id: string;
  total: number | null;
  created_at: string | null;
  status?: string | null;

  subtotal: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  points_used: number | null;
  points_applied: number | null;

  // ✅ Excel（注文一覧）用
  email?: string | null;
  name?: string | null;
  payment_method?: string | null;
};

type OrderItemRow = {
  order_id: string;
  product_name: string | null;
  quantity: number | null;
  price: number | null;
};

type Summary = {
  cashSales: number; // 利益（入金売上）
  orderCount: number;
  grossSubtotal: number; // 商品売上（割引前）
  couponDiscount: number; // クーポン割引額
  pointsTotal: number; // ポイント充当額（売上に含めない）
  couponOrderCount: number;
  pointsOrderCount: number;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const formatWeekday = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00+09:00");
  if (Number.isNaN(d.getTime())) return "";
  return weekdayLabels[d.getUTCDay()];
};

const STORAGE_KEY = "admin-sales-state-mode";

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round0 = (v: any) => Math.max(0, Math.round(toNumber(v)));

const formatJst = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const paymentMethodLabel = (m: string | null | undefined) => {
  const v = String(m || "").trim();
  if (v === "paypay") return "PayPay";
  if (v === "points") return "ポイント";
  if (v === "coupon") return "クーポン";
  if (v === "guest") return "ゲスト";
  return v || "";
};

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

  const [day, setDay] = useState<string>(openedDay);
  const [weekBase, setWeekBase] = useState<string>(openedDay);
  const [month, setMonth] = useState<string>(openedMonth);
  const [year, setYear] = useState<string>(openedYear);

  const [summary, setSummary] = useState<Summary>({
    cashSales: 0,
    orderCount: 0,
    grossSubtotal: 0,
    couponDiscount: 0,
    pointsTotal: 0,
    couponOrderCount: 0,
    pointsOrderCount: 0,
  });
  const [prev, setPrev] = useState<PrevData | null>(null);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [orderRows, setOrderRows] = useState<OrderRow[]>([]);
  const [itemRows, setItemRows] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [excelMsg, setExcelMsg] = useState<string>("");

  const [currentRange, setCurrentRange] = useState<{
    startIso: string;
    endIso: string;
    rangeLabel: string;
  } | null>(null);

  // ✅ レースコンディション防止（古い応答が新しい応答を上書きしない）
  const loadIdRef = useRef(0);

  // ✅ 週の開始（日曜始まり）。JST 00:00 を UTC メソッドで扱う
  const getWeekStartDate = (dateStr: string) => {
    const base = new Date(dateStr + "T00:00:00+09:00");
    if (Number.isNaN(base.getTime())) return null;
    const dow = base.getUTCDay();
    base.setUTCDate(base.getUTCDate() - dow);
    return base;
  };

  const getWeekLabel = (weekBaseStr: string) => {
    if (!weekBaseStr) return "";
    const weekStart = getWeekStartDate(weekBaseStr);
    if (!weekStart) return "";
    const start = weekStart;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${formatYMD(start)} ～ ${formatYMD(end)}`;
  };

  const isCouponUsed = (o: OrderRow) => {
    const code = String(o.coupon_code || "").trim();
    return !!code || round0(o.discount_amount) > 0;
  };

  const isPointsUsed = (o: OrderRow) => {
    return round0(o.points_used) > 0 || round0(o.points_applied) > 0;
  };

  const splitDiscount = (o: OrderRow, itemsSum: number) => {
    const sub = round0(o.subtotal) > 0 ? round0(o.subtotal) : round0(itemsSum);
    const tot = round0(o.total);
    const combined = Math.max(0, sub - tot);
    const pts = Math.min(Math.max(round0(o.points_used), round0(o.points_applied)), combined);
    return { sub, tot, combined, pts, coupon: combined - pts };
  };

  const loadSales = async (
    mode: RangeMode,
    day: string,
    weekBase: string,
    month: string,
    year: string
  ) => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setError("");
    setItems([]);
    setOrderRows([]);
    setItemRows([]);
    setExcelMsg("");
    setSummary({
      cashSales: 0,
      orderCount: 0,
      grossSubtotal: 0,
      couponDiscount: 0,
      pointsTotal: 0,
      couponOrderCount: 0,
      pointsOrderCount: 0,
    });

    try {
      let start: Date;
      let end: Date;

      // ✅ 日本時間（+09:00）で日付境界を確定。ブラウザのタイムゾーン設定に依存しない
      if (mode === "day") {
        if (!day) return;
        start = new Date(day + "T00:00:00+09:00");
        end = new Date(start.getTime() + 86400000);
      } else if (mode === "week") {
        if (!weekBase) return;
        const weekStart = getWeekStartDate(weekBase);
        if (!weekStart) return;
        start = weekStart;
        end = new Date(start.getTime() + 7 * 86400000);
      } else if (mode === "month") {
        if (!month) return;
        start = new Date(month + "-01T00:00:00+09:00");
        end = new Date(start.getTime());
        end.setUTCMonth(end.getUTCMonth() + 1);
      } else {
        if (!year) return;
        start = new Date(year + "-01-01T00:00:00+09:00");
        end = new Date(start.getTime());
        end.setUTCFullYear(end.getUTCFullYear() + 1);
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

      // ✅ RPC で一括取得（RLSの影響を受けない・1リクエストで完了）
      const { data: raw, error: rpcError } = await supabase.rpc("admin_sales_summary", {
        p_start: startIso,
        p_end: endIso,
      });

      if (rpcError) {
        console.error("admin_sales_summary error:", rpcError);
        setError("売上データの取得に失敗しました（admin_sales_summary）");
        return;
      }

      const d: any = Array.isArray(raw) ? raw?.[0] : raw;
      const ordersArr = (d?.orders ?? []) as unknown as OrderRow[];
      const itemsRows = (d?.items ?? []) as unknown as OrderItemRow[];

      if (loadId !== loadIdRef.current) return;
      if (!ordersArr || ordersArr.length === 0) return;

      setOrderRows(ordersArr);
      setItemRows(itemsRows);

      // --- ここから集計（割引按分も含む） ---
      const orderMap = new Map<string, OrderRow>(ordersArr.map((o) => [o.id, o]));
      const orderSubtotalFromItems = new Map<string, number>();

      const byOrderProduct = new Map<
        string,
        { orderId: string; productName: string; qty: number; rawSub: number }
      >();

      for (const row of itemsRows) {
        const orderId = String(row.order_id || "");
        if (!orderId) continue;

        const productName = (row.product_name ?? "不明な商品") as string;
        const qty = round0(row.quantity);
        const price = round0(row.price);
        const rawSub = qty * price;

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

      const productAgg = new Map<
        string,
        {
          quantity: number;
          subtotal_raw: number;
          subtotal_after_discount: number;
          couponOrders: Set<string>;
          pointsOrders: Set<string>;
          couponYen: number;
          pointsYen: number;
        }
      >();

      for (const { orderId, productName, qty, rawSub } of byOrderProduct.values()) {
        const o = orderMap.get(orderId);
        if (!o) continue;

        const s = splitDiscount(o, orderSubtotalFromItems.get(orderId) || 0);
        const orderSubtotal = s.sub;
        const orderDiscountTotal = s.combined;

        let share = 0;
        if (orderSubtotal > 0 && orderDiscountTotal > 0 && rawSub > 0) {
          const ratio = Math.min(1, Math.max(0, rawSub / orderSubtotal));
          share = Math.min(rawSub, Math.round(orderDiscountTotal * ratio));
        }

        const after = Math.max(0, rawSub - share);

        // この商品に乗った クーポン円 / ポイント円（割引を比率で按分）
        let couponYenShare = 0;
        let pointsYenShare = 0;
        if (orderSubtotal > 0 && rawSub > 0) {
          const ratio = Math.min(1, Math.max(0, rawSub / orderSubtotal));
          couponYenShare = Math.round(s.coupon * ratio);
          pointsYenShare = Math.round(s.pts * ratio);
        }

        if (!productAgg.has(productName)) {
          productAgg.set(productName, {
            quantity: 0,
            subtotal_raw: 0,
            subtotal_after_discount: 0,
            couponOrders: new Set<string>(),
            pointsOrders: new Set<string>(),
            couponYen: 0,
            pointsYen: 0,
          });
        }

        const p = productAgg.get(productName)!;
        p.quantity += qty;
        p.subtotal_raw += rawSub;
        p.subtotal_after_discount += after;
        p.couponYen += couponYenShare;
        p.pointsYen += pointsYenShare;

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
          couponYen: Math.round(v.couponYen),
          pointsYen: Math.round(v.pointsYen),
        }))
        .sort((a, b) => b.subtotal_after_discount - a.subtotal_after_discount);

      let cash = 0;
      let gross = 0;
      let ptotal = 0;
      let ctotal = 0;
      let cCnt = 0;
      let pCnt = 0;
      for (const o of ordersArr) {
        const s = splitDiscount(o, orderSubtotalFromItems.get(o.id) || 0);
        cash += round0(o.total);
        gross += s.sub;
        ptotal += s.pts;
        ctotal += s.coupon;
        if (isCouponUsed(o)) cCnt++;
        if (isPointsUsed(o)) pCnt++;
      }

      if (loadId !== loadIdRef.current) return;
      setItems(list);
      setSummary({
        cashSales: cash,
        orderCount: ordersArr.length,
        grossSubtotal: gross,
        couponDiscount: ctotal,
        pointsTotal: ptotal,
        couponOrderCount: cCnt,
        pointsOrderCount: pCnt,
      });

      // ✅ 比較期間（前日/前週/前月/前年）も取得 → Excel の「期間比較」シート用
      let prevStart: Date | null = null;
      let prevEnd: Date | null = null;
      let prevLabel = "";
      try {
        if (mode === "day") {
          prevStart = new Date(start.getTime() - 86400000);
          prevEnd = start;
          prevLabel = "前日";
        } else if (mode === "week") {
          prevStart = new Date(start.getTime() - 7 * 86400000);
          prevEnd = start;
          prevLabel = "前週";
        } else if (mode === "month") {
          prevStart = new Date(start.getTime());
          prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
          prevEnd = start;
          prevLabel = "前月";
        } else {
          prevStart = new Date(start.getTime());
          prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
          prevEnd = start;
          prevLabel = "前年";
        }

        const prevRes = await supabase.rpc("admin_sales_summary", {
          p_start: prevStart.toISOString(),
          p_end: prevEnd.toISOString(),
        });
        if (!prevRes.error) {
          const pd: any = Array.isArray(prevRes.data) ? prevRes.data?.[0] : prevRes.data;
          const pOrders = (pd?.orders ?? []) as unknown as OrderRow[];
          const pItems = (pd?.items ?? []) as unknown as OrderItemRow[];
          const pSumByOrder = new Map<string, number>();
          for (const it of pItems) {
            if (!it.order_id) continue;
            pSumByOrder.set(
              it.order_id,
              (pSumByOrder.get(it.order_id) || 0) + round0(it.price) * round0(it.quantity)
            );
          }
          let pCash = 0;
          let pGross = 0;
          for (const o of pOrders) {
            pCash += round0(o.total);
            pGross += round0(o.subtotal) > 0 ? round0(o.subtotal) : (pSumByOrder.get(o.id) || 0);
          }
          if (pd?.orders !== undefined) {
            setPrev({
              label: prevLabel,
              current: { cashSales: cash, orderCount: ordersArr.length, grossSubtotal: gross },
              previous: { cashSales: pCash, orderCount: pOrders.length, grossSubtotal: pGross },
            });
          }
        }
      } catch (ePrev) {
        console.error("prev period fetch error:", ePrev);
        setPrev(null);
      }
    } catch (e) {
      console.error(e);
      if (loadId === loadIdRef.current) setError("予期せぬエラーが発生しました");
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
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

  const buildItemsTextMap = () => {
    const byOrder = new Map<string, Map<string, number>>();
    for (const it of itemRows) {
      if (!it.order_id) continue;
      if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, new Map());
      const m = byOrder.get(it.order_id)!;
      const name = String(it.product_name || "不明な商品");
      m.set(name, (m.get(name) || 0) + round0(it.quantity));
    }
    const out = new Map<string, string>();
    for (const [oid, m] of byOrder) {
      out.set(oid, Array.from(m.entries()).map(([n, q]) => `${n}×${q}`).join("、"));
    }
    return out;
  };

  const handleExportExcel = async () => {
    if (!currentRange) return;
    if (orderRows.length === 0) {
      setExcelMsg("この期間に売上のデータがありません");
      return;
    }
    try {
      const nowJst = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
      const itemsTextMap = buildItemsTextMap();
      const itemSumByOrder = new Map<string, number>();
      for (const it of itemRows) {
        if (!it.order_id) continue;
        itemSumByOrder.set(
          it.order_id,
          (itemSumByOrder.get(it.order_id) || 0) + round0(it.price) * round0(it.quantity)
        );
      }

      const orderData = orderRows.map((o) => {
        const s = splitDiscount(o, itemSumByOrder.get(o.id) || 0);
        return {
          id: o.id,
          created_at: formatJst(o.created_at),
          name: String(o.name || ""),
          email: String(o.email || ""),
          payment_method: paymentMethodLabel(o.payment_method),
          itemsText: itemsTextMap.get(o.id) || "-",
          subtotal: s.sub,
          couponCode: String(o.coupon_code || ""),
          coupon: s.coupon,
          points: s.pts,
          total: round0(o.total),
        };
      });

      await exportSalesXlsx(
        { label: currentRange.rangeLabel, nowJst },
        summary,
        prev,
        items,
        orderData
      );
      setExcelMsg("Excelをダウンロードしました");
    } catch (e) {
      console.error(e);
      setExcelMsg("Excelの作成に失敗しました");
    }
  };

  return (
    <>
      <AdminHeader />

      <div className="admin-sales-page" style={{ paddingTop: 80 }}>
        <div className="admin-sales-card">
          <h2 className="admin-sales-title">売上状況</h2>
          <p className="admin-sales-range">
            {rangeLabel}
            {mode === "day" && formatWeekday(day) && `（${formatWeekday(day)}）`}
          </p>

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
              <div className="as-cards">
                <div className="as-card as-card-main">
                  <div className="as-label">利益</div>
                  <div className="as-value">{summary.cashSales.toLocaleString("ja-JP")} 円</div>
                  <div className="as-sub">＝入金売上（実際にいただいた金額）</div>
                </div>

                <div className="as-card">
                  <div className="as-label">注文件数</div>
                  <div className="as-value">{summary.orderCount.toLocaleString("ja-JP")} 件</div>
                  <div className="as-sub">
                    {summary.grossSubtotal.toLocaleString("ja-JP")} 円（割引前）
                  </div>
                </div>

                <div className="as-card">
                  <div className="as-label">クーポン割引</div>
                  <div className="as-value as-minus">
                    -{summary.couponDiscount.toLocaleString("ja-JP")} 円
                  </div>
                  <div className="as-sub">{summary.couponOrderCount} 件で使用</div>
                </div>

                <div className="as-card as-card-points">
                  <div className="as-label">
                    ポイント充当
                    <span className="as-tag">利益に含めない</span>
                  </div>
                  <div className="as-value as-minus">
                    -{summary.pointsTotal.toLocaleString("ja-JP")} 円
                  </div>
                  <div className="as-sub">お客様に付与したポイントで支払われた分</div>
                </div>
              </div>

              <p className="as-note">
                利益＝お客様から実際にいただいた金額（入金売上）です。クーポン割引・ポイント充当は売上に含みません。
              </p>

              <div className="as-excel-row">
                <button
                  type="button"
                  className="as-excel-btn"
                  onClick={handleExportExcel}
                  disabled={loading || orderRows.length === 0}
                >
                  ⬇ この期間の売上をExcelでダウンロード
                </button>
                {excelMsg && <p className="as-excel-msg">{excelMsg}</p>}
                <p className="as-excel-hint">
                  4シート（サマリー・商品別売上・チャート・注文一覧）をスタイル付きで自動生成
                </p>
              </div>

              {items.length === 0 ? (
                <p className="admin-sales-empty">この期間の売上はありません</p>
              ) : (
                <>
                  {/* ✅ 商品別売上比較グラフ */}
                  <div className="as-chart">
                    <h3 className="as-chart-title">商品別売上比較（割引後）</h3>
                    <div className="as-chart-bars">
                      {items.map((it, idx) => {
                        const maxVal = items[0]?.subtotal_after_discount || 1;
                        const pct =
                          maxVal > 0
                            ? Math.max(3, Math.round((it.subtotal_after_discount / maxVal) * 100))
                            : 0;
                        return (
                          <div className="as-chart-row" key={it.product_name}>
                            <span className="as-chart-name">{it.product_name}</span>
                            <div className="as-chart-track">
                              <div
                                className={`as-chart-bar${idx === 0 ? " top" : ""}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="as-chart-val">
                              {it.subtotal_after_discount.toLocaleString("ja-JP")}円
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <h3 className="as-list-title">商品別売上（タップで注文一覧を表示）</h3>
                  <div className="admin-sales-list">
                    {items.map((item) => {
                      const showCoupon = item.coupon_orders_count > 0;
                      const showPoints = item.points_orders_count > 0;
                      const showBadges = showCoupon || showPoints;

                      return (
                        <div
                          key={item.product_name}
                          className="sales-item"
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
                          <div className="sales-item-top">
                            <span className="sales-name">{item.product_name}</span>
                            <span className="sales-qty">
                              {item.quantity.toLocaleString("ja-JP")} 個
                            </span>
                          </div>

                          {showBadges && (
                            <div className="sales-badges">
                              {showCoupon && (
                                <span className="sales-badge coupon">
                                  クーポン {item.coupon_orders_count}件
                                </span>
                              )}
                              {showPoints && (
                                <span className="sales-badge points">
                                  ポイント {item.points_orders_count}件
                                </span>
                              )}
                            </div>
                          )}

                          <div className="sales-item-bottom">
                            <span className="sales-subtotal-raw">
                              割引前 {item.subtotal_raw.toLocaleString("ja-JP")} 円
                            </span>
                            <span className="sales-subtotal">
                              {item.subtotal_after_discount.toLocaleString("ja-JP")} 円
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
