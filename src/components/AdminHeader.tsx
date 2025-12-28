import { Link, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import "./AdminHeader.css";

type MenuItem = { label: string; to: string };

export default function AdminHeader() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const menuItems: MenuItem[] = useMemo(
    () => [
      { label: "管理メニュー", to: "/admin-menu" },
      { label: "商品管理", to: "/admin-page" },
      { label: "お知らせ管理", to: "/admin-notices" }, // ✅ 追加
      { label: "売上", to: "/admin-sales" },
      { label: "ユーザー管理", to: "/admin-users" },
      { label: "クーポン", to: "/admin-coupons" },
      { label: "ホーム画面へ戻る", to: "/" },
    ],
    []
  );

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-row">
          <div className="admin-header-inner">
            <div className="admin-header-grid">
              <button
                type="button"
                className="admin-header-burger"
                aria-label="メニューを開く"
                onClick={() => setOpen(true)}
              >
                <span />
                <span />
                <span />
              </button>

              {/* ✅ 写真(ロゴ)押したらホームへ */}
              <Link to="/" className="admin-header-brand" aria-label="ホームへ戻る">
                <img src="/assets/logo.png" alt="NAGAZON" className="admin-header-logoimg" />
              </Link>

              <div className="admin-header-rightspacer" />
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div className="admin-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="admin-drawer-shell" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="admin-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ×
            </button>

            <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label="管理メニュー">
              <nav className="admin-drawer-nav">
                {menuItems.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    className="admin-drawer-item"
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