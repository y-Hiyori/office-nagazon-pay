// src/pages/Login.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false); // ★ 連打防止フラグ

  const handleLogin = async () => {
    if (loggingIn) return; // すでにログイン処理中なら何もしない

    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    setError("");
    setLoggingIn(true); // ★ ログイン開始

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("ログインできません: " + error.message);
      setLoggingIn(false); // 失敗したら解除
      return;
    }

    // ✅ alert → アプリ内
    await appDialog.alert({
      title: "ログイン",
      message: "ログイン成功！",
    });

    setLoggingIn(false);
    navigate("/account");
  };

  // ★ パスワードを忘れた方 → 専用画面へ
  const handleGoForgotPassword = () => {
    if (loggingIn) return; // 一応ここでもガードしておく
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

      <button
        className="login-button"
        onClick={handleLogin}
        disabled={loggingIn} // ★ 処理中は押せない
      >
        {loggingIn ? "ログイン中..." : "ログイン"}
      </button>

      {/* 新規登録ボタンは今まで通り大きいボタン */}
      <button className="login-link" onClick={() => navigate("/signup")}>
        新規アカウント作成はこちら
      </button>
    </div>
  );
}

export default Login;