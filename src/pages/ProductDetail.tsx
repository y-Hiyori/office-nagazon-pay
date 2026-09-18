// src/pages/ProductDetail.tsx
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProductDetail.css";

import { useCart } from "../context/CartContext";
import { useIsMember } from "../lib/useIsMember";
import { memberPriceOf, effectivePrice } from "../lib/pricing";
import { supabase } from "../lib/supabase";
import { findProductImage } from "../data/products";
import type { Product } from "../types/Product";
import { findProductDetailImage } from "../data/productDetailImages";
import { fetchSaleLots, maxPerOrderOf, purchaseLimitOf, type SaleLot } from "../lib/lots";

import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

const formatYen = (value: number) => (Number(value) || 0).toLocaleString("ja-JP");
const NEW_PERIOD_MS = 24 * 60 * 60 * 1000;

type DetailProduct = Product & {
  created_at?: string | null;
  is_visible?: boolean | null;
};

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cart = useCart();

  const [product, setProduct] = useState<DetailProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const isMember = useIsMember();
  const [detailImage, setDetailImage] = useState<string | null>(null);
  // ✅ セール中ロット（同じ商品の一部だけセール価格で売る）
  const [saleLot, setSaleLot] = useState<SaleLot | null>(null);

  useEffect(() => {
    const loadProduct = async () => {
      setLoading(true);

      if (!id) {
        setProduct(null);
        setLoading(false);
        return;
      }

      const productId = Number(id);

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

      if (error || !data) {
        console.error("商品取得エラー:", error);
        setProduct(null);
        setLoading(false);
        return;
      }

      const img = (data as any).imageData ?? findProductImage(productId) ?? null;
      const detailImg = findProductDetailImage(productId) ?? null;

      setProduct({
        id: data.id,
        name: data.name,
        price: data.price,
        original_price: (data as any).original_price ?? (data as any).originalPrice ?? null,
        member_price: (data as any).member_price ?? null,
        earn_points: Number((data as any).earn_points ?? 0),
        is_shipping: !!(data as any).is_shipping,
        shipping_lead_min:
          (data as any).shipping_lead_min != null ? Number((data as any).shipping_lead_min) : null,
        shipping_lead_max:
          (data as any).shipping_lead_max != null ? Number((data as any).shipping_lead_max) : null,
        shipping_lead_unit:
          (data as any).shipping_lead_unit === "days" ? "days" : "business_days",
        stock: Number((data as any).stock ?? 0),
        imageData: img,
        created_at: (data as any).created_at ?? null,
        is_visible: (data as any).is_visible ?? true,
      });

      setDetailImage(detailImg);
      try {
        const saleMap = await fetchSaleLots();
        setSaleLot(saleMap.get(productId) ?? null);
      } catch (eSale) {
        console.error("sale lot load failed:", eSale);
        setSaleLot(null);
      }
      setQuantity(1);
      setLoading(false);
    };

    loadProduct();
  }, [id]);

  const createdAtMs = useMemo(() => {
    const s = product?.created_at ?? null;
    if (!s) return 0;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : 0;
  }, [product?.created_at]);

  const isNewRaw = useMemo(() => {
    if (!createdAtMs) return false;
    return Date.now() - createdAtMs <= NEW_PERIOD_MS;
  }, [createdAtMs]);

  const stockNum = Number(product?.stock ?? 0) || 0;
  const isSoldOut = stockNum <= 0;

  // ✅ 1回の会計で買える上限（在庫と購入上限の小さい方）
  const maxPerOrder = maxPerOrderOf(product);
  const purchaseLimit = purchaseLimitOf(product);

  const isHidden = product?.is_visible === false;

  const canPurchase = !isHidden && !isSoldOut;

  const isNew = isNewRaw && canPurchase;

  const basePriceNum = effectivePrice(product, isMember);
  // ✅ セールロットの残数内なら、そのロットのセール価格を使う
  // 0円セール（無料）も有効
  const lotSalePrice =
    saleLot && saleLot.sale_price >= 0 && quantity <= saleLot.remaining
      ? saleLot.sale_price
      : null;
  const priceNum = lotSalePrice != null ? lotSalePrice : basePriceNum;
  const memberPriceNum = isMember ? memberPriceOf(product) : null;
  const earnPoints = Math.max(0, Math.floor(Number((product as any)?.earn_points ?? 0)));
  const originalPriceNum =
    Number((product as any)?.original_price ?? (product as any)?.originalPrice ?? 0) || 0;
  const isSale = originalPriceNum > priceNum;
  const discountYen = isSale ? originalPriceNum - priceNum : 0;
  const discountRate = isSale ? Math.round((discountYen / originalPriceNum) * 100) : 0;
  const subtotal = priceNum * quantity;

  // ✅ 発送目安テキスト（商品詳細に表示）
  const shipLeadText = useMemo(() => {
    if (!product?.is_shipping) return null;
    const min = Number(product?.shipping_lead_min ?? 0);
    const max = Number(product?.shipping_lead_max ?? 0);
    const unit = product?.shipping_lead_unit === "days" ? "日" : "営業日";
    if (min <= 0 && max <= 0) return null;
    if (min > 0 && max >= min && max !== min) return `ご注文から${min}〜${max}${unit}以内に発送`;
    const n = max > 0 ? max : min;
    return `ご注文から${n}${unit}以内に発送`;
  }, [product]);

  const titleBadge = useMemo(() => {
    if (!product) return null;
    if (isHidden) return { text: "販売停止中", kind: "blocked" as const };
    if (isSoldOut) return { text: "SOLD OUT", kind: "soldout" as const };
    if (isNew) return { text: "NEW", kind: "new" as const };
    return null;
  }, [product, isHidden, isSoldOut, isNew]);

  const handleChangeQty = (delta: number) => {
    if (!canPurchase) return;
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > purchaseLimit) return purchaseLimit;
      return next;
    });
  };

  // ✅ alert() → アプリ内ダイアログ
  const showCannotPurchase = async () => {
    await appDialog.alert({
      title: "購入できません",
      message: "現在この商品は購入できません。",
    });
  };

  const showAddedToCart = async (name: string, qty: number) => {
    await appDialog.alert({
      title: "カートに追加しました",
      message: `「${name}」を${qty}個カートに追加しました`,
    });
  };

  const handleAddToCart = async () => {
    if (!product) return;

    if (isHidden) return showCannotPurchase();
    if (isSoldOut) return showCannotPurchase();

    const existing = cart.cart.find((item) => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const totalQty = currentQty + quantity;

    if (totalQty > purchaseLimit) return showCannotPurchase();

    const result = cart.addToCart({ ...product, price: priceNum }, quantity);

    if (result === "mixed") {
      await appDialog.alert({
        title: "カートに追加できません",
        message:
          "発送商品とその場受け取り商品は同時に購入できません。\nまずカートを空にしてから、どちらかにまとめて追加してください。",
      });
      return;
    }

    await showAddedToCart(product.name, quantity);
  };

  const handleBuyNow = async () => {
    if (!product) return;

    if (isHidden) return showCannotPurchase();
    if (isSoldOut) return showCannotPurchase();

    navigate("/checkout", {
      state: { buyNow: { product: { ...product, price: priceNum }, quantity } },
    });
  };

  if (loading) {
    return (
      <div className="pdetail-wrap">
        <SiteHeader />
        <main className="pdetail-main">
          <div className="pdetail-loading">読み込み中...</div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="pdetail-wrap">
        <SiteHeader />
        <main className="pdetail-main">
          <div className="pdetail-notfound">
            <div className="pdetail-notfound-title">商品が見つかりませんでした。</div>
            <button className="pdetail-back" onClick={() => navigate("/products")} type="button">
              商品一覧へ戻る
            </button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  /* ---------------- 購入カードの中身（PC/SPで共有） ---------------- */
  const SummaryCardContent = (
    <>
      <div className="pdetail-titleRow">
        <div className="pdetail-titleMeta">
          {isSale ? (
            <span className="pdetail-chip sale">
              通常価格 ¥{formatYen(originalPriceNum)}
            </span>
          ) : null}
          {titleBadge && (
            <span className={`pdetail-inlineBadge ${titleBadge.kind}`}>
              {titleBadge.text}
            </span>
          )}
          {product?.is_shipping ? (
            <span className="pdetail-chip shipping">発送商品</span>
          ) : null}
        </div>

        <h1 className="pdetail-name">{product.name}</h1>
      </div>

      {isMember && memberPriceNum != null ? (
        <div className="pdetail-pricePanel">
          <div className="pdetail-priceMainRow">
            <span className="pdetail-chip member">会員価格</span>
            <div className="pdetail-price is-member">¥{formatYen(priceNum)}</div>
          </div>
          <div className="pdetail-priceCompare">
            ¥{formatYen(Number(product?.price ?? 0))} → 会員 ¥{formatYen(priceNum)}
          </div>
        </div>
      ) : (
        <>
          {isSale ? (
            <div className="pdetail-pricePanel">
              <div className="pdetail-priceMainRow">
                <div className="pdetail-price">¥{formatYen(priceNum)}</div>
                <div className="pdetail-discountValue">
                  ¥{formatYen(discountYen)} OFF ({discountRate}%)
                </div>
              </div>
              <div className="pdetail-priceCompare">
                ¥{formatYen(originalPriceNum)} → ¥{formatYen(priceNum)}
              </div>
            </div>
          ) : (
            <div className="pdetail-price">¥{formatYen(priceNum)}</div>
          )}
        </>
      )}

      {earnPoints > 0 ? (
        isMember ? (
          <div className="pdetail-points">
            購入すると <span className="pdetail-points-num">＋{earnPoints.toLocaleString("ja-JP")}pt</span>
          </div>
        ) : (
          <div className="pdetail-points guest">
            <span className="pdetail-points-msg">
              アカウント登録して購入すると <span className="pdetail-points-num">＋{earnPoints.toLocaleString("ja-JP")}pt</span> もらえます
            </span>
            <button className="pdetail-points-link" onClick={() => navigate("/signup")} type="button">
              会員登録はこちら
            </button>
          </div>
        )
      ) : null}

      {(lotSalePrice != null || maxPerOrder != null) && (
        <div className="pdetail-lotInfo">
          {lotSalePrice != null && (
            <div className="pdetail-lotSale">
              いまだけセール価格 {lotSalePrice === 0 ? "¥0（無料）" : `¥${formatYen(lotSalePrice)}`}
              （セール残り{saleLot?.remaining}個）
            </div>
          )}
          {maxPerOrder != null && (
            <div className="pdetail-lotLimit">1回のお会計で {maxPerOrder} 個まで</div>
          )}
        </div>
      )}

      <div className="pdetail-qtyRow">
        <div className="pdetail-qtyLabel">数量</div>
        <div className="pdetail-qtyControls">
          <button
            className="pdetail-qtyBtn"
            onClick={() => handleChangeQty(-1)}
            disabled={quantity <= 1 || !canPurchase}
            aria-label="数量を減らす"
            type="button"
          >
            −
          </button>

          <div className="pdetail-qtyValue">{quantity}</div>

          <button
            className="pdetail-qtyBtn"
            onClick={() => handleChangeQty(1)}
            disabled={quantity >= purchaseLimit || !canPurchase}
            aria-label="数量を増やす"
            type="button"
          >
            ＋
          </button>
        </div>
      </div>

      <div className="pdetail-subtotalRow">
        <span>合計</span>
        <span className="pdetail-subtotal">¥{formatYen(subtotal)}</span>
      </div>

      {product?.is_shipping ? (
        <div className="pdetail-shipNote pdetail-shipNoteBox">
          <div className="pdetail-shipNoteMain">本商品は「発送」でお届けします。購入時に配送先の入力が必要です。</div>
          {shipLeadText ? <div className="pdetail-shipLead">発送目安：{shipLeadText}</div> : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="pdetail-wrap">
      <SiteHeader />

      <main className="pdetail-main">
        <div className="pdetail-layoutTop">
          <section className="pdetail-left">
            <div className={`pdetail-mediaCard ${isSoldOut ? "is-soldout" : ""}`}>
              {/* 画像上の左上バッジ（SALEだけ。SOLDは中央大表示に変えたので不要） */}
              <div className="pdetail-badges">
                {isSale ? <span className="pdetail-badge sale">SALE</span> : null}
              </div>

              {product.imageData ? (
                <img src={product.imageData} alt={product.name} className="pdetail-image" />
              ) : (
                <div className="pdetail-noimg">NO IMAGE</div>
              )}

              {isSoldOut ? <div className="pdetail-soldLabel">SOLD OUT</div> : null}
            </div>
          </section>

          <aside className="pdetail-right">
            {/* PC：右カラムに購入カード（ボタン付き） */}
            <div className="pdetail-summaryCard">
              {SummaryCardContent}

              <div className="pdetail-actions">
                <button
                  className="pdetail-btn primary"
                  onClick={handleBuyNow}
                  disabled={!canPurchase}
                  type="button"
                >
                  すぐに購入
                </button>
                <button
                  className="pdetail-btn secondary"
                  onClick={handleAddToCart}
                  disabled={!canPurchase}
                  type="button"
                >
                  カートに入れる
                </button>
              </div>

              {!canPurchase && (
                <div className="pdetail-note">※ 現在この商品は購入できません。</div>
              )}
            </div>
          </aside>
        </div>

        <section className="pdetail-descCard">
          <div className="pdetail-descHead">
            <h3 className="pdetail-descTitle">商品説明</h3>
          </div>

          {detailImage ? (
            <img
              src={detailImage}
              alt={`${product.name} の説明画像`}
              className="pdetail-descImage"
            />
          ) : (
            <div className="pdetail-descNone">この商品の説明はありません。</div>
          )}
        </section>
      </main>

      {/* スマホ下固定バー */}
      <div className="pdetail-bottomFixed only-mobile">
        <div className="pdetail-bottomInner">
          <div className="pdetail-bottomTotalRow">
            <div className="pdetail-bottomLabel">合計</div>
            <div className="pdetail-bottomValue">¥{formatYen(subtotal)}</div>
          </div>

          <div className="pdetail-bottomBtns">
            <button
              className="pdetail-bottomBtn primary"
              onClick={handleBuyNow}
              disabled={!canPurchase}
              type="button"
            >
              購入
            </button>
            <button
              className="pdetail-bottomBtn secondary"
              onClick={handleAddToCart}
              disabled={!canPurchase}
              type="button"
            >
              カート
            </button>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

export default ProductDetail;
