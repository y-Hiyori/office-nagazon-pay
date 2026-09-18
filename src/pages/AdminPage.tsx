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
import { daysLeftOf, expiryStatusLabel, expiryStatusOf, setProductSale, type ExpiryStatus } from "../lib/lots";
import { appDialog } from "../lib/appDialog";

type ViewMode = "all" | "selling" | "hidden" | "stock" | "expiry" | "expired" | "sale";

type ProductBase = {
  id: number;
  name: string | null;
  price: number | null;
  stock: number | null;
  is_visible: boolean | null;
  max_per_order: number | null;
  expiry_alert_days: number | null;
  sale_price?: number | null;
  sale_qty?: number | null;
  sale_remaining?: number | null;
};

type LotRow = {
  product_id: number;
  cost: number | null;
  remaining: number | null;
  expiry_date: string | null;
  no_expiry?: boolean | null;
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
  noExpiryOnly: boolean;
  salePrice: number | null;
  saleQtyN: number;
  saleRemainingN: number;
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

  // ✅ セール設定（商品管理で操作）
  const [saleReady, setSaleReady] = useState(true);
  const [saleOpenId, setSaleOpenId] = useState<number | null>(null);
  const [saleDraft, setSaleDraft] = useState<Record<number, { price: string; qty: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const loadProducts = async () => {
    setLoading(true);

    const baseCols = "id,name,price,stock,is_visible,max_per_order,expiry_alert_days";

    // v18のSQL未実行でも画面が壊れないようにフォールバックする
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pRes: any = await supabase
      .from("products")
      .select(`${baseCols},sale_price,sale_qty,sale_remaining`)
      .order("id", { ascending: true });

    if (pRes.error) {
      console.warn("商品取得（セール列あり）エラー:", pRes.error);
      setSaleReady(false);
      pRes = await supabase
        .from("products")
        .select(baseCols)
        .order("id", { ascending: true });
    } else {
      setSaleReady(true);
    }

    const lRes = await supabase
      .from("product_lots")
      .select("product_id,cost,remaining,expiry_date,no_expiry");

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

  // ✅ セール設定パネルの開閉
  const openSale = (p: Row) => {
    if (saleOpenId === p.id) {
      setSaleOpenId(null);
      return;
    }
    setMsg("");
    setSaleOpenId(p.id);
    setSaleDraft((prev) => ({
      ...prev,
      [p.id]: prev[p.id] ?? {
        price: p.salePrice != null ? String(p.salePrice) : "",
        qty: p.saleQtyN > 0 ? String(p.saleQtyN) : "",
      },
    }));
  };

  const resetSaleDraft = (id: number) => {
    setSaleDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // ✅ セール開始／更新
  const applySale = async (p: Row) => {
    if (busyId != null) return;

    const d = saleDraft[p.id] ?? { price: "", qty: "" };
    const price = toInt(d.price);
    const qty = toInt(d.qty);

    if (price <= 0 || qty <= 0) {
      setMsg("セール価格（1円以上）とセール個数（1個以上）を入力してください");
      return;
    }
    if (p.stockNum > 0 && qty > p.stockNum) {
      setMsg(`在庫は${p.stockNum}個です。セール個数は在庫以下にしてください`);
      return;
    }

    const ok = await appDialog.confirm({
      message: `「${p.name ?? p.id}」を セール価格 ¥${yen(price)} × ${qty}個 で販売しますか？`,
    });
    if (!ok) return;

    setBusyId(p.id);
    try {
      const res = await setProductSale(p.id, price, qty);
      if (!res.ok) {
        setMsg("セール設定に失敗しました: " + res.error);
        return;
      }
      setMsg(`セールを設定しました（${p.name ?? p.id}：¥${yen(price)} × ${qty}個）`);
      setSaleOpenId(null);
      resetSaleDraft(p.id);
      await loadProducts();
    } finally {
      setBusyId(null);
    }
  };

  // ✅ セール解除
  const clearSale = async (p: Row) => {
    if (busyId != null) return;

    const ok = await appDialog.confirm({
      message: `「${p.name ?? p.id}」のセールを解除して通常価格に戻しますか？`,
    });
    if (!ok) return;

    setBusyId(p.id);
    try {
      const res = await setProductSale(p.id, 0, 0);
      if (!res.ok) {
        setMsg("セール解除に失敗しました: " + res.error);
        return;
      }
      setMsg(`「${p.name ?? p.id}」のセールを解除しました（通常価格に戻りました）`);
      setSaleOpenId(null);
      resetSaleDraft(p.id);
      await loadProducts();
    } finally {
      setBusyId(null);
    }
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
      let hasDated = false;
      let hasNoExpiry = false;

      for (const l of ls) {
        const rem = Math.max(0, toInt(l.remaining));
        lotRemaining += rem;
        costTotal += toInt(l.cost) * rem;
        if (rem > 0 && l.expiry_date) {
          hasDated = true;
          const d = String(l.expiry_date).slice(0, 10);
          if (!nearest || d < nearest) nearest = d;
        }
        if (rem > 0 && !l.expiry_date && l.no_expiry) hasNoExpiry = true;
      }

      const status = expiryStatusOf(nearest, alertDays);
      const limitNum = toInt(p.max_per_order);

      // ✅ 商品ごとのセール（価格・設定個数・残り個数）
      const salePriceNum = toInt(p.sale_price) > 0 ? toInt(p.sale_price) : null;
      const saleQtyN = Math.max(0, toInt(p.sale_qty));
      const saleRemainingN = Math.max(0, toInt(p.sale_remaining));
      const hasSale = salePriceNum != null && saleRemainingN > 0;

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
        noExpiryOnly: !hasDated && hasNoExpiry,
        salePrice: salePriceNum,
        saleQtyN,
        saleRemainingN,
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
                      {p.hasSale && (
                        <span className="admin-tag sale">セール中 残{p.saleRemainingN}個</span>
                      )}
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

        {msg && <div className="admin-msg">{msg}</div>}

        {/* ✅ 期限アラート */}
                    <div className="admin-exp-line">
                      <span className={`admin-exp ${statusClass(p.status)}`}>
                        {p.noExpiryOnly ? "期限なし" : expiryStatusLabel(p.status, p.days)}
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

                    {/* ✅ セール設定（ここで操作する） */}
                    {saleReady ? (
                      <>
                        <button
                          className={`admin-sale-btn ${p.hasSale ? "is-on" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSale(p);
                          }}
                        >
                          {p.hasSale
                            ? `セール中 ¥${yen(p.salePrice ?? 0)} ／ 残り${p.saleRemainingN}個（設定${p.saleQtyN}個）`
                            : "セール価格・セール個数を設定"}
                        </button>

                        {saleOpenId === p.id && (
                          <div className="admin-sale-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="admin-sale-grid">
                              <label>
                                <span>セール価格（円）</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  placeholder="例: 100"
                                  value={(saleDraft[p.id] ?? { price: "", qty: "" }).price}
                                  onChange={(e) =>
                                    setSaleDraft((prev) => ({
                                      ...prev,
                                      [p.id]: {
                                        price: e.target.value,
                                        qty: (prev[p.id] ?? { price: "", qty: "" }).qty,
                                      },
                                    }))
                                  }
                                />
                              </label>

                              <label>
                                <span>セール個数（個）</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  placeholder="例: 5"
                                  value={(saleDraft[p.id] ?? { price: "", qty: "" }).qty}
                                  onChange={(e) =>
                                    setSaleDraft((prev) => ({
                                      ...prev,
                                      [p.id]: {
                                        price: (prev[p.id] ?? { price: "", qty: "" }).price,
                                        qty: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <div className="admin-sale-actions">
                              <button
                                className="admin-sale-apply"
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => applySale(p)}
                              >
                                {busyId === p.id ? "処理中..." : "この内容でセール開始"}
                              </button>

                              {p.hasSale && (
                                <button
                                  className="admin-sale-clear"
                                  type="button"
                                  disabled={busyId === p.id}
                                  onClick={() => clearSale(p)}
                                >
                                  セール解除
                                </button>
                              )}
                            </div>

                            <p className="admin-sale-hint">
                              在庫{p.stockNum}個のうち、指定した個数をセール価格で販売します。
                              売り切れると自動で通常価格（¥{formatPrice(p.price ?? 0)}円）に戻ります。
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="admin-sale-hint">
                        セール設定を使うには supabase_v18_product_sale.sql を実行してください
                      </p>
                    )}
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
