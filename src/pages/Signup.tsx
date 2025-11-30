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
  const [passwordConfirm, setPasswordConfirm] = useState(""); // ← 追加
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

    // ① 既に同じメールのプロフィールがないか確認
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      setError("このメールアドレスはすでに使用されています");
      return;
    }

    // ② Auth 登録（メール認証あり）
    const { data: signUpData, error: signUpError } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

    if (signUpError) {
      console.error("signUpError:", signUpError);

      if (
        signUpError.message.includes("already") ||
        signUpError.message.includes("registered")
      ) {
        setError("このメールアドレスはすでに使用されています");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    const userId = signUpData.user?.id;

    if (!userId) {
      setError("ユーザー登録に失敗しました");
      return;
    }

    // ③ profiles にも保存
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      name,
      email,
    });

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