// src/pages/Signup.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Signup.css";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false); // ★ 連打防止フラグ

  const handleSignup = async () => {
    // すでに送信中なら何もしない
    if (submitting) return;

    setError("");

    // 入力チェック
    if (!name || !email || !password || !passwordConfirm) {
      setError("すべて入力してください");
      return;
    }

    // ★ パスワードの文字数チェック（6文字未満）
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワードが一致しません");
      return;
    }

    // ここから本当にサインアップ処理を走らせるのでロック
    setSubmitting(true);

    // ① Auth 登録（メール認証あり）
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // ★ 認証後に戻るURL（コールバック用のページを作る）
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // ★ 名前を user_metadata に一緒に入れておく
        data: {
          name,
        },
      },
    });

    // ② エラーの場合
    if (signUpError) {
      console.error("signUpError:", signUpError);

      const msg = signUpError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        setError("このメールアドレスはすでに使用されています");
      } else {
        setError(signUpError.message);
      }
      setSubmitting(false); // ★ エラー時は解除
      return;
    }

    const user = data.user;
    if (!user) {
      setError("ユーザー登録に失敗しました");
      setSubmitting(false); // ★ これも解除
      return;
    }

    // ★ 既存メールかどうかのチェックはそのまま
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      setError("このメールアドレスはすでに使用されています");
      setSubmitting(false);
      return;
    }

    // ★ ここでは profiles をいじらない（メール認証後の画面でやる）
    // ✅ alert → アプリ内ダイアログ（挙動は同じ：表示してから遷移）
    await appDialog.alert({
      title: "確認メールを送信しました",
      message: "メールのリンクから認証を完了してください。",
    });

    setSubmitting(false);
    navigate("/login");
  };

  return (
    <div className="signup-container">
      <button className="signup-back" onClick={() => navigate("/auth")}>
        ← 戻る
      </button>

      <h1 className="signup-title">アカウント作成</h1>

      <input
        type="text"
        className="signup-input"
        placeholder="名前"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        type="email"
        className="signup-input"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        className="signup-input"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <input
        type="password"
        className="signup-input"
        placeholder="パスワード（確認）"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
      />

      {error && <p className="signup-error">{error}</p>}

      <button className="signup-button" onClick={handleSignup} disabled={submitting}>
        {submitting ? "登録中..." : "登録する"}
      </button>

      <button className="signup-link" onClick={() => navigate("/login")}>
        ログイン画面へ
      </button>
    </div>
  );
}

export default Signup;