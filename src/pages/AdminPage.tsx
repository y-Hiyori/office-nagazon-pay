// src/pages/AdminPage.tsx
// ✅ 商品管理（統合版）
//   在庫・販売状態・仕入れ原価・入荷ロット・賞味期限アラート・セール・購入上限を
//   この1画面でまとめて確認できるようにした統合画面です。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminPage.css";
import { findProductImage } from "../data/products";
import { daysLeftOf, expiryStatusLabel, expiryStatusOf, type ExpiryStatus } from "../lib/lots";

type ViewMode = "all" | "selling" | "hidden" | "stock" | "expiry" | "expired" | "sale";

type ProductBase = {
  id: number;
  name: string | null;
  price: number | null;
  stock: number | null;
  is_visible: boolean | null;
  max_per_order: number | null;
  expiry_alert_days: number | null;
};

type LotRow = {
  product_id: number;
  cost: number | null;
  remaining: number | null;
  sale_price: number | null;
  expiry_date: string | null;
};

type Row = ProductBase & {
  stockNum: number;
  isSoldOut: boolean;
  isLowStock: boolean;
  isVisible: boolean;
  isSelling: boolean;
  lotCount: number;
  lotRemaining: number;
  avgCost: number;
  costTotal: number;
  nearest: string | null;
  status: ExpiryStatus;
  days: number | null;
  alertDays: number;
  hasSale: boolean;
  limit: number | null;
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};

const yen = (v: any) => toInt(v).toLocaleString("ja-JP");

function AdminPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductBase[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [q, setQ] = useState("");

  const loadProducts = async () => {
    setLoading(true);

    const [pRes, lRes] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,price,stock,is_visible,max_per_order,expiry_alert_days")
        .order("id", { ascending: true }),
      supabase.from("product_lots").select("product_id,cost,remaining,sale_price,expiry_date"),
    ]);

    if (pRes.error) {
      console.error("商品取得エラー:", pRes.error);
      setProducts([]);
    } else {
      setProducts((pRes.data ?? []) as ProductBase[]);
    }

    if (lRes.error) {
      console.error("ロット取得エラー:", lRes.error);
      setLots([]);
    } else {
      setLots((lRes.data ?? []) as LotRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const formatPrice = (value: number | string) => {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return String(value ?? "");
    return num.toLocaleString("ja-JP");
  };

  const toggleVisible = async (id: number, nextVisible: boolean) => {
    const { error } = await supabase
      .from("products")
      .update({ is_visible: nextVisible })
      .eq("id", id);

    if (error) {
      console.error("表示切替エラー:", error);
      return;
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_visible: nextVisible } : p))
    );
  };

  const extended = useMemo<Row[]>(() => {
    const byProduct = new Map<number, LotRow[]>();
    for (const l of lots) {
      const id = Number(l.product_id);
      if (!byProduct.has(id)) byProduct.set(id, []);
      byProduct.get(id)!.push(l);
    }

    return products.map((p) => {
      const stockNum = toInt(p.stock);
      const isSoldOut = stockNum <= 0;
      const isLowStock = !isSoldOut && stockNum <= 3;
      const isVisible = Boolean(p.is_visible ?? true);
      const isSelling = isVisible && stockNum > 0;

      const ls = byProduct.get(p.id) ?? [];
      const alertDays = toInt(p.expiry_alert_days) > 0 ? toInt(p.expiry_alert_days) : 30;

      let lotRemaining = 0;
      let costTotal = 0;
      let nearest: string | null = null;
      let hasSale = false;

      for (const l of ls) {
        const rem = Math.max(0, toInt(l.remaining));
        lotRemaining += rem;
        costTotal += toInt(l.cost) * rem;
        if (rem > 0 && l.sale_price != null && toInt(l.sale_price) > 0) hasSale = true;
        if (rem > 0 && l.expiry_date) {
          const d = String(l.expiry_date).slice(0, 10);
          if (!nearest || d < nearest) nearest = d;
        }
      }

      const status = expiryStatusOf(nearest, alertDays);
      const limitNum = toInt(p.max_per_order);

      return {
        ...p,
        stockNum,
        isSoldOut,
        isLowStock,
        isVisible,
        isSelling,
        lotCount: ls.length,
        lotRemaining,
        avgCost: lotRemaining > 0 ? Math.round(costTotal / lotRemaining) : 0,
        costTotal,
        nearest,
        status,
        days: daysLeftOf(nearest),
        alertDays,
        hasSale,
        limit: limitNum > 0 ? limitNum : null,
      };
    });
  }, [products, lots]);

  const counts = useMemo(() => {
    let expired = 0;
    let soon = 0;
    let sale = 0;
    for (const r of extended) {
      if (r.status === "expired") expired++;
      else if (r.status === "urgent" || r.status === "warn") soon++;
      if (r.hasSale) sale++;
    }
    return { expired, soon, sale };
  }, [extended]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let list = [...extended];

    if (kw) {
      list = list.filter(
        (p) => String(p.name ?? "").toLowerCase().includes(kw) || String(p.id).includes(kw)
      );
    }

    if (viewMode === "selling") list = list.filter((p) => p.isSelling);
    if (viewMode === "hidden") list = list.filter((p) => !p.isVisible);
    if (viewMode === "sale") list = list.filter((p) => p.hasSale);

    if (viewMode === "stock") {
      list = list.filter((p) => p.isSoldOut || p.isLowStock);
      list.sort((a, b) => {
        if (a.isSoldOut !== b.isSoldOut) return a.isSoldOut ? -1 : 1;
        if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
        return a.id - b.id;
      });
      return list;
    }

    if (viewMode === "expiry" || viewMode === "expired") {
      list = list.filter((p) =>
        viewMode === "expired"
          ? p.status === "expired"
          : p.status === "expired" || p.status === "urgent" || p.status === "warn"
      );
      // 期限が近い順（未設定は最後）
      list.sort((a, b) => {
        const ad = a.days ?? Number.MAX_SAFE_INTEGER;
        const bd = b.days ?? Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;
        return a.id - b.id;
      });
      return list;
    }

    list.sort((a, b) => a.id - b.id);
    return list;
  }, [extended, viewMode, q]);

  const statusClass = (s: ExpiryStatus) =>
    s === "expired"
      ? "is-expired"
      : s === "urgent"
      ? "is-urgent"
      : s === "warn"
      ? "is-warn"
      : s === "ok"
      ? "is-ok"
      : "is-none";

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <>
      <AdminHeader />

      <div className="admin-page" style={{ paddingTop: 80 }}>
        <div className="admin-top-actions">
          <button className="admin-add" onClick={() => navigate("/admin-costs")}>
            仕入れ原価・入荷ロット管理
          </button>

          <button className="admin-add" onClick={() => navigate("/admin-add")}>
            ＋追加
          </button>
        </div>

        {/* ✅ 期限アラート */}
        {(counts.expired > 0 || counts.soon > 0) && (
          <div className="admin-alertbar">
            {counts.expired > 0 && (
              <button
                className="admin-alert-chip is-expired"
                onClick={() => setViewMode("expired")}
              >
                期限切れ {counts.expired}件
              </button>
            )}
            {counts.soon > 0 && (
              <button className="admin-alert-chip is-warn" onClick={() => setViewMode("expiry")}>
                期限間近 {counts.soon}件
              </button>
            )}
            {counts.sale > 0 && (
              <button className="admin-alert-chip is-sale" onClick={() => setViewMode("sale")}>
                セール中 {counts.sale}件
              </button>
            )}
          </div>
        )}

        <input
          className="admin-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="商品名 or 商品IDで絞り込み"
          inputMode="search"
        />

        <div className="admin-sort-row">
          <button
            className={`admin-sort-btn ${viewMode === "all" ? "active" : ""}`}
            onClick={() => setViewMode("all")}
          >
            全て
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "selling" ? "active" : ""}`}
            onClick={() => setViewMode("selling")}
          >
            販売中
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "hidden" ? "active" : ""}`}
            onClick={() => setViewMode("hidden")}
          >
            非表示
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "stock" ? "active" : ""}`}
            onClick={() => setViewMode("stock")}
          >
            在庫注意
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "expiry" ? "active" : ""}`}
            onClick={() => setViewMode("expiry")}
          >
            期限間近
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "expired" ? "active" : ""}`}
            onClick={() => setViewMode("expired")}
          >
            期限切れ
          </button>
          <button
            className={`admin-sort-btn ${viewMode === "sale" ? "active" : ""}`}
            onClick={() => setViewMode("sale")}
          >
            セール中
          </button>
        </div>

        <div className="admin-list">
          {shown.length === 0 ? (
            <p>
              {viewMode === "selling"
                ? "販売中の商品がありません"
                : viewMode === "hidden"
                ? "非表示の商品がありません"
                : viewMode === "stock"
                ? "在庫注意の商品がありません"
                : viewMode === "expiry"
                ? "期限が近い商品がありません"
                : viewMode === "expired"
                ? "期限切れの商品がありません"
                : viewMode === "sale"
                ? "セール中の商品がありません"
                : "商品がありません"}
            </p>
          ) : (
            shown.map((p) => {
              const imgSrc = findProductImage(p.id);
              const lotDiff = p.lotCount > 0 && p.lotRemaining !== p.stockNum;

              return (
                <div
                  key={p.id}
                  className={`admin-item ${p.isSoldOut ? "admin-item-soldout" : ""} ${
                    p.isLowStock ? "admin-item-low" : ""
                  } ${p.status === "expired" ? "admin-item-expired" : ""}`}
                  onClick={() => navigate(`/admin-detail/${p.id}`)}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={p.name ?? ""} />
                  ) : (
                    <div className="admin-no-img">画像なし</div>
                  )}

                  <div className="admin-info">
                    <h3>
                      {p.name}
                      {!p.isVisible && <span className="admin-tag">非表示</span>}
                      {p.hasSale && <span className="admin-tag sale">セール中</span>}
                      {p.limit != null && (
                        <span className="admin-tag limit">1会計{p.limit}個まで</span>
                      )}
                    </h3>

                    <p>{formatPrice(p.price ?? 0)}円</p>

                    <div className="admin-stock-line">
                      <span className="admin-stock-label">在庫: {p.stockNum}</span>

                      {p.isSoldOut && <span className="admin-stock-badge soldout">在庫切れ</span>}
                      {p.isLowStock && !p.isSoldOut && (
                        <span className="admin-stock-badge low">残りわずか</span>
                      )}

                      <button
                        className={`admin-visible-btn ${p.isVisible ? "on" : "off"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisible(p.id, !p.isVisible);
                        }}
                      >
                        {p.isVisible ? "表示中" : "非表示"}
                      </button>
                    </div>

                    {/* ✅ 期限アラート */}
                    <div className="admin-exp-line">
                      <span className={`admin-exp ${statusClass(p.status)}`}>
                        {expiryStatusLabel(p.status, p.days)}
                      </span>
                      {p.nearest && <span className="admin-exp-date">{p.nearest}</span>}
                      {p.status !== "none" && p.status !== "ok" && (
                        <span className="admin-exp-note">
                          {p.alertDays}日以内で警告中
                        </span>
                      )}
                    </div>

                    {/* ✅ 仕入れ原価・ロット */}
                    <div className="admin-cost-line">
                      <span>
                        ロット {p.lotCount}件 / 残 {p.lotRemaining}
                      </span>
                      <span>平均原価 ¥{yen(p.avgCost)}</span>
                      <span>在庫原価 ¥{yen(p.costTotal)}</span>
                      {lotDiff && <span className="admin-cost-warn">⚠ 在庫数と不一致</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default AdminPage;
