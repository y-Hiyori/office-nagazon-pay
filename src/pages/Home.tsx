// src/pages/Home.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Home.css";

import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

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

  return (
    <div className="home-page">
      {/* ✅ 共通ヘッダー */}
      <SiteHeader accountHref={user ? "/account" : "/auth"} />

      <main className="home-center">
        <img src="/assets/logo.png" alt="Logo" className="home-logo" />

        <button className="home-main-btn" onClick={() => navigate("/products")}>
          商品を見る
        </button>

        <button className="home-main-btn" onClick={() => navigate("/how-to")}>
          アプリの使い方
        </button>

        <button className="home-main-btn" onClick={() => navigate("/contact")}>
          お問い合わせ
        </button>
      </main>

      <SiteFooter />
    </div>
  );
}

export default Home;