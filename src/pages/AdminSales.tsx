import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminSales.css";

type SalesItem = {
  product_name: string;
  quantity: number;
  subtotal: number;
};

type RangeMode = "day" | "week" | "month" | "year";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const formatWeekday = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return weekdayLabels[d.getDay()];
};

const STORAGE_KEY = "admin-sales-state";

function AdminSales() {
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

  const defaultDay = formatYMD(today);
  const defaultMonth = formatYM(today);
  const defaultYear = String(today.getFullYear());

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

  const [mode, setMode] = useState<RangeMode>(initial.mode);
  const [day, setDay] = useState<string>(initial.day);
  const [weekBase, setWeekBase] = useState<string>(initial.weekBase);
  const [month, setMonth] = useState<string>(initial.month);
  const [year, setYear] = useState<string>(initial.year);

  const [totalSales, setTotalSales] = useState<number>(0);
  const [orderCount, setOrderCount] = useState<number>(0);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [currentRange, setCurrentRange] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);

  const getWeekStartDate = (dateStr: string) => {
    const base = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime())) return null;
    const dow = base.getDay();
    base.setDate(base.getDate() - dow);
    return base;
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
        const weekStart = getWeekStartDate(weekBase);
        if (!weekStart) {
          setLoading(false);
          return;
        }
        start = weekStart;
        end = new Date(weekStart);
        end.setDate(end.getDate() + 7);
      } else if (mode === "month") {
        if (!month) {
          setLoading(false);
          return;
        }
        start = new Date(month + "-01T00:00:00");
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
      } else {
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
      setCurrentRange({ startIso, endIso });

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

      const sumTotal = orders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
      setTotalSales(sumTotal);

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

      const list = Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
      setItems(list);
    } catch (e) {
      console.error(e);
      setError("予期せぬエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales(mode, day, weekBase, month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, weekBase, month, year]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, day, weekBase, month, year })
    );
  }, [mode, day, weekBase, month, year]);

  const getWeekLabel = () => {
    if (!weekBase) return "";
    const weekStart = getWeekStartDate(weekBase);
    if (!weekStart) return "";
    const start = weekStart;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${formatYMD(start)} ～ ${formatYMD(end)}`;
  };

  const rangeLabel =
    mode === "day" ? day :
    mode === "week" ? getWeekLabel() :
    mode === "month" ? month : `${year}年`;

  return (
    <>
      <AdminHeader />

      <div className="admin-sales-page" style={{ paddingTop: 80 }}>
        <div className="admin-sales-card">
          <h2 className="admin-sales-title">売上状況</h2>

          <div className="admin-sales-mode">
            <button className={mode === "day" ? "mode-btn active" : "mode-btn"} onClick={() => setMode("day")}>日</button>
            <button className={mode === "week" ? "mode-btn active" : "mode-btn"} onClick={() => setMode("week")}>週</button>
            <button className={mode === "month" ? "mode-btn active" : "mode-btn"} onClick={() => setMode("month")}>月</button>
            <button className={mode === "year" ? "mode-btn active" : "mode-btn"} onClick={() => setMode("year")}>年</button>
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
                <input type="date" value={weekBase} onChange={(e) => setWeekBase(e.target.value)} />
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
                <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
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
                        navigate(`/admin-sales-product/${encodeURIComponent(item.product_name)}`, {
                          state: {
                            startIso: currentRange.startIso,
                            endIso: currentRange.endIso,
                          },
                        });
                      }}
                    >
                      <p className="sales-name">{item.product_name}</p>
                      <p className="sales-qty">個数：{item.quantity.toLocaleString()} 個</p>
                      <p className="sales-subtotal">小計：{item.subtotal.toLocaleString()} 円</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminSales;