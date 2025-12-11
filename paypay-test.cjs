'use strict';

const PAYPAY = require('@paypayopa/paypayopa-sdk-node');

PAYPAY.Configure({
  // 🔑 ここに「Sandbox」の API キー・シークレット・マーチャントIDを入れる
  clientId: "a_0r3lddc7dW_3M9m",
  clientSecret: "p4eayMallPiiWayuu0+7OJ/78v+VpbHmIj388r2v9L8=",
  merchantId: "990268679139293765",
  productionMode: false, // false = サンドボックス
});

function main() {
  const payload = {
    merchantPaymentId: "nagazon-test-" + Date.now(),
    amount: {
      amount: 100, // テスト金額（100円）
      currency: "JPY",
    },
    codeType: "ORDER_QR",
    orderDescription: "NAGAZON テスト注文",
    isAuthorization: false,
    redirectUrl: "https://paypay.ne.jp/",
    redirectType: "WEB_LINK",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X) " +
      "AppleWebKit/602.1.50 (KHTML, like Gecko) CriOS/56.0.2924.75 " +
      "Mobile/14E5239e Safari/602.1",
  };

  PAYPAY.QRCodeCreate(payload, (response) => {
    console.log("resultInfo:", response.BODY.resultInfo);
    console.log("data:", response.BODY.data);

    // ← ここに決済画面のURLが返ってくるはず
    console.log("payment URL:", response.BODY.data && response.BODY.data.url);
  });
}

main();