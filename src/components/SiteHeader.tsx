import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import "./SiteHeader.css";

type MenuItem = {
  label: string;
  to: string;
};

type Props = {
  accountHref?: string;
};

export default function SiteHeader({ accountHref = "/account" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // ✅ 「トップ」は入れない（ロゴ押したらホームに戻るだけ）
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
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
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

              {/* 中央：ロゴ（ホームへ） */}
              <Link to="/" className="site-header-brand" aria-label="ホームへ">
                <img src="/assets/logo.png" alt="NAGAZON" className="site-header-logoimg" />
              </Link>

              {/* 右：カート/アカウント（四角のまま） */}
              <div className="site-header-actions">
                <Link className="site-header-iconbtn" to="/cart" aria-label="カート">
                  🛒
                </Link>
                <Link className="site-header-iconbtn" to={accountHref} aria-label="アカウント">
                  👤
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div className="site-drawer-overlay" onClick={() => setOpen(false)}>
          {/* ✅ ×を固定する“箱” */}
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