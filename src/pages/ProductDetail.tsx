// src/pages/ProductDetail.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProductDetail.css";

import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { findProductImage } from "../data/products";
import type { Product } from "../types/Product";

import { findProductDetailImage } from "../data/productDetailImages";

import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";

const formatYen = (value: number) => (Number(value) || 0).toLocaleString("ja-JP");

type DetailProduct = Product;

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
      if (!id) {
        setLoading(false);
        return;
      }

      const productId = Number(id);

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock, created_at")
        .eq("id", productId)
        .maybeSingle();

      if (error || !data) {
        console.error("商品取得エラー:", error);
        setProduct(null);
        setLoading(false);
        return;
      }

      const img = findProductImage(productId) ?? null;
      const detailImg = findProductDetailImage(productId) ?? null;

      setProduct({
        id: data.id,
        name: data.name,
        price: data.price,
        stock: Number(data.stock ?? 0),
        imageData: img,
        created_at: (data as any).created_at ?? "",
      });

      setDetailImage(detailImg);
      setLoading(false);
    };

    loadProduct();
  }, [id]);

  const handleChangeQty = (delta: number, stockNum: number, isSoldOut: boolean) => {
    if (isSoldOut) return;
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > stockNum) return stockNum;
      return next;
    });
  };

  const handleAddToCart = (product: DetailProduct, stockNum: number, isSoldOut: boolean) => {
    if (isSoldOut) return alert("在庫切れです。");

    const existing = cart.cart.find((item) => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const totalQty = currentQty + quantity;

    if (totalQty > stockNum) {
      alert("在庫が足りません。");
      return;
    }

    cart.addToCart(product, quantity);
    alert(`「${product.name}」を${quantity}個カートに追加しました`);
  };

  const handleBuyNow = (product: DetailProduct, isSoldOut: boolean) => {
    if (isSoldOut) return alert("在庫切れです。");

    navigate("/checkout", {
      state: {
        buyNow: { product, quantity },
      },
    });
  };

  // ✅ 読み込み中/見つからない時もヘッダー統一
  if (loading) {
    return (
      <div className="detail-page-wrap">
        <SiteHeader />
        <div className="detail-page">
          <p style={{ padding: 20 }}>読み込み中...</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="detail-page-wrap">
        <SiteHeader />
        <div className="detail-page">
          <p style={{ padding: 20 }}>商品が見つかりませんでした。</p>
          <button className="detail-back-simple" onClick={() => navigate("/products")}>
            商品一覧へ戻る
          </button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const stockNum = Number(product.stock) || 0;
  const isSoldOut = stockNum === 0;
  const priceNum = Number(product.price) || 0;
  const subtotal = priceNum * quantity;

  return (
    <div className="detail-page-wrap">
      {/* ✅ 共通ヘッダー */}
      <SiteHeader />

      {/* ✅ 480px中央のページ */}
      <div className="detail-page">
        <div className="detail-card">
          {product.imageData ? (
            <img src={product.imageData} alt={product.name} className="detail-image" />
          ) : (
            <div className="detail-noimg">画像なし</div>
          )}

          <div className="detail-section">
            <h1 className="detail-name">{product.name}</h1>
            <p className="detail-price">{formatYen(priceNum)}円</p>

            {isSoldOut && (
              <p className="detail-stock">
                <span className="soldout">売り切れ</span>
              </p>
            )}

            <div className="detail-qty-row">
              <span>数量：</span>
              <button
                className="qty-btn"
                onClick={() => handleChangeQty(-1, stockNum, isSoldOut)}
                disabled={quantity <= 1 || isSoldOut}
              >
                －
              </button>
              <span className="qty-value">{isSoldOut ? 0 : quantity}</span>
              <button
                className="qty-btn"
                onClick={() => handleChangeQty(1, stockNum, isSoldOut)}
                disabled={quantity >= stockNum || isSoldOut}
              >
                ＋
              </button>
            </div>

            <p className="detail-subtotal">小計：{formatYen(subtotal)}円</p>
          </div>
        </div>

        <section className="detail-desc-section">
          <h3 className="detail-desc-title">商品説明</h3>
          {detailImage ? (
            <img
              src={detailImage}
              alt={`${product.name} の説明画像`}
              className="detail-desc-image"
            />
          ) : (
            <p className="detail-desc-none">この商品の説明はありません。</p>
          )}
        </section>

        {/* ✅ 購入バー（stickyのままでOK） */}
        <div className="detail-footer">
          <button
            className="footer-buy"
            onClick={() => handleBuyNow(product, isSoldOut)}
            disabled={isSoldOut}
          >
            すぐに購入
          </button>

          <button
            className="footer-cart"
            onClick={() => handleAddToCart(product, stockNum, isSoldOut)}
            disabled={isSoldOut}
          >
            カートに入れる
          </button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

export default ProductDetail;