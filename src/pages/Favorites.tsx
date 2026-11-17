// src/pages/Favorites.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Loading from "../components/Loading";
import FavoriteButton from "../components/FavoriteButton";
import { useUser } from "../context/UserContext";
import { useIsMember } from "../lib/useIsMember";
import { memberPriceOf } from "../lib/pricing";
import { fetchSaleLots } from "../lib/lots";
import { supabase } from "../lib/supabase";
import { findProductImage } from "../data/products";
import "./ProductList.css";
import "./Favorites.css";

type Row = {
  id: number;
  name: string;
  price: number;
  stock: number;
  visible: boolean;
  image: string | null;
};

const yen = (n: number) => `¥${Number(n || 0).toLocaleString("ja-JP")}`;

export default function Favorites() {
  const navigate = useNavigate();
  const { userId, ready, favoriteIds, favoritesReady } = useUser();
  const isMember = useIsMember();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // お気に入りを外しても、その場では一覧に残す（誤タップですぐ戻せるように）
  //   追加されたものは一覧に足す。外したものは画面を開き直すまで残す。
  const [shownIds, setShownIds] = useState<number[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    if (!favoritesReady) return;
    setShownIds((prev) => {
      const base = prev ?? [];
      const add = [...favoriteIds].filter((id) => !base.includes(id));
      if (prev && add.length === 0) return prev;
      return [...add, ...base];
    });
  }, [ready, userId, favoriteIds, favoritesReady]);

  useEffect(() => {
    if (shownIds === null) return;
    const load = async () => {
      if (shownIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,stock,is_visible,member_price")
        .in("id", shownIds);
      if (error) console.error("favorites products error:", error);

      let saleMap = new Map<number, { sale_price: number }>();
      try {
        saleMap = await fetchSaleLots();
      } catch {
        // セール情報なしで表示
      }

      const list: Row[] = (data ?? []).map((p: any) => {
        const base = isMember ? memberPriceOf(p) ?? Number(p.price) : Number(p.price);
        const sale = saleMap.get(Number(p.id));
        return {
          id: Number(p.id),
          name: String(p.name ?? ""),
          price: sale ? Math.min(base, sale.sale_price) : base,
          stock: Number(p.stock ?? 0),
          visible: p.is_visible !== false,
          image: findProductImage(Number(p.id)) ?? null,
        };
      });
      // 新しく追加した順（shownIds の並び）
      const order = new Map(shownIds.map((id, i) => [id, i]));
      list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setRows(list);
      setLoading(false);
    };
    load();
  }, [shownIds, isMember]);

  return (
    <div className="plist-page">
      <SiteHeader />
      <main className="plist-container">
        <h2 className="plist-title">お気に入り</h2>

        {!ready || loading ? (
          <Loading />
        ) : !userId ? (
          <div className="fav-empty">
            <div className="fav-empty-title">ログインするとお気に入りを保存できます</div>
            <p className="fav-empty-text">商品の ♡ を押すと、ここにまとめて表示されます。</p>
            <button className="fav-empty-btn" type="button" onClick={() => navigate("/auth")}>
              ログイン・会員登録
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="fav-empty">
            <div className="fav-empty-title">お気に入りはまだありません</div>
            <p className="fav-empty-text">気になる商品の ♡ を押すと、ここにまとめて表示されます。</p>
            <button className="fav-empty-btn" type="button" onClick={() => navigate("/products")}>
              商品を見る
            </button>
          </div>
        ) : (
          <div className="plist-grid">
            {rows.map((p) => {
              const unavailable = !p.visible || p.stock <= 0;
              return (
                <div
                  key={p.id}
                  className={`plist-card ${unavailable ? "sold-out" : ""}`}
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  <div className="plist-media">
                    {p.image ? <img src={p.image} alt={p.name} /> : <div className="plist-noimg">No Image</div>}
                  </div>
                  <FavoriteButton productId={p.id} />
                  {unavailable ? (
                    <div className="sold-label">{p.visible ? "SOLD OUT" : "販売停止中"}</div>
                  ) : null}
                  <div className="plist-name">{p.name}</div>
                  <div className="plist-price-wrap">
                    <div className="plist-price-row">
                      <div className="plist-price">{yen(p.price)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
