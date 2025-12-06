// src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Home.css";

function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

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

  const handleAccount = () => {
    if (user) {
      navigate("/account");
    } else {
      navigate("/auth");
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

        <button
          className="home-main-btn"
          onClick={() => navigate("/products")}
        >
          商品を見る
        </button>

        <button
          className="home-main-btn"
          onClick={() => navigate("/admin-login")}
        >
          管理者ログイン
        </button>

        {/* ★ 追加：お問い合わせボタン */}
        <button
          className="home-main-btn"
          onClick={() => navigate("/contact")}
        >
          お問い合わせ
        </button>
      </div>
    </div>
  );
}

export default Home;