// src/pages/CartPage.tsx
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import "./CartPage.css";

function CartPage() {
  const { cart, removeFromCart, updateQuantity, getTotalPrice } = useCart();
  const navigate = useNavigate();

  const total = getTotalPrice();

  // 💰 カンマ区切り
  const formatPrice = (value: number | string) =>
    Number(value || 0).toLocaleString("ja-JP");

  return (
    <div className="cart-page">
      <header className="cart-header">
        <button className="cart-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2>カート</h2>
      </header>

      <div className="cart-content">
        {cart.length === 0 ? (
          <p className="cart-empty">カートは空です</p>
        ) : (
          cart.map((item) => {
            const max = Number(item.product.stock) || 0;

            return (
              <div key={item.id} className="cart-item">
                {/* 商品タップで詳細へ */}
                <div
                  className="cart-img"
                  onClick={() => navigate(`/product/${item.id}`)}
                >
                  {item.product.imageData ? (
                    <img src={item.product.imageData} />
                  ) : (
                    <div className="no-img">画像なし</div>
                  )}
                </div>

                {/* 情報（こちらを押しても詳細へ） */}
                <div
                  className="cart-info"
                  onClick={() => navigate(`/product/${item.id}`)}
                >
                  <p className="name">{item.product.name}</p>
                  <p className="price">
                    {formatPrice(item.product.price)}円 × {item.quantity}
                    （在庫: {max}）
                  </p>

                  {/* 数量変更：stopPropagation が重要 */}
                  <div className="qty-row">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(item.id, item.quantity - 1);
                      }}
                      disabled={item.quantity <= 1}
                    >
                      －
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(item.id, item.quantity + 1);
                      }}
                      disabled={item.quantity >= max}
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {/* 削除ボタン */}
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromCart(item.id);
                  }}
                >
                  🗑
                </button>
              </div>
            );
          })
        )}
      </div>

      {cart.length > 0 && (
        <footer className="cart-footer">
          <p className="total">合計：{formatPrice(total)}円</p>
          <button className="buy-btn" onClick={() => navigate("/checkout")}>
            購入へ進む
          </button>
        </footer>
      )}
    </div>
  );
}

export default CartPage;