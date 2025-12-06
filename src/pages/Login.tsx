// src/pages/Login.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("ログインできません: " + error.message);
      return;
    }

    alert("ログイン成功！");
    navigate("/account");
  };

  // ★ パスワードを忘れた方 → 専用画面へ
  const handleGoForgotPassword = () => {
    navigate("/forgot-password");
  };

  return (
    <div className="login-container">
      {/* ← 戻る */}
      <button className="login-back" onClick={() => navigate("/auth")}>
        ← 戻る
      </button>

      <h1 className="login-title">ログイン</h1>

      <input
        type="email"
        className="login-input"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        className="login-input"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {/* ★ パスワードを忘れた方（右下に小さく表示） */}
      <div className="login-forgot-row">
        <button
          type="button"
          className="login-forgot-link"
          onClick={handleGoForgotPassword}
        >
          パスワードをお忘れの方
        </button>
      </div>

      {error && <p className="login-error">{error}</p>}

      <button className="login-button" onClick={handleLogin}>
        ログイン
      </button>

      {/* 新規登録ボタンは今まで通り大きいボタン */}
      <button className="login-link" onClick={() => navigate("/signup")}>
        新規アカウント作成はこちら
      </button>
    </div>
  );
}

export default Login;