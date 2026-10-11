import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./AdminHeader.css";
import { lockScroll, unlockScroll } from "../lib/scrollLock";
import { ADMIN_NAV } from "../lib/adminNav";

export default function AdminHeader() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const loc = useLocation();

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  useEffect(() => {
    const key = "admin-header-drawer";
    if (open) lockScroll(key);
    else unlockScroll(key);

    return () => {
      unlockScroll(key);
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
              <div className="admin-drawer-title">管理メニュー</div>
              <nav className="admin-drawer-nav">
                <button
                  type="button"
                  className={`admin-drawer-item ${loc.pathname === "/admin-menu" ? "is-current" : ""}`}
                  onClick={() => go("/admin-menu")}
                >
                  <span className="admin-drawer-icon" aria-hidden="true">🏠</span>
                  管理者メニュー
                </button>
                {ADMIN_NAV.map((g) => (
                  <div className="admin-drawer-group" key={g.title}>
                    <div className="admin-drawer-group-title">{g.title}</div>
                    {g.items.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        className={`admin-drawer-item ${loc.pathname.startsWith(item.path) ? "is-current" : ""} ${
                          item.tone ? "is-" + item.tone : ""
                        }`}
                        aria-current={loc.pathname.startsWith(item.path) ? "page" : undefined}
                        onClick={() => go(item.path)}
                      >
                        <span className="admin-drawer-icon" aria-hidden="true">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
                <button type="button" className="admin-drawer-item is-home" onClick={() => go("/")}>
                  <span className="admin-drawer-icon" aria-hidden="true">↩</span>
                  お店の画面へ戻る
                </button>
              </nav>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
