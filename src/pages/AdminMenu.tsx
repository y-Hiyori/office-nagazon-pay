// src/pages/AdminMenu.tsx
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminHeader from "../components/AdminHeader";
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

          <div className="admin-menu-buttons">
            <button className="admin-menu-btn" onClick={() => navigate("/admin-page")}>
              商品管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-notices")}>
              お知らせ管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-coupons")}>
              クーポン管理
            </button>

            <button className="admin-menu-btn" onClick={() => navigate("/admin-points")}>
              ポイント管理
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