// api/_lib/paypay.js
import PAYPAY from "@paypayopa/paypayopa-sdk-node";

let configured = false;

export function ensurePayPayConfigured(res) {
  const missing = [];
  if (!process.env.PAYPAY_API_KEY) missing.push("PAYPAY_API_KEY");
  if (!process.env.PAYPAY_API_SECRET) missing.push("PAYPAY_API_SECRET");
  if (!process.env.PAYPAY_MERCHANT_ID) missing.push("PAYPAY_MERCHANT_ID");

  if (missing.length) {
    if (res) {
      res.status(500).json({ ok: false, status: "ENV_MISSING", missing });
    }
    return false;
  }

  if (!configured) {
    PAYPAY.Configure({
      clientId: process.env.PAYPAY_API_KEY,
      clientSecret: process.env.PAYPAY_API_SECRET,
      merchantId: process.env.PAYPAY_MERCHANT_ID,
      productionMode: String(process.env.PAYPAY_PRODUCTION_MODE || "false") === "true",
    });
    configured = true;
  }

  return true;
}

function extractPayPayStatus(body) {
  const d = body?.data;
  return d?.status ?? (Array.isArray(d) ? d?.[0]?.status : undefined) ?? "UNKNOWN";
}

async function getCodePaymentDetailsBody(merchantPaymentId) {
  // SDKが callback 形式の環境と promise 形式の環境の両方に耐える
  return await new Promise((resolve, reject) => {
    try {
      const maybe = PAYPAY.GetCodePaymentDetails([merchantPaymentId], (response) => {
        if (!response || !response.BODY) return reject(new Error("NO_BODY"));
        resolve(response.BODY);
      });

      // promise が返ってくる実装もあるので拾う
      if (maybe && typeof maybe.then === "function") {
        maybe
          .then((response) => resolve(response?.BODY))
          .catch((e) => reject(e));
      }
    } catch (e) {
      reject(e);
    }
  });
}

export async function getPayPayStatus(merchantPaymentId) {
  const body = await getCodePaymentDetailsBody(String(merchantPaymentId));

  const resultInfo = body?.resultInfo;
  if (resultInfo && resultInfo.code && resultInfo.code !== "SUCCESS") {
    return { ok: false, status: "PAYPAY_ERROR", resultInfo };
  }

  const paypayStatus = extractPayPayStatus(body);
  return { ok: true, paypayStatus, body };
}