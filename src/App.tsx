// src/App.tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppDialogHost from "./components/AppDialogHost";
import { resetScrollLocks } from "./lib/scrollLock";

function App() {
  const loc = useLocation();

  // ✅ 万が一どこかでスクロールロック解除漏れが起きても、画面遷移したら強制解除
  // （「アプリ全体がスクロールできない」事故の保険）
  // Drawer/Modal は遷移で基本 unmount されるのでここで解除しても副作用はほぼ無い
  // ※同一画面内での開閉は各コンポーネント側で lock/unlock する
  useEffect(() => {
    resetScrollLocks();
  }, [loc.pathname]);

  return (
    <>
      <main style={{ width: "100%", minHeight: "100vh" }}>
        <Outlet />
      </main>

      {/* ✅ 全ページ共通のアプリ内ダイアログ置き場 */}
      <AppDialogHost />
    </>
  );
}

export default App;