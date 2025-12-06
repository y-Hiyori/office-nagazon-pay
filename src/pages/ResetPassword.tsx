// src/pages/ResetPassword.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Login.css";

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdatePassword = async () => {
    if (!password || !passwordConfirm) {
      setError("新しいパスワードを2回入力してください。");
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワードが一致しません。もう一度確認してください。");
      return;
    }

    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }

    setError("");
    setIsUpdating(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setError("パスワードの更新に失敗しました: " + error.message);
      setIsUpdating(false);
      return;
    }

    alert("パスワードを変更しました。新しいパスワードでログインしてください。");
    setIsUpdating(false);
    navigate("/login");
  };

  return (
    <div className="login-container">
      {/* ← 戻る */}
      <button className="login-back" onClick={() => navigate("/login")}>
        ← 戻る
      </button>

      <h1 className="login-title">パスワード変更</h1>

      <p style={{ fontSize: 14, marginBottom: 16 }}>
        メールのリンクから開かれたページです。<br />
        新しいパスワードを設定してください。
      </p>

      <input
        type="password"
        className="login-input"
        placeholder="新しいパスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <input
        type="password"
        className="login-input"
        placeholder="新しいパスワード（確認用）"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
      />

      {error && <p className="login-error">{error}</p>}

      <button
        className="login-button"
        onClick={handleUpdatePassword}
        disabled={isUpdating}
      >
        {isUpdating ? "変更中..." : "パスワードを変更する"}
      </button>
    </div>
  );
}

export default ResetPassword;