// src/pages/AdminSales.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminSales.css";

type SalesItem = {
  product_name: string;
  quantity: number;
  subtotal: number;
};

type RangeMode = "day" | "week" | "month" | "year";

/* ★ 曜日表示用のヘルパー */
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const formatWeekday = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return weekdayLabels[d.getDay()];
};

/* ★ AdminSales の状態を保存しておくキー */
const STORAGE_KEY = "admin-sales-state";

function AdminSales() {
  const navigate = useNavigate();

  // 今日（ローカル時間ベースでフォーマット）
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

  const defaultDay = formatYMD(today);
  const defaultMonth = formatYM(today);
  const defaultYear = String(today.getFullYear());

  // ★ localStorage から前回の状態を読む
  const loadInitialState = () => {
    const fallback = {
      mode: "day" as RangeMode,
      day: defaultDay,
      weekBase: defaultDay,
      month: defaultMonth,
      year: defaultYear,
    };

    if (typeof window === "undefined") return fallback;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;

      const parsed = JSON.parse(raw) as Partial<{
        mode: RangeMode;
        day: string;
        weekBase: string;
        month: string;
        year: string;
      }>;

      return {
        mode: parsed.mode ?? fallback.mode,
        day: parsed.day ?? fallback.day,
        weekBase: parsed.weekBase ?? fallback.weekBase,
        month: parsed.month ?? fallback.month,
        year: parsed.year ?? fallback.year,
      };
    } catch {
      return fallback;
    }
  };

  const initial = loadInitialState();

  const [mode, setMode] = useState<RangeMode>(initial.mode); // 日 / 週 / 月 / 年
  const [day, setDay] = useState<string>(initial.day);
  const [weekBase, setWeekBase] = useState<string>(initial.weekBase); // 週の基準日（その週のどの日でもOK）
  const [month, setMonth] = useState<string>(initial.month);
  const [year, setYear] = useState<string>(initial.year);

  const [totalSales, setTotalSales] = useState<number>(0);
  const [orderCount, setOrderCount] = useState<number>(0);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  /* ★ 今表示している期間を覚えておく（商品クリック時に渡す用） */
  const [currentRange, setCurrentRange] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);

  // ★ 指定日の「その週の日曜日」を返す（週は日曜〜土曜）
  const getWeekStartDate = (dateStr: string) => {
    const base = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime())) return null;

    const dow = base.getDay(); // 0: 日, 1: 月, ... 6: 土
    base.setDate(base.getDate() - dow); // その週の日曜日まで戻す

    return base;
  };

  // 指定範囲の売上データを読み込む
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
        if (!day) {
          setLoading(false);
          return;
        }
        start = new Date(day + "T00:00:00");
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      } else if (mode === "week") {
        if (!weekBase) {
          setLoading(false);
          return;
        }

        // ★ 週モード：選択した日が含まれる「週の日曜日」から7日間（日曜〜土曜）
        const weekStart = getWeekStartDate(weekBase);
        if (!weekStart) {
          setLoading(false);
          return;
        }

        start = weekStart; // 日曜
        end = new Date(weekStart);
        end.setDate(end.getDate() + 7); // 次の週の日曜(0:00)まで
      } else if (mode === "month") {
        if (!month) {
          setLoading(false);
          return;
        }
        // month: "YYYY-MM"
        start = new Date(month + "-01T00:00:00");
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
      } else {
        // mode === "year"
        if (!year) {
          setLoading(false);
          return;
        }
        start = new Date(year + "-01-01T00:00:00");
        end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
      }

      const startIso = start.toISOString();
      const endIso = end.toISOString();

      /* ★ ここで現在の期間を保存しておく */
      setCurrentRange({ startIso, endIso });

      // 1️⃣ 期間内の注文一覧を取得
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, total, created_at")
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true });

      if (ordersError) {
        console.error("ordersError:", ordersError);
        setError("売上データの取得に失敗しました（orders）");
        setLoading(false);
        return;
      }

      if (!orders || orders.length === 0) {
        setItems([]);
        setTotalSales(0);
        setOrderCount(0);
        setLoading(false);
        return;
      }

      const orderIds = orders.map((o) => o.id);
      setOrderCount(orders.length);

      // 売上合計
      const sumTotal = orders.reduce(
        (sum, o) => sum + Number(o.total ?? 0),
        0
      );
      setTotalSales(sumTotal);

      // 2️⃣ 対象注文の order_items をまとめて取得
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id, product_name, quantity, price")
        .in("order_id", orderIds);

      if (itemsError) {
        console.error("itemsError:", itemsError);
        setError("売上データの取得に失敗しました（order_items）");
        setLoading(false);
        return;
      }

      if (!orderItems || orderItems.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // 3️⃣ 商品ごとに集計
      const map = new Map<string, SalesItem>();

      for (const row of orderItems) {
        const name: string = row.product_name ?? "不明な商品";
        const qty = Number(row.quantity ?? 0);
        const price = Number(row.price ?? 0);
        const sub = qty * price;

        if (!map.has(name)) {
          map.set(name, { product_name: name, quantity: 0, subtotal: 0 });
        }
        const current = map.get(name)!;
        current.quantity += qty;
        current.subtotal += sub;
      }

      const list = Array.from(map.values()).sort(
        (a, b) => b.subtotal - a.subtotal
      );
      setItems(list);
    } catch (e) {
      console.error(e);
      setError("予期せぬエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // mode や対象日付が変わったら再読み込み
  useEffect(() => {
    loadSales(mode, day, weekBase, month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, weekBase, month, year]);

  // ★ モードや日付が変わったら localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;

    const data = {
      mode,
      day,
      weekBase,
      month,
      year,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [mode, day, weekBase, month, year]);

  // 週モード用のラベル（日曜〜土曜）
  const getWeekLabel = () => {
    if (!weekBase) return "";

    const weekStart = getWeekStartDate(weekBase);
    if (!weekStart) return "";

    const start = weekStart; // その週の日曜（ローカル）
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // その週の土曜（ローカル）

    // ローカル時間の年月日で文字列を作る
    const s = formatYMD(start);
    const e = formatYMD(end);

    return `${s} ～ ${e}`;
  };

  // 表示用ラベル
  const rangeLabel =
    mode === "day"
      ? day
      : mode === "week"
      ? getWeekLabel()
      : mode === "month"
      ? month
      : `${year}年`;

  return (
    <div className="admin-sales-page">
      <div className="admin-sales-card">
        <button
          className="admin-sales-back"
          onClick={() => navigate("/admin-menu")}
        >
          ← 戻る
        </button>

        <h2 className="admin-sales-title">売上状況</h2>

        {/* 日 / 週 / 月 / 年 切り替え */}
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

        {/* モードごとの入力 */}
        <div className="admin-sales-date-row">
          {mode === "day" && (
            <>
              <label>日付：</label>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
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
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
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
                対象：
                {rangeLabel}
                {mode === "day" &&
                  formatWeekday(day) &&
                  `（${formatWeekday(day)}）`}
              </p>

              <p className="admin-sales-total">
                売上合計：{totalSales.toLocaleString()} 円
              </p>
              <p>注文件数：{orderCount.toLocaleString()} 件</p>
            </div>

            {items.length === 0 ? (
              <p className="admin-sales-empty">この期間の売上はありません</p>
            ) : (
              <div className="admin-sales-list">
                {items.map((item) => (
                  <div
                    key={item.product_name}
                    className="admin-sales-item"
                    onClick={() => {
                      if (!currentRange) return;
                      navigate(
                        `/admin-sales-product/${encodeURIComponent(
                          item.product_name
                        )}`,
                        {
                          state: {
                            startIso: currentRange.startIso,
                            endIso: currentRange.endIso,
                          },
                        }
                      );
                    }}
                  >
                    <p className="sales-name">{item.product_name}</p>
                    <p className="sales-qty">
                      個数：{item.quantity.toLocaleString()} 個
                    </p>
                    <p className="sales-subtotal">
                      小計：{item.subtotal.toLocaleString()} 円
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminSales;