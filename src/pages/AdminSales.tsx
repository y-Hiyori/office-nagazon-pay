// src/pages/AdminSales.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import { exportXlsxSheets } from "../lib/excelExport";
import "./AdminSales.css";

type SalesItem = {
  product_name: string;
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
  cashSales: number; // 入金売上（お客様からの実際の入金）
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

  const [summary, setSummary] = useState<Summary>({
    cashSales: 0,
    orderCount: 0,
    grossSubtotal: 0,
    couponDiscount: 0,
    pointsTotal: 0,
    couponOrderCount: 0,
    pointsOrderCount: 0,
  });
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

  const isCouponUsed = (o: OrderRow) => {
    const code = String(o.coupon_code || "").trim();
    return !!code || round0(o.discount_amount) > 0;
  };

  const isPointsUsed = (o: OrderRow) => {
    return round0(o.points_used) > 0 || round0(o.points_applied) > 0;
  };

  // ✅ 注文ごとの割引を「クーポン分 / ポイント分」に分解
  //    combined = 小計 - 合計（割引の総額）。ポイント使用額と突き合わせて内訳を作る
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
          "id,total,created_at,status,subtotal,discount_amount,coupon_code,points_used,points_applied,email,name,payment_method"
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
        return;
      }

      const orderRowsArr = orders as unknown as OrderRow[];
      setOrderRows(orderRowsArr);

      const orderIds = orderRowsArr.map((o) => o.id);

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

      const itemsRows = (orderItems ?? []) as unknown as OrderItemRow[];
      setItemRows(itemsRows);

      // --- ここから集計（割引按分も含む） ---

      // 注文メタ
      const orderMap = new Map<string, OrderRow>(orderRowsArr.map((o) => [o.id, o]));

      // 注文の割引前小計（itemsから計算）※ orders.subtotal が null の時の保険
      const orderSubtotalFromItems = new Map<string, number>();

      // 注文×商品 単位で一旦集計（同じ商品が同一注文で複数行あっても合算）
      const byOrderProduct = new Map<
        string,
        { orderId: string; productName: string; qty: number; rawSub: number }
      >();

      for (const row of itemRows) {
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

      // 按分：注文全体の割引（クーポン＋ポイント）を “商品rawSubの比率” で配分
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

      // ✅ サマリー（ポイント充当は売上・利益に含めない）
      let cash = 0;
      let gross = 0;
      let ptotal = 0;
      let ctotal = 0;
      let cCnt = 0;
      let pCnt = 0;
      for (const o of orderRowsArr) {
        const s = splitDiscount(o, orderSubtotalFromItems.get(o.id) || 0);
        cash += round0(o.total);
        gross += s.sub;
        ptotal += s.pts;
        ctotal += s.coupon;
        if (isCouponUsed(o)) cCnt++;
        if (isPointsUsed(o)) pCnt++;
      }
      setSummary({
        cashSales: cash,
        orderCount: orderRowsArr.length,
        grossSubtotal: gross,
        couponDiscount: ctotal,
        pointsTotal: ptotal,
        couponOrderCount: cCnt,
        pointsOrderCount: pCnt,
      });
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

  // ✅ 注文ごとの「商品内訳」テキスト（Excel 用）
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
      const labelSafe = (currentRange.rangeLabel || "期間").replace(/[\\/:*?"<>|～~]/g, "_");
      const fileName = `NAGAZON売上_${labelSafe}.xlsx`;
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

      // シート1: 売上サマリー
      const summaryRows: unknown[][] = [
        ["売上状況レポート"],
        ["対象期間", currentRange.rangeLabel],
        ["出力日時", nowJst],
        [],
        ["入金売上（お客様からの実際の入金額）", summary.cashSales, "円"],
        ["注文件数", summary.orderCount, "件"],
        ["商品売上（割引前）", summary.grossSubtotal, "円"],
        ["クーポン割引額", summary.couponDiscount, "円"],
        ["ポイント充当額（売上に含めない）", summary.pointsTotal, "円"],
        ["クーポン使用注文数", summary.couponOrderCount, "件"],
        ["ポイント使用注文数", summary.pointsOrderCount, "件"],
        [],
        ["※ 入金売上 ＝ 商品売上 − クーポン割引 − ポイント充当"],
        ["※ ポイント充当額は売上・利益に含めません（お客様に付与したポイントで支払われた分のため）"],
      ];

      // シート2: 商品別売上
      const productRows: unknown[][] = [
        ["商品名", "個数", "売上（割引前・円）", "売上（割引後・円）", "クーポン使用（件）", "ポイント使用（件）"],
        ...items.map((it) => [
          it.product_name,
          it.quantity,
          it.subtotal_raw,
          it.subtotal_after_discount,
          it.coupon_orders_count,
          it.points_orders_count,
        ]),
      ];

      // シート3: 注文一覧
      const orderRowsOut: unknown[][] = [
        ["注文ID", "注文日時", "購入者名", "メール", "支払方法", "商品内訳", "小計（円）", "クーポンコード", "クーポン割引（円）", "ポイント充当（円）", "入金額（円）"],
        ...orderRows.map((o) => {
          const s = splitDiscount(o, itemSumByOrder.get(o.id) || 0);
          return [
            o.id,
            formatJst(o.created_at),
            String(o.name || ""),
            String(o.email || ""),
            paymentMethodLabel(o.payment_method),
            itemsTextMap.get(o.id) || "-",
            s.sub,
            String(o.coupon_code || ""),
            s.coupon,
            s.pts,
            round0(o.total),
          ];
        }),
      ];

      await exportXlsxSheets(fileName, [
        { name: "売上サマリー", rows: summaryRows },
        { name: "商品別売上", rows: productRows },
        { name: "注文一覧", rows: orderRowsOut },
      ]);
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
              {/* ✅ サマリーカード */}
              <div className="as-cards">
                <div className="as-card as-card-main">
                  <div className="as-label">入金売上</div>
                  <div className="as-value">{summary.cashSales.toLocaleString("ja-JP")} 円</div>
                  <div className="as-sub">クーポン・ポイント差引後の実際の入金額</div>
                </div>

                <div className="as-card">
                  <div className="as-label">注文件数</div>
                  <div className="as-value">{summary.orderCount.toLocaleString("ja-JP")} 件</div>
                  <div className="as-sub">
                    商品売上（割引前）{summary.grossSubtotal.toLocaleString("ja-JP")} 円
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
                売上合計（入金）＝お客様から実際にいただいた金額です。クーポン割引・ポイント充当は売上に含みません。
              </p>

              {/* ✅ Excel ダウンロード */}
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
                  売上サマリー・商品別売上・注文一覧の3シートを自動生成（データは外部送信されません）
                </p>
              </div>

              {items.length === 0 ? (
                <p className="admin-sales-empty">この期間の売上はありません</p>
              ) : (
                <>
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
