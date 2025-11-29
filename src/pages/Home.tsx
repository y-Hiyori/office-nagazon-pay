import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Home.css";

function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  // 🔥 ユーザー取得
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  // 🔥 iPhone / Safari 高さバグ対策
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };

    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  // ⭐ アカウントボタンの遷移先を切り替える
  const handleAccount = () => {
    if (user) {
      navigate("/account"); // ← ログイン済み
    } else {
      navigate("/auth"); // ← 未ログイン
    }
  };

  return (
    <div className="home-page">

      {/* 固定ヘッダー */}
      <header className="home-header">
        <h2 className="home-title">ホーム</h2>

        <button className="home-account-btn" onClick={handleAccount}>
          👤
        </button>
      </header>

      {/* ⭐ 中央に配置するブロック */}
      <div className="home-center">
        <img src="/assets/logo.png" alt="Logo" className="home-logo" />

        <button className="home-main-btn" onClick={() => navigate("/products")}>
          商品を見る
        </button>

        <button className="home-main-btn" onClick={() => navigate("/admin-login")}>
          管理者ログイン
        </button>
      </div>

    </div>
  );
}

export default Home;