// src/pages/Signup.tsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Signup.css";

function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async () => {
    setError("");

    // 入力チェック
    if (!name || !email || !password || !passwordConfirm) {
      setError("すべて入力してください");
      return;
    }
    if (password !== passwordConfirm) {
      setError("パスワードが一致しません");
      return;
    }

    // ① Auth 登録（メール認証あり）
    const { data, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    // トップページに戻す
    emailRedirectTo: `${window.location.origin}`,
  },
});

    // ② エラーの場合
    if (signUpError) {
      console.error("signUpError:", signUpError);

      // メール重複の典型メッセージ（環境によって少し違うこともある）
      const msg = signUpError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        setError("このメールアドレスはすでに使用されています");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // ③ ここからは error は出ていないケース
    const user = data.user;

    if (!user) {
      setError("ユーザー登録に失敗しました");
      return;
    }

    // ⭐ 重要ポイント：
    // user.identities が 0 件 = すでに登録されたメールアドレス
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      setError("このメールアドレスはすでに使用されています");
      return;
    }

    // ④ profiles に名前だけ反映（行自体は handle_new_user で作成済み想定）
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name })
      .eq("id", user.id);

    if (profileError) {
      console.error("profileError:", profileError);
      setError("プロフィール保存中にエラーが発生しました");
      return;
    }

    alert("確認メールを送信しました！メールのリンクから認証を完了してください。");
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

      <button className="signup-button" onClick={handleSignup}>
        登録する
      </button>

      <button className="signup-link" onClick={() => navigate("/login")}>
        ログイン画面へ
      </button>
    </div>
  );
}

export default Signup;