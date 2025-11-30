// src/pages/AuthSelect.tsx
import { useNavigate } from "react-router-dom";
import "./AuthSelect.css";

function AuthSelect() {
  const navigate = useNavigate();

  return (
    <div className="auth-container">
      {/* 戻るボタン（テキストは「戻る」だけ！） */}
      <button
        className="auth-back"
        onClick={() => navigate("/")}
      >
        戻る
      </button>

      {/* タイトル */}
      <h2 className="auth-title">アカウント</h2>

      {/* ログイン */}
      <button
        className="auth-btn login"
        onClick={() => navigate("/login")}
      >
        ログイン
      </button>

      {/* 新規アカウント作成 */}
      <button
        className="auth-btn signup"
        onClick={() => navigate("/signup")}
      >
        新規アカウント作成
      </button>
    </div>
  );
}

export default AuthSelect;