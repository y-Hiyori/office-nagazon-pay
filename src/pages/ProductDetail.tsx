// src/pages/ProductDetail.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProductDetail.css";

import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";
import { findProductImage } from "../data/products";
import type { Product } from "../types/Product"; // Cart の Product 型

const formatYen = (value: number) =>
  (Number(value) || 0).toLocaleString("ja-JP");

// CartContext の Product と同じ型をそのまま使う
type DetailProduct = Product;

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cart = useCart();

  const [product, setProduct] = useState<DetailProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const loadProduct = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      const productId = Number(id);

      // ★ created_at を取らない（テーブルに無いので 400 になる）
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock")
        .eq("id", productId)
        .maybeSingle();

      if (error || !data) {
        console.error("商品取得エラー:", error);
        setProduct(null);
        setLoading(false);
        return;
      }

      // ローカル画像を id から取得
      const img = findProductImage(productId) ?? null;

      setProduct({
        id: data.id,
        name: data.name,
        price: data.price,
        stock: Number(data.stock ?? 0),
        imageData: img,               // string | null
        // ★ 型合わせ用。created_at カラムが無いのでダミーを入れておく
        created_at: (data as any).created_at ?? "",
      });

      setLoading(false);
    };

    loadProduct();
  }, [id]);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  if (!product) {
    return (
      <div className="detail-page">
        <p>商品が見つかりませんでした。</p>
        <button className="detail-back" onClick={() => navigate("/products")}>
          ← 戻る
        </button>
      </div>
    );
  }

  const stockNum = Number(product.stock) || 0;
  const isSoldOut = stockNum === 0;
  const priceNum = Number(product.price) || 0;
  const subtotal = priceNum * quantity;

  const handleChangeQty = (delta: number) => {
    if (isSoldOut) return;
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > stockNum) return stockNum;
      return next;
    });
  };

  const handleAddToCart = () => {
    if (isSoldOut) return alert("在庫切れです。");

    const existing = cart.cart.find((item) => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    const totalQty = currentQty + quantity;
    const maxStock = stockNum;

    if (totalQty > maxStock) {
  alert("在庫が足りません。");
  return;
}

    cart.addToCart(product, quantity);
    alert(`「${product.name}」を${quantity}個カートに追加しました`);
  };

  const handleBuyNow = () => {
    if (isSoldOut) return alert("在庫切れです。");

    navigate("/checkout", {
      state: {
        buyNow: {
          product,
          quantity,
        },
      },
    });
  };

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="detail-back" onClick={() => navigate("/products")}>
          ←
        </button>
        <h2 className="detail-title">{product.name}</h2>
        <button className="detail-cart-icon" onClick={() => navigate("/cart")}>
          🛒
        </button>
      </header>

      <img
        src={product.imageData ?? ""}
        alt={product.name}
        className="detail-image"
      />

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
            onClick={() => handleChangeQty(-1)}
            disabled={quantity <= 1 || isSoldOut}
          >
            －
          </button>
          <span className="qty-value">{isSoldOut ? 0 : quantity}</span>
          <button
            className="qty-btn"
            onClick={() => handleChangeQty(1)}
            disabled={quantity >= stockNum || isSoldOut}
          >
            ＋
          </button>
        </div>

        <p className="detail-subtotal">小計：{formatYen(subtotal)}円</p>
      </div>

      <div className="detail-footer">
        <button
          className="footer-buy"
          onClick={handleBuyNow}
          disabled={isSoldOut}
        >
          すぐに購入
        </button>

        <button
          className="footer-cart"
          onClick={handleAddToCart}
          disabled={isSoldOut}
        >
          カートに入れる
        </button>
      </div>
    </div>
  );
}

export default ProductDetail;