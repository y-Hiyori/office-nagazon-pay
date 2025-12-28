// src/pages/Home.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./Home.css";

import { HOME_SLIDES } from "../data/homeSlides";
import { supabase } from "../lib/supabase";

type NoticeRow = {
  id: string;
  title: string;
  body?: string | null;
  link_url?: string | null;
  created_at: string;
};

type NewProductRow = {
  id: number;
  name: string;
  created_at: string;
};

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  } catch {
    return "";
  }
};

export default function Home() {
  const navigate = useNavigate();
  const sliderRef = useRef<HTMLDivElement>(null);

  // ✅ 表示ONだけ & 並び順
  const slides = useMemo(() => {
    return HOME_SLIDES
      .filter((s) => s.isVisible !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, []);

  const [index, setIndex] = useState(0);

  // ✅ 自動スクロール（7秒）
  useEffect(() => {
    if (!slides.length) return;
    const timer = window.setInterval(() => {
      const next = (index + 1) % slides.length;
      setIndex(next);
      sliderRef.current?.scrollTo({
        left: sliderRef.current.clientWidth * next,
        behavior: "smooth",
      });
    }, 7000);

    return () => window.clearInterval(timer);
  }, [index, slides.length]);

  // ✅ 手動スクロールでも index 更新（自分でもスクロールOK）
  const onScroll = () => {
    if (!sliderRef.current) return;
    const i = Math.round(
      sliderRef.current.scrollLeft / sliderRef.current.clientWidth
    );
    setIndex(i);
  };

  // ===== お知らせ（Supabase） =====
  const [noticeLoading, setNoticeLoading] = useState(true);
  const [notices, setNotices] = useState<NoticeRow[]>([]);

  // ===== 商品追加情報（productsから新着） =====
  const [newLoading, setNewLoading] = useState(true);
  const [newProducts, setNewProducts] = useState<NewProductRow[]>([]);

  useEffect(() => {
    const load = async () => {
      // お知らせ（最新10件）
      setNoticeLoading(true);
      try {
        const { data, error } = await supabase
          .from("home_notices")
          .select("id,title,body,link_url,created_at")
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          console.error("home_notices load error:", error);
          setNotices([]);
        } else {
          setNotices((data ?? []) as NoticeRow[]);
        }
      } finally {
        setNoticeLoading(false);
      }

      // 商品追加情報（最新10件・表示ONのみ）
      setNewLoading(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id,name,created_at")
          .eq("is_visible", true) // ✅ 非表示商品は除外
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          console.error("products load error:", error);
          setNewProducts([]);
        } else {
          setNewProducts((data ?? []) as NewProductRow[]);
        }
      } finally {
        setNewLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="home-page">
      <SiteHeader />

      <main className="home-main">
        {/* ===== ヒーロー ===== */}
        <section className="hero">
          <div className="hero-slider" ref={sliderRef} onScroll={onScroll}>
            {slides.map((s) => (
              <div className="hero-slide" key={s.id}>
                {/* ✅ homeSlides.ts で import した画像がそのまま出る */}
                <img src={s.image} alt={s.title} />

                <div className="hero-text">
                  <h2>{s.title}</h2>
                  <p>{s.desc}</p>

                  {/* ✅ スライドごとにボタン文字を変えられる */}
                  <button onClick={() => navigate((s.link || "").trim() || "/products")}>
                    {s.buttonText?.trim() || "詳しく見る"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ドット */}
          <div className="hero-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`dot ${i === index ? "active" : ""}`}
                aria-label={`スライド ${i + 1}`}
                onClick={() => {
                  setIndex(i);
                  sliderRef.current?.scrollTo({
                    left: sliderRef.current!.clientWidth * i,
                    behavior: "smooth",
                  });
                }}
              />
            ))}
          </div>
        </section>

        {/* ===== お知らせ / 商品追加情報（最新10件だけ・スクロール無し） ===== */}
        <section className="home-panels">
          {/* お知らせ：押したら詳細へ */}
          <div className="home-panel">
            <div className="home-panel-head">
              <h3 className="home-panel-title">お知らせ</h3>
            </div>

            {noticeLoading ? (
              <div className="home-panel-skel">読み込み中...</div>
            ) : notices.length === 0 ? (
              <div className="home-panel-empty">お知らせはありません</div>
            ) : (
              <div className="home-list">
                {notices.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="home-item clickable"
                    onClick={() => navigate(`/notice/${n.id}`)}
                  >
                    <div className="home-date">{fmtDate(n.created_at)}</div>
                    <div className="home-text">
                      <div className="home-item-title">{n.title || "（無題）"}</div>
                      <div className="home-item-sub">{(n.body || "").trim() || "—"}</div>
                    </div>
                    <div className="home-arrow">›</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 商品追加情報 */}
          <div className="home-panel">
            <div className="home-panel-head">
              <h3 className="home-panel-title">商品追加情報</h3>
            </div>

            {newLoading ? (
              <div className="home-panel-skel">読み込み中...</div>
            ) : newProducts.length === 0 ? (
              <div className="home-panel-empty">新着はありません</div>
            ) : (
              <div className="home-list">
                {newProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="home-item clickable"
                    onClick={() => navigate(`/products/${p.id}`)}
                  >
                    <div className="home-date">{fmtDate(p.created_at)}</div>
                    <div className="home-text">
                      <div className="home-item-title">
                        {p.name || "（商品名なし）"} 発売開始！
                      </div>
                      <div className="home-item-sub">タップして商品ページへ</div>
                    </div>
                    <div className="home-arrow">›</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}