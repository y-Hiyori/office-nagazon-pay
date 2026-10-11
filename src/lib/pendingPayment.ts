// src/lib/pendingPayment.ts
// PayPay で「購入を確定」したあと、支払わずにアプリへ戻ってきた場合に使う情報の保存・確認・取り消し
export const PENDING_KEY = "nagazonpay_pending_order";

export type PendingPayment = {
  orderId: string;
  token: string;
  merchantPaymentId?: string;
  /** PayPay の支払い画面URL（もう一度支払うときに使う） */
  paypayUrl?: string;
  /** PayPay QR の ID（取り消し時にQRを無効化する） */
  codeId?: string;
  /** PayPay URL の有効期限（UNIX秒） */
  expiryDate?: number | null;
  total?: number;
  createdAt?: number;
};

export type PendingStatus = "paid" | "pending" | "canceled" | "failed" | "unknown";

export function loadPending(): PendingPayment | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !p.orderId || !p.token) return null;
    return p as PendingPayment;
  } catch {
    return null;
  }
}

export function savePending(p: PendingPayment) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ createdAt: Date.now(), ...p }));
  } catch {
    /* ignore */
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** PayPay の支払いURLがまだ使えるか（期限の1分前まで） */
export function canResume(p: PendingPayment | null): boolean {
  if (!p?.paypayUrl) return false;
  const exp = Number(p.expiryDate || 0);
  if (exp > 0) return Date.now() / 1000 < exp - 60;
  // 期限不明の場合は作成から4分以内だけ再開できる扱い
  return Date.now() - Number(p.createdAt || 0) < 4 * 60 * 1000;
}

/** 支払い状況を確認（PayPay側で支払い済みならサーバーで確定まで行われる） */
export async function checkPendingStatus(p: PendingPayment): Promise<PendingStatus> {
  try {
    const r = await fetch("/api/confirm-paypay-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: p.orderId,
        token: p.token,
        merchantPaymentId: p.merchantPaymentId || undefined,
      }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && (j?.paid === true || String(j?.status || "").toLowerCase() === "paid")) return "paid";
    const st = String(j?.status || "").toLowerCase();
    if (st === "canceled") return "canceled";
    if (st === "failed") return "failed";
    if (r.ok) return "pending";
    if (j?.status === "ORDER_NOT_FOUND" || j?.status === "BAD_TOKEN") return "failed";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** 注文を取り消す（PayPay側で支払い済みだった場合は "paid" が返る） */
export async function cancelPending(p: PendingPayment): Promise<PendingStatus> {
  try {
    const r = await fetch("/api/cancel-paypay-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: p.orderId, token: p.token, codeId: p.codeId || undefined }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) return "unknown";
    const st = String(j.status || "").toLowerCase();
    if (st === "paid") return "paid";
    if (st === "canceled" || st === "failed") return "canceled";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function completeUrl(p: PendingPayment) {
  return `/purchase-complete/${p.orderId}?orderId=${encodeURIComponent(p.orderId)}&token=${encodeURIComponent(
    p.token
  )}&paid=1`;
}
