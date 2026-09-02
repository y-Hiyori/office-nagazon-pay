import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import "./SiteHeader.css";
import { useCart } from "../context/CartContext";
import { lockScroll, unlockScroll } from "../lib/scrollLock";

type MenuItem = {
  label: string;
  to: string;
};

type Props = {
  accountHref?: string;
};

/* ============ アイコン（lucide風・線画SVG） ============ */

const IconCart = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 3h2l.6 3M6 6h15l-1.5 9H8L6 6z" />
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
  </svg>
);

const IconUser = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export default function SiteHeader({ accountHref = "/account" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const cart = useCart();

  // ✅ カート内の合計個数（商品種類じゃなく「個数」）
  const cartCount = useMemo(() => {
    const list = (cart as any)?.cart ?? [];
    return list.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  }, [cart]);

  const menuItems: MenuItem[] = useMemo(
    () => [
      { label: "商品一覧", to: "/products" },
      { label: "購入履歴", to: "/orders" },
      { label: "アプリの使い方", to: "/how-to" },
      { label: "お問い合わせ", to: "/contact" },
    ],
    []
  );

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  // ✅ ドロワー開いてる間スクロール止める（ズレ防止）
  useEffect(() => {
    const key = "site-header-drawer";
    if (open) lockScroll(key);
    else unlockScroll(key);

    return () => {
      unlockScroll(key);
    };
  }, [open]);

  // ✅ Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="site-header">
        <div className="site-header-row">
          <div className="site-header-inner">
            <div className="site-header-grid">
              {/* 左：バーガー */}
              <button
                type="button"
                className="site-header-burger"
                aria-label="メニューを開く"
                onClick={() => setOpen(true)}
              >
                <span />
                <span />
                <span />
              </button>

              {/* 中央：ロゴ */}
              <Link to="/" className="site-header-brand" aria-label="ホームへ">
                <img
                  src="/assets/logo.png"
                  alt="NAGAZON"
                  className="site-header-logoimg"
                />
              </Link>

              {/* 右：カート/アカウント */}
              <div className="site-header-actions">
                <Link
                  className="site-header-iconbtn site-header-cartbtn"
                  to="/cart"
                  aria-label={`カート（${cartCount}点）`}
                >
                  <IconCart />
                  {cartCount > 0 && (
                    <span className="site-header-badge" aria-hidden="true">
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  )}
                </Link>

                <Link className="site-header-iconbtn" to={accountHref} aria-label="アカウント">
                  <IconUser />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div className="site-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="site-drawer-shell" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="site-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ×
            </button>

            <aside className="site-drawer" role="dialog" aria-modal="true" aria-label="メニュー">
              <div className="site-drawer-brand">MENU</div>
              <nav className="site-drawer-nav">
                {menuItems.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    className="site-drawer-item"
                    onClick={() => go(item.to)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
