import { Link, useNavigate } from "react-router-dom";
import "./Tokushoho.css";

export default function Tokushoho() {
  const navigate = useNavigate();

  return (
    <div className="tokushoho-page">
      {/* 上固定ヘッダー（ホーム風） */}
      <header className="tokushoho-header">
        <button className="tokushoho-back-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2 className="tokushoho-header-title">特定商取引法に基づく表記</h2>
      </header>

      <div className="tokushoho-content">
        <div className="tokushoho-card tokushoho-simple">
          <div className="tokushoho-item">
            <div className="tokushoho-item-title">販売事業者</div>
            <div className="tokushoho-item-body">株式会社NAGAZON</div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">運営責任者</div>
            <div className="tokushoho-item-body">魚谷明広</div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">所在地</div>
            <div className="tokushoho-item-body">
              兵庫県神戸市長田区池田谷町2-5-1
            </div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">電話番号</div>
            <div className="tokushoho-item-body">078-631-0616</div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">お問い合わせフォーム</div>
            <div className="tokushoho-item-body">
              <Link to="/contact" className="tokushoho-link">
                お問い合わせはこちら
              </Link>
            </div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">販売価格</div>
            <div className="tokushoho-item-body">
              各商品ページに税込価格で記載しています。
            </div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">商品代金以外の必要料金</div>
            <div className="tokushoho-item-body">送料：なし／手数料：なし</div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">お支払い方法</div>
            <div className="tokushoho-item-body">PayPay</div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">お支払い時期</div>
            <div className="tokushoho-item-body">
              ご注文時（決済完了時）にお支払いが確定します。
            </div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">商品のお渡し時期（引渡し時期）</div>
            <div className="tokushoho-item-body">
              決済完了後、店舗にて商品をお渡しします（店舗受け取り）。
            </div>
          </div>

          <div className="tokushoho-item">
            <div className="tokushoho-item-title">不良品・返品・交換（返品特約）</div>
            <div className="tokushoho-item-body">
              お客様都合による返品・交換はお受けできません。<br />
              ただし、商品に欠陥がある場合／当店の誤配送の場合は、店舗での受け取り日を含め7日以内に
              <Link to="/contact" className="tokushoho-link">お問い合わせフォーム</Link>
              よりご連絡ください。内容確認のうえ、交換または返金にて対応いたします。<br />
              ※この場合に発生する費用（必要がある場合）は当店が負担します。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}