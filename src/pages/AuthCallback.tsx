// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("メール認証を確認しています…");
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      // ① ログイン中ユーザー取得（メールリンクから来ていればここに入る）
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        console.error(error);
        setError("認証情報が見つかりませんでした。もう一度ログインしてみてください。");
        setMessage("");
        return;
      }

      const user = data.user;

      // ② メールが本当に確認済みかチェック
      // （一応チェックするけど、リンクから来ていれば基本OK）
      if (!user.email_confirmed_at) {
        setError("メール認証がまだ完了していません。メール内のリンクをもう一度開いてください。");
        setMessage("");
        return;
      }

      // ③ サインアップ時に入れた user_metadata から名前を取り出す
      const meta = user.user_metadata as { name?: string } | null;
      const nameFromMeta = meta?.name ?? null;

      // ④ profiles に upsert（行がなければ作る／あれば上書き）
      const payload: {
        id: string;
        name?: string | null;
        email?: string | null;
      } = {
        id: user.id,
      };

      if (nameFromMeta) {
        payload.name = nameFromMeta;
      }
      if (user.email) {
        payload.email = user.email;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (profileError) {
        console.error(profileError);
        setError("プロフィール更新中にエラーが発生しました。");
        setMessage("");
        return;
      }

      // ⑤ 完了メッセージ → ちょっと待ってからトップへ
      setMessage("メール認証が完了しました。ホームに移動します。");
      setError("");

      setTimeout(() => {
        navigate("/"); // 好きなページに変えてOK（例: "/mypage" とか）
      }, 1500);
    };

    run();
  }, [navigate]);

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
            background:
              "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#ffffff",
          }}
          onClick={() => navigate("/")}
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  );
}

export default AuthCallback;