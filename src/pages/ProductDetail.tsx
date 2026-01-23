// src/pages/ProductDetail.tsx
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProductDetail.css";

import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { findProductImage } from "../data/products";
import type { Product } from "../types/Product";
import { findProductDetailImage } from "../data/productDetailImages";

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
  const [detailImage, setDetailImage] = useState<string | null>(null);

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
        .select("id, name, price, stock, created_at, is_visible")
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
        stock: Number((data as any).stock ?? 0),
        imageData: img,
        created_at: (data as any).created_at ?? null,
        is_visible: (data as any).is_visible ?? true,
      });

      setDetailImage(detailImg);
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

  const isHidden = product?.is_visible === false;

  const canPurchase = !isHidden && !isSoldOut;

  const isNew = isNewRaw && canPurchase;

  const priceNum = Number(product?.price ?? 0) || 0;
  const subtotal = priceNum * quantity;

  const titleBadge = useMemo(() => {
    if (!product) return null;
    if (isHidden) return { text: "現在購入できません", kind: "blocked" as const };
    if (isSoldOut) return { text: "売り切れ", kind: "soldout" as const };
    if (isNew) return { text: "NEW", kind: "new" as const };
    return null;
  }, [product, isHidden, isSoldOut, isNew]);

  const handleChangeQty = (delta: number) => {
    if (!canPurchase) return;
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > stockNum) return stockNum;
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

    if (totalQty > stockNum) return showCannotPurchase();

    cart.addToCart(product, quantity);
    await showAddedToCart(product.name, quantity);
  };

  const handleBuyNow = async () => {
    if (!product) return;

    if (isHidden) return showCannotPurchase();
    if (isSoldOut) return showCannotPurchase();

    navigate("/checkout", {
      state: { buyNow: { product, quantity } },
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

  return (
    <div className="pdetail-wrap">
      <SiteHeader />

      <main className="pdetail-main">
        <div className="pdetail-layoutTop">
          <section className="pdetail-left">
            <div className="pdetail-mediaCard">
              {product.imageData ? (
                <img src={product.imageData} alt={product.name} className="pdetail-image" />
              ) : (
                <div className="pdetail-noimg">No Image</div>
              )}
            </div>

            <div className="pdetail-summaryCard only-mobile">
              <div className="pdetail-titleRow">
                <h1 className="pdetail-name">
                  {product.name}
                  {titleBadge && (
                    <span className={`pdetail-inlineBadge ${titleBadge.kind}`}>
                      {titleBadge.text}
                    </span>
                  )}
                </h1>
              </div>

              <div className="pdetail-price">{formatYen(priceNum)}円</div>

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
                    －
                  </button>

                  <div className="pdetail-qtyValue">{quantity}</div>

                  <button
                    className="pdetail-qtyBtn"
                    onClick={() => handleChangeQty(1)}
                    disabled={quantity >= stockNum || !canPurchase}
                    aria-label="数量を増やす"
                    type="button"
                  >
                    ＋
                  </button>
                </div>
              </div>

              {!canPurchase && <div className="pdetail-note">※ 現在この商品は購入できません。</div>}
            </div>
          </section>

          <aside className="pdetail-right">
            <div className="pdetail-summaryCard only-desktop">
              <div className="pdetail-titleRow">
                <h1 className="pdetail-name">
                  {product.name}
                  {titleBadge && (
                    <span className={`pdetail-inlineBadge ${titleBadge.kind}`}>
                      {titleBadge.text}
                    </span>
                  )}
                </h1>
              </div>

              <div className="pdetail-price">{formatYen(priceNum)}円</div>

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
                    －
                  </button>

                  <div className="pdetail-qtyValue">{quantity}</div>

                  <button
                    className="pdetail-qtyBtn"
                    onClick={() => handleChangeQty(1)}
                    disabled={quantity >= stockNum || !canPurchase}
                    aria-label="数量を増やす"
                    type="button"
                  >
                    ＋
                  </button>
                </div>
              </div>

              <div className="pdetail-actions">
                <button className="pdetail-btn primary" onClick={handleBuyNow} disabled={!canPurchase} type="button">
                  すぐに購入
                </button>
                <button className="pdetail-btn secondary" onClick={handleAddToCart} disabled={!canPurchase} type="button">
                  カートに入れる
                </button>
              </div>

              {!canPurchase && <div className="pdetail-note">※ 現在この商品は購入できません。</div>}
            </div>
          </aside>
        </div>

        <section className="pdetail-descCard">
          <div className="pdetail-descHead">
            <h3 className="pdetail-descTitle">商品説明</h3>
          </div>

          {detailImage ? (
            <img src={detailImage} alt={`${product.name} の説明画像`} className="pdetail-descImage" />
          ) : (
            <div className="pdetail-descNone">この商品の説明はありません。</div>
          )}
        </section>
      </main>

      <div className="pdetail-bottomFixed only-mobile">
        <div className="pdetail-bottomInner">
          <div className="pdetail-bottomTotalRow">
            <div className="pdetail-bottomLabel">合計</div>
            <div className="pdetail-bottomValue">{formatYen(subtotal)}円</div>
          </div>

          <div className="pdetail-bottomBtns">
            <button className="pdetail-bottomBtn primary" onClick={handleBuyNow} disabled={!canPurchase} type="button">
              購入
            </button>
            <button className="pdetail-bottomBtn secondary" onClick={handleAddToCart} disabled={!canPurchase} type="button">
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