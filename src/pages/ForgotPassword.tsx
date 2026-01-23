// src/pages/ForgotPassword.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Login.css"; // ログイン画面と同じデザインを流用

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSendResetMail = async () => {
    if (!email) {
      setError("パスワード再設定メールを送るには、メールアドレスを入力してください。");
      return;
    }

    setError("");
    setIsSending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://office-nagazon-pay.vercel.app/reset-password",
    });

    if (error) {
      setError("パスワード再設定メールの送信に失敗しました: " + error.message);
      setIsSending(false);
      return;
    }

    // ✅ alert → アプリ内
    await appDialog.alert({
      title: "送信しました",
      message: "パスワード再設定用のメールを送信しました。メールボックスを確認してください。",
    });

    // 送信後はログイン画面に戻す（挙動は同じ）
    navigate("/login");
    setIsSending(false);
  };

  return (
    <div className="login-container">
      {/* ← 戻る */}
      <button className="login-back" onClick={() => navigate("/login")}>
        ← 戻る
      </button>

      <h1 className="login-title">パスワード再設定</h1>

      <p style={{ fontSize: 14, marginBottom: 16 }}>
        登録済みのメールアドレスを入力すると、
        パスワード再設定用のリンクをメールでお送りします。
      </p>

      <input
        type="email"
        className="login-input"
        placeholder="登録済みのメールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {error && <p className="login-error">{error}</p>}

      <button className="login-button" onClick={handleSendResetMail} disabled={isSending}>
        {isSending ? "送信中..." : "再設定メールを送信する"}
      </button>
    </div>
  );
}

export default ForgotPassword;