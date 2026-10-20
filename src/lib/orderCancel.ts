// 注文キャンセル申請の表示条件
// ・発送商品：発送完了までは申請できる
// ・受取商品（発送以外）：注文から2日以内だけ申請できる
export const CANCEL_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

type CancelTarget = {
  status?: string | null;
  created_at?: string | null;
  fulfillment_type?: string | null;
  shipping_status?: string | null;
};

export type CancelEligibility = {
  allowed: boolean;
  reason?: string;
};

export function getCancelEligibility(
  order: CancelTarget | null | undefined,
  nowMs: number = Date.now()
): CancelEligibility {
  if (!order) return { allowed: false, reason: "注文が見つかりません。" };

  if (String(order.status || "").toLowerCase() !== "paid") {
    return { allowed: false, reason: "支払い済みの注文が対象です。" };
  }

  if (order.fulfillment_type === "shipping") {
    if (String(order.shipping_status || "") === "shipped") {
      return { allowed: false, reason: "発送済みのため申請できません。" };
    }
    return { allowed: true };
  }

  const created = order.created_at ? Date.parse(order.created_at) : NaN;
  if (!Number.isFinite(created)) {
    return { allowed: false, reason: "注文日時を確認できません。" };
  }
  if (nowMs - created > CANCEL_WINDOW_MS) {
    return { allowed: false, reason: "キャンセル申請は注文から2日以内です。" };
  }
  return { allowed: true };
}

export function isUnpaidCanceled(order: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  return (
    String(order.status || "").toLowerCase() === "canceled" &&
    !order.paid_at
  );
}
