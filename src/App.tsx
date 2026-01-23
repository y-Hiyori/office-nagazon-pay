// src/App.tsx
import { Outlet } from "react-router-dom";
import AppDialogHost from "./components/AppDialogHost";

function App() {
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