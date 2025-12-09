// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState(
    "メール認証が完了しました。ログイン画面からログインしてください。"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 万が一エラー付きのURLで飛んできたときだけエラーメッセージに切り替える
    const hash = window.location.hash; // 例: #error_code=...&error_description=...
    if (hash.startsWith("#error")) {
      const params = new URLSearchParams(hash.slice(1));
      const desc = params.get("error_description");
      setError(
        desc ??
          "認証リンクが無効か、有効期限が切れています。もう一度アカウント作成をやり直してください。"
      );
      setMessage("");
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "32px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        background: "#f3f4f6",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#ffffff",
          borderRadius: 16,
          padding: "24px 20px",
          boxShadow: "0 18px 40px rgba(15,23,42,0.15)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          メール認証
        </h1>

        {message && (
          <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 8 }}>
            {message}
          </p>
        )}

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", marginTop: 8 }}>
            {error}
          </p>
        )}

        <button
          style={{
            marginTop: 16,
            padding: "10px 18px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#ffffff",
          }}
          onClick={() => navigate("/login")}
        >
          ログイン画面へ
        </button>
      </div>
    </div>
  );
}

export default AuthCallback;