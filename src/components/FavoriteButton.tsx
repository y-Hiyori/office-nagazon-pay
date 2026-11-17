// src/components/FavoriteButton.tsx
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { appDialog } from "../lib/appDialog";
import "./FavoriteButton.css";

type Props = {
  productId: number;
  variant?: "overlay" | "inline";
  className?: string;
};

export const IconHeart = ({ filled = false }: { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
  </svg>
);

export default function FavoriteButton({ productId, variant = "overlay", className = "" }: Props) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useUser();
  const on = isFavorite(productId);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = await toggleFavorite(productId);
    if (r === "login") {
      const ok = await appDialog.confirm({
        title: "お気に入りはログインが必要です",
        message: "ログインすると、気になる商品をお気に入りに保存できます。",
        okText: "ログインする",
        cancelText: "あとで",
      });
      if (ok) navigate("/auth");
    } else if (r === "error") {
      await appDialog.alert({ message: "お気に入りを更新できませんでした。時間をおいてお試しください。" });
    }
  };

  return (
    <button
      type="button"
      className={`fav-btn fav-btn--${variant} ${on ? "is-on" : ""} ${className}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "お気に入りから外す" : "お気に入りに追加"}
    >
      <IconHeart filled={on} />
      {variant === "inline" ? <span>{on ? "お気に入り済み" : "お気に入り"}</span> : null}
    </button>
  );
}
