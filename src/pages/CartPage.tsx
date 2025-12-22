// src/pages/CartPage.tsx
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./CartPage.css";

function CartPage() {
  const { cart, removeFromCart, updateQuantity, getTotalPrice } = useCart();
  const navigate = useNavigate();

  const total = getTotalPrice();

  const formatPrice = (value: number | string) =>
    Number(value || 0).toLocaleString("ja-JP");

  const goDetail = (productId: string | number) => {
    // ✅ 正式ルートに統一
    navigate(`/products/${productId}`);
  };

  return (
    <div className="cart-page">
      <SiteHeader />

      <main className="cart-wrap">
        <h2 className="cart-title">カート</h2>

        <div className="cart-content">
          {cart.length === 0 ? (
            <p className="cart-empty">カートは空です</p>
          ) : (
            cart.map((item) => {
              const max = Number(item.product.stock) || 0;

              return (
                <div key={item.id} className="cart-item">
                  <div
                    className="cart-img"
                    onClick={() => goDetail(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") goDetail(item.id);
                    }}
                  >
                    {item.product.imageData ? (
                      <img src={item.product.imageData} alt={item.product.name} />
                    ) : (
                      <div className="no-img">画像なし</div>
                    )}
                  </div>

                  <div
                    className="cart-info"
                    onClick={() => goDetail(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") goDetail(item.id);
                    }}
                  >
                    <p className="name">{item.product.name}</p>
                    <p className="price">
                      {formatPrice(item.product.price)}円 × {item.quantity}
                    </p>

                    <div className="qty-row">
                      <button
                        className="qty-btn"
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
                        className="qty-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity + 1);
                        }}
                        disabled={max > 0 && item.quantity >= max}
                      >
                        ＋
                      </button>
                    </div>
                  </div>

                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromCart(item.id);
                    }}
                    aria-label="削除"
                  >
                    🗑
                  </button>
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-summary">
            <p className="total">合計：{formatPrice(total)}円</p>
            <button className="buy-btn" onClick={() => navigate("/checkout")}>
              購入へ進む
            </button>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default CartPage;