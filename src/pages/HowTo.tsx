// src/pages/HowTo.tsx
import "./HowTo.css";

// ★ 共通ヘッダー/フッター
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

// ★ チュートリアル画像
import buyTutorial from "../data/チュートリアル画像/購入チュートリアル.png";
import accountTutorial from "../data/チュートリアル画像/アカウントチュートリアル.png";

function HowTo() {
  return (
    <div className="howto-page-wrap">
      <SiteHeader />

      <main className="howto-page">
        <div className="howto-head">
          <h2 className="howto-title">アプリの使い方</h2>
        </div>

        <div className="howto-content">
          {/* ① アカウントの使い方 */}
          <section className="howto-section">
            <h3 className="howto-section-title">
              アカウント作成・アカウント画面
            </h3>
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
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default HowTo;