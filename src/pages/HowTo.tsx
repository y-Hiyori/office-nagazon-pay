// src/pages/HowTo.tsx
import { useNavigate } from "react-router-dom";
import "./HowTo.css";

// ★ チュートリアル画像を読み込む
import buyTutorial from "../data/チュートリアル画像/購入チュートリアル.png";
import accountTutorial from "../data/チュートリアル画像/アカウントチュートリアル.png";

function HowTo() {
  const navigate = useNavigate();

  return (
    <div className="howto-page">
      {/* ヘッダー */}
      <header className="howto-header">
        <button className="howto-back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2 className="howto-title">アプリの使い方</h2>
      </header>

      <main className="howto-content">
        {/* ① アカウントの使い方 */}
        <section className="howto-section">
          <h3 className="howto-section-title">アカウント作成・アカウント画面</h3>
          <p className="howto-section-desc">
            新規アカウント作成と、アカウント画面の説明です。
          </p>
          <img
            src={accountTutorial}
            alt="アカウントの使い方"
            className="howto-image"
          />
        </section>

        {/* ② 商品購入方法 */}
        <section className="howto-section">
          <h3 className="howto-section-title">商品購入方法</h3>
          <p className="howto-section-desc">
            商品の選択から購入完了までの流れです。
          </p>
          <img
            src={buyTutorial}
            alt="商品購入方法"
            className="howto-image"
          />
        </section>
      </main>
    </div>
  );
}

export default HowTo;