// src/pages/HowTo.tsx
import { Link } from "react-router-dom";
import "./HowTo.css";

import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

import homeImg from "../data/使い方画像/home.jpg";
import signupImg from "../data/使い方画像/signup.jpg";
import loginImg from "../data/使い方画像/login.jpg";
import productsImg from "../data/使い方画像/products.jpg";
import productDetailImg from "../data/使い方画像/product_detail.jpg";
import addToCartImg from "../data/使い方画像/add_to_cart_dialog.jpg";
import cartImg from "../data/使い方画像/cart.jpg";
import checkoutImg from "../data/使い方画像/checkout.jpg";
import pendingImg from "../data/使い方画像/pending_notice.jpg";
import paypayUnpaidImg from "../data/使い方画像/paypay_unpaid.jpg";
import completeImg from "../data/使い方画像/purchase_complete.jpg";
import accountImg from "../data/使い方画像/account.jpg";
import pointsHistoryImg from "../data/使い方画像/points_history.jpg";
import ordersImg from "../data/使い方画像/orders.jpg";
import orderDetailImg from "../data/使い方画像/order_detail.jpg";
import contactImg from "../data/使い方画像/contact.jpg";

type ShotProps = {
  src: string;
  alt: string;
  caption: string;
};

function Shot({ src, alt, caption }: ShotProps) {
  return (
    <figure className="howto-shot">
      <img src={src} alt={alt} className="howto-shot-img" />
      <figcaption className="howto-shot-cap">{caption}</figcaption>
    </figure>
  );
}

function HowTo() {
  return (
    <div className="howto-page-wrap">
      <SiteHeader />

      <main className="howto-page">
        <div className="howto-head">
          <h2 className="howto-title">アプリの使い方</h2>
          <p className="howto-lead">
            NAGAZON PAY は、スマホから商品を選んで PayPay
            でお支払いできる購入アプリです。会員登録をするとポイントがたまり、
            次回のお買い物で使えます。実際の画面を見ながら、順番に使い方を確認できます。
          </p>
        </div>

        <nav className="howto-toc" aria-label="目次">
          <Link className="howto-toc-link" to="/signup">
            会員登録
          </Link>
          <Link className="howto-toc-link" to="/products">
            商品を探す
          </Link>
          <Link className="howto-toc-link" to="/cart">
            カート
          </Link>
          <Link className="howto-toc-link" to="/orders">
            購入履歴
          </Link>
          <Link className="howto-toc-link" to="/contact">
            お問い合わせ
          </Link>
        </nav>

        <div className="howto-content">
          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">0</span>
              <h3 className="howto-section-title">はじめに（ホーム画面）</h3>
            </div>
            <p className="howto-section-desc">
              アプリを開くと、このホーム画面が表示されます。
            </p>
            <ol className="howto-steps">
              <li>左上の三本線がメニューです（商品一覧・購入履歴など）。</li>
              <li>右上のカートアイコンでカート、人型アイコンでアカウントを開きます。</li>
              <li>「商品一覧へ」「アプリの使い方」「購入履歴」などのボタンからも移動できます。</li>
            </ol>
            <Shot src={homeImg} alt="ホーム画面" caption="ホーム画面。メニュー・カート・アカウントの場所" />
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">1</span>
              <h3 className="howto-section-title">会員登録・ログイン</h3>
            </div>
            <p className="howto-section-desc">
              ログインしなくても購入できますが、会員になるとポイントがたまり、
              会員価格やポイント利用ができます。
            </p>
            <ol className="howto-steps">
              <li>右上の人型アイコンをタップして「アカウント」画面を開きます。</li>
              <li>はじめての方は「新規アカウント作成」を選びます。</li>
              <li>名前・メールアドレス・パスワード（6文字以上）を入力して「登録する」を押します。</li>
              <li>確認メールが届くので、メール内のリンクをタップして認証を完了します。</li>
              <li>2回目以降は「ログイン」からメールアドレスとパスワードを入力します。</li>
            </ol>
            <Shot src={signupImg} alt="アカウント作成画面" caption="新規アカウント作成画面。4項目を入力して「登録する」" />
            <Shot src={loginImg} alt="ログイン画面" caption="ログイン画面。メールアドレスとパスワードを入力" />
            <div className="howto-note">
              <span className="howto-note-title">ポイント</span>
              パスワードを忘れたときは、ログイン画面の「パスワードをお忘れの方」から
              再設定できます。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">2</span>
              <h3 className="howto-section-title">商品を探す</h3>
            </div>
            <p className="howto-section-desc">
              メニューの「商品一覧」またはホームの「商品一覧へ」から商品を探します。
            </p>
            <ol className="howto-steps">
              <li>上部の「商品名で検索」に文字を入れると、その名前の商品だけを表示します。</li>
              <li>
                商品カードのバッジで状態が分かります。「NEW」は新着、「SALE」はセール中、
                「発送」は配送で届く商品です。
              </li>
              <li>ログイン中に会員価格がある商品は「会員」タグと会員価格が表示されます。</li>
            </ol>
            <Shot src={productsImg} alt="商品一覧画面" caption="商品一覧。検索と SALE / NEW / 発送 バッジ" />
            <div className="howto-note">
              <span className="howto-note-title">ポイント</span>
              在庫がある商品ほど上に、新着順で並びます。売り切れた商品は「SOLD OUT」
              となり、購入できません。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">3</span>
              <h3 className="howto-section-title">商品の詳細を見る</h3>
            </div>
            <p className="howto-section-desc">商品をタップすると、写真・価格・説明が見られます。</p>
            <ol className="howto-steps">
              <li>「数量」の「−」「＋」で買う個数を変えられます（在庫数と購入上限まで）。</li>
              <li>セール中は通常価格・セール価格・割引額が表示されます。</li>
              <li>会員は「購入すると ＋〇pt」で、購入後にたまるポイントを確認できます。</li>
              <li>発送商品は「発送目安」が表示されます。</li>
              <li>下の「購入」でそのまま購入手続きへ、「カート」でカートに入れます。</li>
            </ol>
            <Shot src={productDetailImg} alt="商品詳細画面" caption="商品詳細。価格・ポイント・数量・購入／カート" />
            <Shot src={addToCartImg} alt="カート追加の完了メッセージ" caption="「カート」を押すと追加完了のメッセージが出ます" />
            <div className="howto-note">
              <span className="howto-note-title">注意</span>
              「発送」の商品と「その場受け取り」の商品は、同時に購入できません。
              カートに入れるときに確認メッセージが出ます。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">4</span>
              <h3 className="howto-section-title">カート</h3>
            </div>
            <p className="howto-section-desc">右上のカートアイコンから、入れた商品を確認できます。</p>
            <ol className="howto-steps">
              <li>「−」「＋」で数量を変えられます。</li>
              <li>いらない商品はゴミ箱アイコンで削除できます。</li>
              <li>「合計」を確認して「購入へ進む」を押すと、在庫を確認して購入手続きへ進みます。</li>
            </ol>
            <Shot src={cartImg} alt="カート画面" caption="カート。数量の変更・削除・「購入へ進む」" />
            <div className="howto-note">
              <span className="howto-note-title">注意</span>
              在庫が足りないときは「購入できない商品があります」と表示されます。数量を
              調整してください。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">5</span>
              <h3 className="howto-section-title">購入手続き（チェックアウト）</h3>
            </div>
            <p className="howto-section-desc">
              注文者情報と支払い方法を入力して購入を確定します。ゲスト購入も可能です。
            </p>
            <ol className="howto-steps">
              <li>
                「注文者情報」の「修正」を押し、氏名・メールアドレスを入力します。
                発送商品がある場合は、郵便番号・住所・電話番号も必要です。入力後は
                「保存」を押します。
              </li>
              <li>クーポンコードがあれば「クーポンコードを入力」に入れて「適用」を押します。</li>
              <li>
                ログイン中はポイントを使えます。「使用ポイント」を入力するか「最大」で
                全額を使えます（1pt = 1円）。
              </li>
              <li>「支払い方法」で「PayPay」を選びます。</li>
              <li>「購入を確定する」を押します。</li>
            </ol>
            <Shot src={checkoutImg} alt="購入手続き画面" caption="購入手続き。注文者情報・クーポン・ポイント・PayPay・お支払い明細" />
            <div className="howto-note">
              <span className="howto-note-title">ポイント</span>
              ログイン中は前回の情報が自動で入ります。ゲスト購入ではポイントは使えません。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">6</span>
              <h3 className="howto-section-title">お支払い（PayPay）</h3>
            </div>
            <p className="howto-section-desc">購入を確定するとPayPayの画面に移動します。</p>
            <ol className="howto-steps">
              <li>PayPayアプリで支払いを完了します。</li>
              <li>支払い後、アプリに戻ると購入完了になります。</li>
              <li>
                支払わずに戻ったときは下の案内が出ます。「PayPayで支払いを続ける」で
                再開、「支払った場合はこちら（再確認）」で確認、「この注文を取り消す」で
                取り消せます。
              </li>
            </ol>
            <Shot src={pendingImg} alt="未払いの案内" caption="支払わずに戻ったときの案内（再開・再確認・取り消し）" />
            <Shot src={paypayUnpaidImg} alt="未払いのページ" caption="未払いの専用画面。再開・再確認・取り消しができます" />
            <div className="howto-note">
              <span className="howto-note-title">安心</span>
              支払いを完了しない限り、代金は請求されません。未払いの注文はあとから
              取り消せます。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">7</span>
              <h3 className="howto-section-title">購入完了</h3>
            </div>
            <ol className="howto-steps">
              <li>「ご購入ありがとうございます！」と注文番号が表示されます。</li>
              <li>
                発送商品は、発送され次第メールでお知らせします。その場受け取りの場合は
                「商品をお取りください。」と表示されます。
              </li>
              <li>ポイントがたまった場合は「＋〇pt 獲得！」と表示されます。</li>
            </ol>
            <Shot src={completeImg} alt="購入完了画面" caption="購入完了。発送の案内と獲得ポイントを表示" />
            <div className="howto-note">
              <span className="howto-note-title">ポイント</span>
              「確認中」と表示されたら、画面を閉じずに待つか「支払いを再確認」を
              押してください。
            </div>
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">8</span>
              <h3 className="howto-section-title">ポイントについて</h3>
            </div>
            <div className="howto-table">
              <div className="howto-table-row">
                <div className="howto-table-label">たまる</div>
                <div className="howto-table-value">
                  購入すると、商品ごとのポイントがアカウントに付与されます。
                </div>
              </div>
              <div className="howto-table-row">
                <div className="howto-table-label">使う</div>
                <div className="howto-table-value">
                  購入手続きで 1pt = 1円 として使えます（ログイン時のみ）。
                </div>
              </div>
              <div className="howto-table-row">
                <div className="howto-table-label">確認</div>
                <div className="howto-table-value">
                  アカウント画面の「ポイント」から残高と「履歴を見る」で確認できます。
                </div>
              </div>
              <div className="howto-table-row">
                <div className="howto-table-label">有効期限</div>
                <div className="howto-table-value">
                  付与から1年（365日）で、使わなかったポイントは自動で失効します。
                </div>
              </div>
            </div>
            <Shot src={accountImg} alt="アカウント画面" caption="アカウント画面。保有ポイント・購入履歴・アカウント編集" />
            <Shot src={pointsHistoryImg} alt="ポイント履歴" caption="「履歴を見る」で獲得・使用・失効の履歴を確認" />
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">9</span>
              <h3 className="howto-section-title">購入履歴</h3>
            </div>
            <ol className="howto-steps">
              <li>メニューの「購入履歴」から、これまでの注文を確認できます。</li>
              <li>カードの「詳細を見る」で配送状況や金額の内訳が見られます。</li>
            </ol>
            <Shot src={ordersImg} alt="購入履歴一覧" caption="購入履歴。日時・購入商品・金額の内訳" />
            <Shot src={orderDetailImg} alt="注文詳細" caption="注文詳細。配送状況と購入した商品" />
          </section>

          <section className="howto-section">
            <div className="howto-section-head">
              <span className="howto-section-num">10</span>
              <h3 className="howto-section-title">お知らせ・お問い合わせ</h3>
            </div>
            <ol className="howto-steps">
              <li>ホームの「お知らせ」から、新しい情報を確認できます。タップすると詳細が開きます。</li>
              <li>困ったときは「お問い合わせ」から送信できます。注文IDを入れるとスムーズです。</li>
            </ol>
            <Shot src={contactImg} alt="お問い合わせ画面" caption="お問い合わせ。注文IDがあると早く対応できます" />
            <div className="howto-actions">
              <Link className="howto-action-link" to="/contact">
                お問い合わせへ
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default HowTo;
