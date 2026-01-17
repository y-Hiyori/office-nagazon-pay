import { Link } from "react-router-dom";
import "./SiteFooter.css";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-cols">
          <div className="site-footer-col">
            <div className="site-footer-head">ご利用について</div>
            <Link className="site-footer-link" to="/how-to">アプリの使い方</Link>
            <Link className="site-footer-link" to="/contact">お問い合わせ</Link>
            <Link className="site-footer-link" to="/tokushoho">特定商取引法に基づく表記</Link>
            <Link className="site-footer-link" to="/privacy">プライバシーポリシー</Link>
            <Link className="site-footer-link" to="/terms">利用規約</Link>
          </div>

          <div className="site-footer-col">
            <div className="site-footer-head">商品</div>
            <Link className="site-footer-link" to="/products">商品一覧</Link>
            <Link className="site-footer-link" to="/cart">カート</Link>
            <Link className="site-footer-link" to="/orders">購入履歴</Link>
          </div>

          <div className="site-footer-col">
            <div className="site-footer-head">アカウント</div>
            <Link className="site-footer-link" to="/account">アカウント</Link>
            {/* ❌ 登録情報の変更 は削除 */}
            {/* ❌ ログイン は削除 */}
          </div>

          <div className="site-footer-col">
            <div className="site-footer-head">ポリシー</div>

            <a
              className="site-footer-link"
              href="https://nagazon2022.jimdosite.com/"
              target="_blank"
              rel="noreferrer"
            >
              公式サイト
            </a>

            <a
              className="site-footer-link"
              href="https://www.instagram.com/nagazon_1"
              target="_blank"
              rel="noreferrer"
            >
              Instagram
            </a>
          </div>
        </div>

        <div className="site-footer-bottom">
          <div className="site-footer-bottom-links">
            <Link to="/tokushoho">特定商取引法に基づく表記</Link>
            <span className="site-footer-dot">•</span>

            <Link to="/privacy">プライバシーポリシー</Link>
            <span className="site-footer-dot">•</span>

            <Link to="/terms">利用規約</Link>
            <span className="site-footer-dot">•</span>

            <Link to="/contact">お問い合わせ</Link>
          </div>

          <div className="site-footer-copy">© 株式会社NAGAZON</div>
        </div>
      </div>
    </footer>
  );
}