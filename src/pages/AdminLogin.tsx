// src/pages/AdminLogin.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminLogin.css";

const ADMIN_PASSWORD = "1234";

function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password === ADMIN_PASSWORD) {
      setError("");
      navigate("/admin-menu");
    } else {
      setError("パスワードが違います");
    }
  };

  return (
    <div className="admin-login-container">

      {/* ← 戻る（CSSで位置を揃える） */}
      <button
        className="back-button"
        onClick={() => navigate("/")}
      >
        ← 戻る
      </button>

      <h1 className="admin-login-title">管理者ログイン</h1>

      <form onSubmit={handleSubmit} className="admin-login-form">
        <input
          type="password"
          className="admin-login-input"
          placeholder="パスワードを入力"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="admin-login-error">{error}</p>}

        <button type="submit" className="admin-login-button">
          ログイン
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;