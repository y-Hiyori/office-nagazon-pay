import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminHeader from "../components/AdminHeader";
import { ADMIN_NAV } from "../lib/adminNav";
import "./AdminMenu.css";

function AdminMenu() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  return (
    <>
      <AdminHeader />

      <div className="admin-menu-page">
        <div className="admin-menu-container">
          <h2 className="admin-menu-title">管理者メニュー</h2>

          {ADMIN_NAV.map((g) => (
            <section className="admin-menu-group" key={g.title}>
              <h3 className="admin-menu-group-title">
                {g.title}
                {g.note && <span className="admin-menu-group-note">{g.note}</span>}
              </h3>

              <div className="admin-menu-buttons">
                {g.items.map((it) => (
                  <button
                    key={it.path}
                    className={`admin-menu-btn ${it.tone ? "is-" + it.tone : ""}`}
                    onClick={() => navigate(it.path)}
                    type="button"
                  >
                    <span className="admin-menu-icon" aria-hidden="true">{it.icon}</span>
                    <span className="admin-menu-text">
                      <span className="admin-menu-label">{it.label}</span>
                      <span className="admin-menu-desc">{it.desc}</span>
                    </span>
                    <span className="admin-menu-chev" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export default AdminMenu;
