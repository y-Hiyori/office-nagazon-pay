// src/pages/ProductDetail.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProductDetail.css";

import { useCart } from "../context/CartContext";
import { supabase } from "../lib/supabase";

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cart = useCart();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  // 🔥 Supabase から単体商品を取得
  useEffect(() => {
    const loadProduct = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("商品取得エラー:", error);
      } else {
        setProduct(data);
      }
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

  // 数量変更
  const handleChangeQty = (delta: number) => {
    if (isSoldOut) return;
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > stockNum) return stockNum;
      return next;
    });
  };

  // 🛒 カート追加
  const handleAddToCart = () => {
    if (isSoldOut) return alert("在庫切れです。");

    const existing = cart.cart.find((item) => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;

    const totalQty = currentQty + quantity;
    const maxStock = Number(product.stock) || 0;

    if (totalQty > maxStock) {
      alert(`在庫が足りません。\n現在のカート数量：${currentQty}\n在庫：${maxStock}`);
      return;
    }

    cart.addToCart(product, quantity);
    alert(`「${product.name}」を${quantity}個カートに追加しました`);
  };

  // 🔥 即購入 → カートには入れずに checkout へ
  const handleBuyNow = () => {
    if (isSoldOut) return alert("在庫切れです。");

    // 「すぐに購入」用の情報を state に乗せて遷移
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

      {/* ヘッダー */}
      <header className="detail-header">
        <button className="detail-back" onClick={() => navigate("/products")}>
          ←
        </button>
        <h2 className="detail-title">{product.name}</h2>
        <button className="detail-cart-icon" onClick={() => navigate("/cart")}>
          🛒
        </button>
      </header>

      {/* 商品画像 */}
      <img
        src={product.imageData}
        alt={product.name}
        className="detail-image"
      />

      <div className="detail-section">
        <h1 className="detail-name">{product.name}</h1>
        <p className="detail-price">{product.price}円</p>

        <p className="detail-stock">
          在庫：{stockNum}
          {isSoldOut && <span className="soldout">（売り切れ）</span>}
        </p>

        {/* 数量 */}
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

        <p className="detail-subtotal">小計：{subtotal}円</p>
      </div>

      {/* 購入/カート */}
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