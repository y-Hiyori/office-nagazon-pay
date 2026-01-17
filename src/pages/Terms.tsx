import { useNavigate } from "react-router-dom";
import "./Terms.css";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="terms-page">
      {/* 上固定ヘッダー（PrivacyPolicyと同じ系） */}
      <header className="terms-header">
        <button
          className="terms-back-btn"
          onClick={() => navigate(-1)}
          type="button"
          aria-label="戻る"
        >
          ←
        </button>
        <h2 className="terms-header-title">利用規約</h2>
      </header>

      <div className="terms-content">
        <div className="terms-card terms-simple">
          <div className="terms-lead">
            本規約は、株式会社NAGAZONが提供するECサービス「NAGAZON PAY」の利用条件を定めるものです。
            利用者は、本規約に同意のうえ本サービスを利用します。
          </div>

          {/* 第1条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第1条（目的）</h3>
            <div className="terms-item-body">
              本利用規約（以下「本規約」といいます。）は、株式会社NAGAZON（以下「当社」といいます。）が提供するECサービス「NAGAZON PAY」（以下「本サービス」といいます。）の利用条件を定めるものです。利用者は、本規約に同意のうえ本サービスを利用します。
            </div>
          </section>

          {/* 第2条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第2条（定義）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>「利用者」とは、本サービスを閲覧・利用するすべての者をいいます。</li>
                <li>「会員」とは、当社所定の方法でアカウント登録を行った者をいいます。</li>
                <li>「商品」とは、本サービス上で販売する物品またはデジタルコンテンツ等をいいます。</li>
                <li>「注文」とは、会員が本サービス上で購入申込みを行い、当社が受領した取引をいいます。</li>
                <li>「決済事業者」とは、PayPay等、当社が指定する決済手段の提供者をいいます。</li>
              </ol>
            </div>
          </section>

          {/* 第3条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第3条（規約の適用・変更）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>本規約は、本サービスの利用に関し、当社と利用者との間に適用されます。</li>
                <li>当社は、法令に反しない範囲で、本規約を変更することがあります。重要な変更を行う場合、当社は本サービス上で周知します。</li>
                <li>変更後に利用者が本サービスを利用した場合、変更後の規約に同意したものとみなします。</li>
              </ol>
            </div>
          </section>

          {/* 第4条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第4条（アカウント登録）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>本サービスの全部または一部の利用には会員登録が必要となる場合があります。</li>
                <li>会員は、登録情報を真実かつ正確に入力し、最新の状態に保つものとします。</li>
                <li>当社は、虚偽の登録、反社会的勢力との関係、その他当社が不適切と判断した場合、登録を拒否または取消すことがあります。</li>
                <li>未成年の利用者は、保護者等の法定代理人の同意を得たうえで本サービスを利用するものとします。</li>
              </ol>
            </div>
          </section>

          {/* 第5条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第5条（ID・パスワードの管理）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>会員は、ID・パスワードを自己の責任で管理し、第三者に譲渡・貸与・開示してはなりません。</li>
                <li>ID・パスワードの管理不十分等により生じた損害について、当社に故意または重過失がある場合を除き、当社は責任を負いません。</li>
              </ol>
            </div>
          </section>

          {/* 第6条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第6条（商品の購入・契約成立）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>会員が注文手続きを完了した時点で購入申込みが行われます。</li>
                <li>決済事業者による決済完了が確認できた時点、または当社が別途定める時点で売買契約が成立します。</li>
                <li>在庫切れ、価格表示の明白な誤り、不正注文が疑われる場合等、当社は注文を取消すことがあります。</li>
              </ol>
            </div>
          </section>

          {/* 第7条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第7条（価格・送料・手数料）</h3>
            <div className="terms-item-body">
              商品価格、送料、各種手数料は、本サービス上の表示に従います。
            </div>
          </section>

          {/* 第8条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第8条（支払い）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>支払い方法は当社が指定する方法によります。</li>
                <li>決済処理は決済事業者の規約が適用されます。利用者は決済事業者の規約にも同意するものとします。</li>
                <li>決済エラー、通信障害等により決済が完了しない場合、注文が成立しないことがあります。</li>
              </ol>
            </div>
          </section>

          {/* 第9条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第9条（クーポン・ポイント等）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>当社は、割引クーポンやポイント（以下総称して「特典」といいます。）を付与・適用することがあります。</li>
                <li>特典の適用条件（対象商品、期限、併用可否、上限等）は本サービス上の表示に従います。</li>
                <li>不正取得・不正利用が判明した場合、当社は特典の取消、注文の取消、アカウント停止等の措置を行うことがあります。</li>
                <li>特典の換金、譲渡、第三者への売買は禁止します（当社が認めた場合を除く）。</li>
              </ol>
            </div>
          </section>

          {/* 第10条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第10条（配送・引渡し）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>配送方法、配送先、引渡時期は、当社が定め本サービス上に表示します。</li>
                <li>天災、交通事情、配送業者の事情等により遅延する場合があります。</li>
              </ol>
            </div>
          </section>

          {/* 第11条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第11条（返品・交換・キャンセル）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>商品の性質上、または衛生商品・受注生産等、当社が指定する商品は返品・交換できない場合があります。</li>
                <li>初期不良、誤配送等、当社の責に帰すべき事由がある場合、当社所定の方法で対応します。</li>
                <li>利用者都合の返品・交換の可否、送料負担等は本サービス上の表示または当社の案内に従います。</li>
              </ol>
            </div>
          </section>

          {/* 第12条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第12条（禁止事項）</h3>
            <div className="terms-item-body">
              <ul className="terms-list">
                <li>法令または公序良俗に反する行為</li>
                <li>虚偽情報の登録、なりすまし</li>
                <li>不正アクセス、リバースエンジニアリング、サービス妨害</li>
                <li>不正注文、転売目的での大量購入、決済の不正利用</li>
                <li>当社または第三者の権利（著作権・商標権・プライバシー等）侵害</li>
                <li>その他当社が不適切と判断する行為</li>
              </ul>
            </div>
          </section>

          {/* 第13条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第13条（知的財産権）</h3>
            <div className="terms-item-body">
              本サービスに関するコンテンツ、デザイン、ロゴ、プログラム等の権利は当社または正当な権利者に帰属し、利用者は当社の許諾なく複製・転載・配布等を行えません。
            </div>
          </section>

          {/* 第14条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第14条（サービスの変更・中断・終了）</h3>
            <div className="terms-item-body">
              当社は、保守、障害、天災等やむを得ない場合、事前通知なく本サービスの全部または一部を中断・停止することがあります。
            </div>
          </section>

          {/* 第15条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第15条（免責）</h3>
            <div className="terms-item-body">
              <ol className="terms-olist">
                <li>当社は、本サービスの完全性・正確性・有用性等について保証しません。</li>
                <li>当社に故意または重過失がある場合を除き、当社は利用者に生じた損害について責任を負いません。</li>
                <li>
                  当社が責任を負う場合でも、当社の責任は、当該注文において利用者が実際に支払った金額を上限とします（法令により制限できない場合を除く）。
                </li>
              </ol>
            </div>
          </section>

          {/* 第16条 */}
          <section className="terms-item">
            <h3 className="terms-item-title">第16条（個人情報の取扱い）</h3>
            <div className="terms-item-body">
              当社は、利用者の個人情報を、当社のプライバシーポリシーに従い取り扱います。
            </div>
          </section>

          {/* 附則 */}
          <section className="terms-item">
            <h3 className="terms-item-title">附則</h3>
            <div className="terms-item-body">
              制定日：2026年01月18日
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}