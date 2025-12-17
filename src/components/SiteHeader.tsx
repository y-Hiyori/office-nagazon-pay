import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import "./SiteHeader.css";

type MenuItem = {
  label: string;
  to: string;
};

type Props = {
  accountHref?: string; // ✅ 追加（未ログインなら /auth とかに切替）
};

export default function SiteHeader({ accountHref = "/account" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const menuItems: MenuItem[] = useMemo(
    () => [
      { label: "商品一覧", to: "/products" },
      { label: "ホームに戻る", to: "/" },
    ],
    []
  );

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <>
      <header className="site-header">
        <div className="site-header-row">
          <div className="site-header-inner site-header-row-inner">
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

            <Link to="/" className="site-header-brand" aria-label="ホームへ">
              <img
                src="/assets/logo.png"
                alt="NAGAZON"
                className="site-header-logoimg"
              />
            </Link>

            <div className="site-header-actions">
              <Link className="site-header-iconbtn" to="/cart" aria-label="カート">
                🛒
              </Link>

              {/* ✅ ここだけ差し替え */}
              <Link className="site-header-iconbtn" to={accountHref} aria-label="アカウント">
                👤
              </Link>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div className="site-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="site-drawer-shell" onClick={(e) => e.stopPropagation()}>
            <button
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