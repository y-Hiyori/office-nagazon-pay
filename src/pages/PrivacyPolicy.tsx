import { Link, useNavigate } from "react-router-dom";
import "./PrivacyPolicy.css";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-page">
      {/* 上固定ヘッダー（ホーム風） */}
      <header className="privacy-header">
        <button className="privacy-back-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2 className="privacy-header-title">プライバシーポリシー</h2>
      </header>

      <div className="privacy-content">
        <div className="privacy-card privacy-simple">
          <div className="privacy-lead">
            【サービス名：NAGAZON】（以下「当サービス」）は、当サービスの提供にあたり取得するお客様の情報を、適切に取り扱い、保護に努めます。
          </div>

          {/* 1. 事業者情報 */}
          <div className="privacy-item">
            <div className="privacy-item-title">1. 事業者情報</div>
            <div className="privacy-item-body">
              <div>事業者名：株式会社NAGAZON</div>
              <div>運営責任者：魚谷明広</div>
              <div className="privacy-line">
                連絡先：
                <Link to="/contact" className="privacy-link">
                  お問い合わせフォーム
                </Link>
              </div>
              <div>所在地：兵庫県神戸市長田区池田谷町2-5-1</div>
              <div>電話番号：078-631-0616</div>
            </div>
          </div>

          {/* 2. 取得する情報 */}
          <div className="privacy-item">
            <div className="privacy-item-title">2. 取得する情報</div>
            <div className="privacy-item-body">
              <div className="privacy-subtitle">(1) お客様が入力する情報</div>
              <ul className="privacy-list">
                <li>氏名、メールアドレス、電話番号</li>
                <li>配送先住所（商品配送がある場合）</li>
                <li>お問い合わせ内容</li>
              </ul>

              <div className="privacy-subtitle">(2) 購入・取引に関する情報</div>
              <ul className="privacy-list">
                <li>注文内容、購入履歴、配送状況に関する情報</li>
                <li>決済に関する情報（※クレジットカード番号等は当サービスで保持しません）</li>
                <li>決済事業者から通知される取引識別子・決済結果（例：決済ステータス、取引ID等）</li>
              </ul>

              <div className="privacy-subtitle">(3) 自動的に収集される情報</div>
              <ul className="privacy-list">
                <li>IPアドレス、ブラウザ情報、端末情報、アクセス日時、閲覧履歴等のログ</li>
                <li>Cookie等の識別子（利用する場合）</li>
              </ul>
            </div>
          </div>

          {/* 3. 利用目的 */}
          <div className="privacy-item">
            <div className="privacy-item-title">3. 利用目的</div>
            <div className="privacy-item-body">
              <ol className="privacy-olist">
                <li>商品の注文受付、発送、連絡、アフターサポートのため</li>
                <li>アカウント作成、ログイン認証、本人確認、不正利用防止のため</li>
                <li>お問い合わせへの対応、重要なお知らせ等の連絡のため</li>
                <li>代金の請求、決済手続き、取引の確認のため</li>
                <li>サービスの改善、品質向上、利用状況の分析（実施する場合）のため</li>
                <li>利用規約違反への対応、トラブルの防止・解決のため</li>
              </ol>
            </div>
          </div>

          {/* 4. 第三者提供 */}
          <div className="privacy-item">
            <div className="privacy-item-title">4. 第三者提供について</div>
            <div className="privacy-item-body">
              当サービスは、法令に基づく場合を除き、本人の同意なく個人データを第三者に提供しません。<br />
              ただし、次の場合はこの限りではありません。
              <ul className="privacy-list">
                <li>お客様の同意がある場合</li>
                <li>法令に基づき開示が必要な場合</li>
                <li>人の生命・身体・財産の保護のために必要で、同意を得ることが困難な場合</li>
                <li>不正利用・迷惑行為等への対応に必要で、同意を得ることが困難な場合</li>
              </ul>
            </div>
          </div>

          {/* 5. 業務委託 */}
          <div className="privacy-item">
            <div className="privacy-item-title">5. 業務委託（外部サービスの利用）</div>
            <div className="privacy-item-body">
              当サービスは、サービス提供に必要な範囲で、外部事業者に業務を委託することがあります。
              委託先の選定および委託先の管理に努めます。
              <div className="privacy-subtitle">（利用する外部サービスの例）</div>
              <ul className="privacy-list">
                <li>Supabase：認証、データベース、ストレージ（注文/ユーザー情報等の管理）</li>
                <li>PayPay：決済処理</li>
                <li>EmailJS（利用している場合）：注文確認・連絡メール送信</li>
                <li>Vercel（ホスティングしている場合）：Webサイトの配信・運用</li>
              </ul>
              <div className="privacy-note">※実際に使っているものだけ残してください。</div>
            </div>
          </div>

          {/* 6. 安全管理措置 */}
          <div className="privacy-item">
            <div className="privacy-item-title">6. 安全管理措置</div>
            <div className="privacy-item-body">
              当サービスは、個人データへの不正アクセス、漏えい、改ざん等を防止するため、アクセス権限管理、認証、ログ管理等の必要な安全管理措置を講じます。
            </div>
          </div>

          {/* 7. 保管期間 */}
          <div className="privacy-item">
            <div className="privacy-item-title">7. 保管期間</div>
            <div className="privacy-item-body">
              当サービスは、利用目的の達成に必要な期間、または法令上必要な期間、情報を保管します。保管期間経過後は、適切な方法で削除または匿名化します。
            </div>
          </div>

          {/* 8. 開示等 */}
          <div className="privacy-item">
            <div className="privacy-item-title">8. 開示・訂正・削除等の請求</div>
            <div className="privacy-item-body">
              お客様ご本人から、当サービスが保有する個人データの開示、訂正、利用停止、削除等のご希望があった場合、ご本人確認のうえ、合理的な範囲で対応します。
              連絡先は「1. 事業者情報」に記載の窓口とします。
            </div>
          </div>

          {/* 9. Cookie */}
          <div className="privacy-item">
            <div className="privacy-item-title">9. Cookie等の利用（利用する場合）</div>
            <div className="privacy-item-body">
              当サービスは、利便性向上や利用状況分析のため、Cookie等を利用する場合があります。
              Cookieはブラウザ設定により無効化できますが、一部機能が利用できなくなる場合があります。
            </div>
          </div>

          
          
        </div>
      </div>
    </div>
  );
}