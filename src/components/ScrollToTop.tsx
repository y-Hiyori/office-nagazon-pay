// src/components/ScrollToTop.tsx
// ページ遷移のたびにウィンドウを最上部へスクロールする（スクロール位置の引き継ぎを防ぐ）
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
