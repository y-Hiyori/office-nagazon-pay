// src/pages/AdminMenu.tsx
import { useNavigate } from "react-router-dom";
import "./AdminMenu.css";

function AdminMenu() {
  const navigate = useNavigate();

  return (
    <div className="admin-menu-container">

      {/* 戻る */}
      <button
        className="back-button"
        onClick={() => navigate("/")}
      >
        ← 戻る
      </button>

      <h2 className="admin-menu-title">管理者メニュー</h2>

      <div className="admin-menu-buttons">

        <button
          className="admin-menu-btn"
          onClick={() => navigate("/admin-page")}
        >
          商品管理
        </button>

        <button
          className="admin-menu-btn"
          onClick={() => navigate("/admin-users")}
        >
          アカウント管理
        </button>

      </div>
    </div>
  );
}

export default AdminMenu;