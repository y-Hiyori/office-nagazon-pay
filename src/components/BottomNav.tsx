// src/components/BottomNav.tsx
// 画面下に浮かぶナビゲーションバー（お客様向け画面だけに表示）
import { useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useUser } from "../context/UserContext";
import "./BottomNav.css";

const Icon = ({ d }: { d: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const IconHome = () => <Icon d={<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>} />;
const IconGrid = () => <Icon d={<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>} />;
const IconHeart = () => <Icon d={<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />} />;
const IconBell = () => <Icon d={<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>} />;
const IconCart = () => <Icon d={<><path d="M2 3h2l.6 3M6 6h15l-1.5 9H8L6 6z" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></>} />;

// 表示しない画面（管理画面・決済中・認証・ゲームなど、下に固定ボタンがある画面）
function isHidden(pathname: string) {
  if (pathname.startsWith("/admin")) return true;
  if (/^\/(products|product)\/[^/]+/.test(pathname)) return true; // 商品詳細は購入バーがある
  const exact = [
    "/checkout",
    "/paypay-return",
    "/paypay-sim",
    "/paypay-failed",
    "/auth",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
  ];
  if (exact.includes(pathname)) return true;
  if (pathname.startsWith("/purchase-complete")) return true;
  if (pathname.startsWith("/game")) return true;
  return false;
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const { cart } = useCart();
  const { unreadCount } = useUser();
  const hidden = isHidden(pathname);

  const cartCount = useMemo(
    () => cart.reduce((s, it) => s + (Number(it.quantity) || 0), 0),
    [cart]
  );

  // ナビに隠れないよう、ページ下に余白を作る
  useEffect(() => {
    document.body.classList.toggle("has-bottom-nav", !hidden);
    return () => document.body.classList.remove("has-bottom-nav");
  }, [hidden]);

  if (hidden) return null;

  const items = [
    { to: "/", label: "ホーム", icon: <IconHome />, end: true },
    { to: "/products", label: "商品", icon: <IconGrid /> },
    { to: "/favorites", label: "お気に入り", icon: <IconHeart /> },
    { to: "/inbox", label: "お知らせ", icon: <IconBell />, badge: unreadCount },
    { to: "/cart", label: "カート", icon: <IconCart />, badge: cartCount },
  ];

  return (
    <nav className="bnav" aria-label="メインメニュー">
      <div className="bnav-bar">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `bnav-item ${isActive ? "is-active" : ""}`}
          >
            <span className="bnav-icon">
              {it.icon}
              {it.badge ? (
                <span className="bnav-badge" aria-label={`${it.badge}件`}>
                  {it.badge > 99 ? "99+" : it.badge}
                </span>
              ) : null}
            </span>
            <span className="bnav-label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
