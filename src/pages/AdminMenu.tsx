// src/pages/AdminMenu.tsx
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminHeader from "../components/AdminHeader";
import "./AdminMenu.css";

function AdminMenu() {
  const navigate = useNavigate();

  // ✅ このページの時だけ、下地（body/#root）を白に固定
  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  return (
    <>
      <AdminHeader />

      {/* ✅ これが無かったのが原因 */}
      <div className="admin-menu-page">
        <div className="admin-menu-container">
          <h2 className="admin-menu-title">管理者メニュー</h2>

          <div className="admin-menu-buttons">
            <button className="admin-menu-btn" onClick={() => navigate("/admin-page")}>
              商品管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-coupons")}>
              クーポン管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-users")}>
              アカウント管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-sales")}>
              売上状況確認
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminMenu;