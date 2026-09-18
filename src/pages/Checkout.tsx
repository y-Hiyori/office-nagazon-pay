// src/pages/Checkout.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import "./Checkout.css";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";
import { fetchSaleLots, splitSaleQty, type SaleLot } from "../lib/lots";

type StoredItem = {
  productId: string | number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  isShipping?: boolean;
  // ✅ セール適用の内訳（v26）
  saleQty: number;
  salePrice: number;
  normalQty: number;
  saleMode: "total" | "per_order" | null;
};

// ✅ 予約なし：balance と available だけ
type Wallet = { balance: number; available: number };

// ✅ 注文者情報（ゲスト購入用）
//   発送商品の注文では 郵便番号・住所・建物・電話番号 も必須になる
type GuestInfo = {
  name: string;
  email: string;
  postalCode: string;
  address: string;
  building: string;
  phone: string;
};
type GuestErrors = Partial<Record<keyof GuestInfo, string>>;

const GUEST_INFO_KEY = "nagazon_guest_info_v1";
const isEmailLike = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function loadGuestInfo(): GuestInfo {
  try {
    const raw = localStorage.getItem(GUEST_INFO_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        name: String(p?.name ?? ""),
        email: String(p?.email ?? ""),
        postalCode: String(p?.postalCode ?? ""),
        address: String(p?.address ?? ""),
        building: String(p?.building ?? ""),
        phone: String(p?.phone ?? ""),
      };
    }
  } catch {}
  return { name: "", email: "", postalCode: "", address: "", building: "", phone: "" };
}

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [method, setMethod] = useState<"paypay" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);

  // ✅ 在庫再確認中フラグ
  const [isCheckingStock, setIsCheckingStock] = useState(false);

  // ✅ NAGAZON PAY ID（Supabase設定でON/OFF）
  const [storeAuthRequired, setStoreAuthRequired] = useState<boolean>(true);
  const [storeAuthLoading, setStoreAuthLoading] = useState<boolean>(true);

  const [showStoreAuth, setShowStoreAuth] = useState(false);
  const [storeCode, setStoreCode] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [discountYen, setDiscountYen] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>("");

  // ✅ ポイント（最初から表示）
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsMsg, setPointsMsg] = useState("");

  // ✅ 注文者情報（ログイン中は自動入力・ゲストは保存値）
  const [guestInfo, setGuestInfo] = useState<GuestInfo>(loadGuestInfo());
  const [guestErrors, setGuestErrors] = useState<GuestErrors>({});
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);

  // ✅ 注文者情報の表示モード: "view"（確認表示）⇔ "edit"（入力画面を開く）
  //    参考サイト（shop_payment）と同じく、最初から入力画面は出さない
  const [infoMode, setInfoMode] = useState<"view" | "edit">("view");

  const formatPrice = (value: number | string) => Number(value || 0).toLocaleString("ja-JP");

  const state =
    (location.state as { buyNow?: { product: any; quantity: number } } | undefined) ?? undefined;
  const buyNow = state?.buyNow;

  const items = buyNow
    ? [{ id: buyNow.product.id, product: buyNow.product, quantity: buyNow.quantity }]
    : cart.cart;

  // ✅ セール（商品単位・2パターン）を取得
  const [saleMap, setSaleMap] = useState<Map<number, SaleLot>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchSaleLots();
        if (!cancelled) setSaleMap(m);
      } catch {
        if (!cancelled) setSaleMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ 商品ごとのセール適用内訳（セール価格×個数 ＋ 通常価格×超過分）
  const pricedItems = useMemo(() => {
    return (items as any[]).map((it) => {
      const id = Number(it?.product?.id);
      const qty = Math.max(0, Math.floor(Number(it?.quantity) || 0));
      // セール価格が product.price に入っていても壊れないよう normalPrice を優先
      const normal = Math.max(
        0,
        Math.floor(Number((it?.product as any)?.normalPrice ?? it?.product?.price) || 0)
      );
      const s = Number.isFinite(id) ? saleMap.get(id) ?? null : null;
      const { saleQty, normalQty } = splitSaleQty(qty, s);
      const salePrice = s ? Math.max(0, Math.floor(s.sale_price)) : 0;
      return {
        item: it,
        id,
        qty,
        normal,
        sale: s,
        saleQty,
        normalQty,
        salePrice,
        lineTotal: saleQty * salePrice + normalQty * normal,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, saleMap]);

  const cartSubtotal = buyNow
    ? (Number(buyNow.product.price) || 0) * buyNow.quantity
    : cart.getTotalPrice();
  const pricedSubtotal = pricedItems.reduce((sum, x) => sum + x.lineTotal, 0);
  const hasAnySale = pricedItems.some((x) => x.saleQty > 0);
  const subtotal = hasAnySale ? pricedSubtotal : cartSubtotal;

  // ✅ 受渡方法：商品に1つでも発送商品が含まれれば「発送」
  const fulfillmentType: "shipping" | "pickup" = (items as any[]).some(
    (it) => it?.product?.is_shipping
  )
    ? "shipping"
    : "pickup";
  const needsShipping = fulfillmentType === "shipping";

  // ✅ 発送商品とその場受け取り商品の混在はここでも抑止（保険）
  const hasMixedFulfillment = useMemo(() => {
    const types = new Set(
      (items as any[]).map((it) => (it?.product?.is_shipping ? "shipping" : "pickup"))
    );
    return types.size > 1;
  }, [items]);

  // ✅ ポイント上限（クーポン後の残額・保有ptの小さい方）
  const pointsMax = useMemo(() => {
    const maxUsable = Math.max(subtotal - discountYen, 0);
    const available = Number(wallet?.available ?? 0);
    return Math.max(Math.min(available, maxUsable), 0);
  }, [wallet?.available, subtotal, discountYen]);

  // ✅ ポイント割引（常に丸め）
  const pointsDiscountYen = useMemo(() => {
    const p = Math.max(Math.floor(pointsToUse || 0), 0);
    return Math.min(p, pointsMax);
  }, [pointsToUse, pointsMax]);

  const payableTotal = useMemo(
    () => Math.max(subtotal - discountYen - pointsDiscountYen, 0),
    [subtotal, discountYen, pointsDiscountYen]
  );

  // ✅ 設定取得（NAGAZON PAY IDのON/OFF）
  // 推奨RPC:
  //   public.store_auth_is_required() returns boolean
  //   public.store_auth_verify(p_code text) returns boolean
  useEffect(() => {
    (async () => {
      setStoreAuthLoading(true);
      try {
        const { data, error } = await supabase.rpc("store_auth_is_required");
        if (error) {
          console.error("store_auth_is_required error:", error);
          setStoreAuthRequired(true); // 取れない時は安全側(ON)に倒す
        } else {
          setStoreAuthRequired(Boolean(data));
        }
      } catch (e) {
        console.error(e);
        setStoreAuthRequired(true);
      } finally {
        setStoreAuthLoading(false);
      }
    })();
  }, []);

  // ✅ ログインチェック + ポイント取得 + 注文者情報の自動入力
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthUser(user as { id: string; email?: string } | null);

      if (!user) {
        // ✅ ゲスト：端末に保存済みの入力値を復元（あれば）
        const saved = loadGuestInfo();
        setGuestInfo((prev) => ({
          ...prev,
          name: prev.name || saved.name,
          email: prev.email || saved.email,
        }));
        setWallet(null);
        return;
      }

      // ✅ アカウント登録済み：プロフィールから取得して反映（自動入力）
      //    ※ プロフィールの値を正として反映（修正後の値を勝手に潰さない）
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", user.id)
        .maybeSingle();
      const autoName = profile?.name || user.user_metadata?.full_name || user.user_metadata?.name || "";
      const autoEmail = profile?.email || user.email || "";
      setGuestInfo((prev) => ({
        ...prev,
        name: prev.name || autoName || "",
        email: prev.email || autoEmail || "",
      }));

      const { data: w, error: wErr } = await supabase.rpc("points_get_my_wallet");
      if (wErr) {
        console.error("points_get_my_wallet error:", wErr);
        setWallet({ balance: 0, available: 0 });
        return;
      }

      const row = Array.isArray(w) ? w?.[0] : (w as any);
      const balance = Number(row?.balance ?? 0);
      const available = Number(row?.available ?? balance);
      setWallet({ balance, available });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ✅ 入力値を上限で強制丸め
  const setPointsClamped = (raw: number) => {
    const v = Math.max(Math.floor(raw || 0), 0);
    const clamped = Math.min(v, pointsMax);
    setPointsToUse(clamped);

    if (clamped <= 0) setPointsMsg("");
    else setPointsMsg(`ポイント適用：-${formatPrice(clamped)}円`);
  };

  // クーポン適用
  // ✅ v33：対象者・1人上限・対象商品に対応したクーポン判定
  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    setCouponMsg("");

    if (!code) {
      clearCoupon();
      setCouponMsg("クーポンコードを入力してください。");
      return;
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("coupons")
      .select(
        "code, discount_type, discount_value, max_discount_yen, min_subtotal, is_active, starts_at, ends_at, usage_limit, used_count, audience, per_user_limit, target_scope"
      )
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("coupon load error:", error);
      clearCoupon();
      setCouponMsg("クーポン確認に失敗しました。");
      return;
    }

    if (!data || !data.is_active) {
      clearCoupon();
      setCouponMsg("このクーポンは使えません。");
      return;
    }

    if (data.starts_at && nowIso < data.starts_at) {
      clearCoupon();
      setCouponMsg("このクーポンはまだ使えません（開始前）。");
      return;
    }
    if (data.ends_at && nowIso > data.ends_at) {
      clearCoupon();
      setCouponMsg("このクーポンは期限切れです。");
      return;
    }

    // ✅ 対象者（全員／会員のみ／ゲストのみ）
    const aud = String((data as any).audience ?? "all");
    const isGuest = !authUser;
    if (aud === "member" && isGuest) {
      clearCoupon();
      setCouponMsg("このクーポンは会員（アカウント登録済み）専用です。");
      return;
    }
    if (aud === "guest" && !isGuest) {
      clearCoupon();
      setCouponMsg("このクーポンはゲスト購入専用です。");
      return;
    }

    if (data.usage_limit != null && (data.used_count ?? 0) >= data.usage_limit) {
      clearCoupon();
      setCouponMsg("このクーポンは上限回数に達しました。");
      return;
    }

    // ✅ 1人あたりの使用回数上限
    const perUser = (data as any).per_user_limit;
    if (perUser != null && Number(perUser) > 0) {
      const mail = (authUser?.email ?? guestInfo.email ?? "").trim();
      const { data: usedCnt } = await supabase.rpc("coupon_usage_count", {
        p_code: code,
        p_email: mail,
      });
      if (Number(usedCnt ?? 0) >= Number(perUser)) {
        clearCoupon();
        setCouponMsg("このクーポンは、あなたはすでに使用回数の上限に達しています。");
        return;
      }
    }

    // ✅ 対象商品が決まっている場合は、その商品の小計にだけ適用する
    let base = subtotal;
    if (String((data as any).target_scope ?? "all") === "products") {
      const { data: tgt, error: tErr } = await supabase
        .from("coupon_products")
        .select("product_id")
        .eq("code", code);
      if (tErr) {
        console.error("coupon_products error:", tErr);
        clearCoupon();
        setCouponMsg("クーポン確認に失敗しました。");
        return;
      }
      const ids = new Set((tgt ?? []).map((t: any) => Number(t.product_id)));
      base = pricedItems
        .filter((x) => ids.has(Number(x.id)))
        .reduce((sum, x) => sum + x.lineTotal, 0);
      if (base <= 0) {
        clearCoupon();
        setCouponMsg("このクーポンの対象商品がカートにありません。");
        return;
      }
    }

    if (data.min_subtotal != null && base < data.min_subtotal) {
      clearCoupon();
      setCouponMsg(
        `対象商品の小計が${formatPrice(data.min_subtotal)}円以上で使えます。`
      );
      return;
    }

    let discount = 0;
    const v = Number(data.discount_value ?? 0);
    if ((data.discount_type ?? "yen") === "percent") discount = Math.floor((base * v) / 100);
    else discount = v;

    if (data.max_discount_yen != null) discount = Math.min(discount, Number(data.max_discount_yen));
    discount = Math.min(discount, base);

    if (discount <= 0) {
      clearCoupon();
      setCouponMsg("このクーポンは使えません。");
      return;
    }

    setDiscountYen(discount);
    setAppliedCoupon(data.code);
    setCouponMsg(
      `クーポン適用：-${formatPrice(discount)}円` +
        (String((data as any).target_scope ?? "all") === "products" ? "（対象商品のみ）" : "")
    );

    setTimeout(() => setPointsClamped(pointsToUse), 0);
  };

  const clearCoupon = () => {
    setCouponCode("");
    setDiscountYen(0);
    setAppliedCoupon(null);
    setCouponMsg("");
  };

  // ✅ 在庫再チェック
  const recheckStockBeforeConfirm = async () => {
    const ids = Array.from(
      new Set(items.map((it: any) => Number(it?.product?.id)).filter((v) => Number.isFinite(v)))
    ) as number[];

    if (ids.length === 0) return { ok: false as const, ngNames: ["（商品不明）"] };

    const { data, error } = await supabase
      .from("products")
      .select("id,name,stock,is_visible,max_per_order")
      .in("id", ids);

    if (error) {
      console.error("stock recheck error:", error);
      throw error;
    }

    const map = new Map<
      number,
      { name: string; stock: number; is_visible: boolean; max_per_order: number }
    >();
    (data ?? []).forEach((p: any) => {
      map.set(Number(p.id), {
        name: String(p.name ?? ""),
        stock: Number(p.stock ?? 0),
        is_visible: p.is_visible !== false,
        max_per_order: Math.max(0, Math.floor(Number((p as any).max_per_order ?? 0)) || 0),
      });
    });

    const ngNames: string[] = [];
    for (const it of items as any[]) {
      const pid = Number(it?.product?.id);
      const row = map.get(pid);

      const name = String(it?.product?.name ?? row?.name ?? "（商品名不明）");
      const qty = Number(it?.quantity ?? 0);

      if (!row || row.is_visible === false || (row.stock ?? 0) < qty) ngNames.push(name);
      else if ((row.max_per_order ?? 0) > 0 && qty > (row.max_per_order as number)) {
        ngNames.push(`${name}（1回のお会計で${row.max_per_order}個まで）`);
      }
    }
    return { ok: ngNames.length === 0, ngNames };
  };

  // ✅ 注文者情報の入力チェック（必須：本名・メールアドレス）
  const validateGuestInfo = (v: GuestInfo): GuestErrors => {
    const e: GuestErrors = {};

    if (!v.name.trim()) e.name = "本名（氏名）を入力してください。";
    if (!v.email.trim()) e.email = "メールアドレスを入力してください。";
    else if (!isEmailLike(v.email)) e.email = "メールアドレスの形式が正しくありません。";

    // ✅ 発送商品の注文は配送先も必須
    if (needsShipping) {
      const postal = v.postalCode.trim();
      if (!postal) e.postalCode = "郵便番号を入力してください。";
      else if (!/^\d{3}-?\d{4}$/.test(postal)) e.postalCode = "郵便番号の形式が正しくありません（例: 100-0001）。";

      if (!v.address.trim()) e.address = "住所を入力してください。";

      const ph = v.phone.trim().replace(/[-－\s]/g, "");
      if (!v.phone.trim()) e.phone = "電話番号を入力してください。";
      else if (!/^0\d{9,11}$/.test(ph)) e.phone = "電話番号の形式が正しくありません（例: 090-1234-5678）。";
    }
    return e;
  };

  const setGuestField = (key: keyof GuestInfo) => (e: any) => {
    const v = e.target.value;
    setGuestInfo((prev) => ({ ...prev, [key]: v }));
    setGuestErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const scrollToGuestError = () => {
    window.setTimeout(() => {
      const first = document.querySelector(".co-field.is-error") || document.querySelector(".co-field");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  // ✅ ゲストの入力は端末に保存（次回購入で再入力不要に）
  useEffect(() => {
    if (authUser?.id) return;
    try {
      localStorage.setItem(GUEST_INFO_KEY, JSON.stringify(guestInfo));
    } catch {}
  }, [guestInfo, authUser?.id]);

  // ✅ 決済処理本体（ID入力がOFFのときもここへ）
  const startPaymentFlow = async () => {
    let redirecting = false;

    try {
      setIsProcessing(true);

      const {
        data: { user: authData },
      } = await supabase.auth.getUser();
      const user = authData ?? null;

      // ✅ 注文者情報の必須チェック（未入力なら警告→編集画面へ）
      const gErr = validateGuestInfo(guestInfo);
      setGuestErrors(gErr);
      if (Object.keys(gErr).length > 0) {
        await appDialog.alert({
          title: "入力が必要です",
          message:
            needsShipping
              ? "注文者情報と配送先を入力してください。\n氏名・メール・郵便番号・住所・電話番号を「修正」ボタンから入力してください。"
              : "注文者情報を入力してください。\n氏名・メールアドレスを「修正」ボタンから入力してください。",
        });
        setInfoMode("edit");
        scrollToGuestError();
        return;
      }

      // ✅ 購入者名・メールはフォームの値を優先（ログイン中は自動入力済み）
      const buyerName = guestInfo.name.trim() || "(名前未設定)";
      const buyerEmail = guestInfo.email.trim() || (user?.email ?? "");

      const itemsForStorage: StoredItem[] = pricedItems.map((x) => ({
        productId: x.item.product.id,
        name: x.item.product.name,
        price: x.normal,
        quantity: x.qty,
        stock: Number(x.item.product.stock ?? 0),
        isShipping: !!x?.item?.product?.is_shipping,
        saleQty: x.saleQty,
        salePrice: x.salePrice,
        normalQty: x.normalQty,
        saleMode: x.sale ? x.sale.sale_mode : null,
      }));

      const pointsUsed = Number(pointsDiscountYen || 0);

      // ========= 0円購入（クーポン/ポイントで0円） =========
      if (payableTotal === 0) {
        const token0yen =
          (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const paymentMethod = pointsUsed > 0 ? "points" : "coupon";

        // ✅ ゲスト（アカウント未登録）：匿名ユーザーは RLS で orders に書けないため
        //   Supabase Edge Function（service role）で注文作成・在庫減算・paid反映まで行う
        if (!user) {
          const { data: guestResult, error: guestErr } = await supabase.functions.invoke(
            "guest-checkout",
            {
              body: {
                token: token0yen,
                total: 0,
                subtotal,
                discountYen,
                coupon: appliedCoupon,
                fulfillmentType,
                buyer: {
                  name: guestInfo.name.trim(),
                  email: guestInfo.email.trim(),
                  phone: guestInfo.phone.trim(),
                  postalCode: guestInfo.postalCode.trim(),
                  address: guestInfo.address.trim(),
                  building: guestInfo.building.trim(),
                },
                items: itemsForStorage.map((it) => ({
                  productId: it.productId,
                  name: it.name,
                  price: it.price,
                  quantity: it.quantity,
                })),
              },
            }
          );

          if (guestErr || !guestResult?.ok) {
            console.error("guest-checkout error:", guestErr, guestResult);
            await appDialog.alert({
              title: "エラー",
              message: String(guestResult?.error || guestErr?.message || "注文の作成に失敗しました"),
            });
            return;
          }

          const guestOrderId = String(guestResult.orderId || "");

          // ✅ クーポンの使用を記録（ゲストでも同じ）
          if (appliedCoupon && guestOrderId) {
            const { error: eCoupon } = await supabase.rpc("coupon_redeem_for_order", {
              p_order_id: guestOrderId,
            });
            if (eCoupon) console.error("coupon_redeem_for_order (guest) failed:", eCoupon);
          }

          // ✅ ゲスト購入（0円）でも、アカウント購入と同じく購入者本人へ購入完了メールを送る
          //   注文には guest-checkout が email / name を保存済みなので、既存API（send-buyer-order-email）がそのまま使える
          await fetch("/api/send-buyer-order-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: guestOrderId, token: token0yen }),
          }).catch((err) => console.error("send-buyer-order-email (guest) failed:", err));

          // ✅ 発送商品 → 管理者へ購入者情報メール（お問い合わせテンプレを再利用）
          if (needsShipping) {
            await fetch("/api/send-admin-shipping-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: guestOrderId, token: token0yen }),
            }).catch((err) => console.error("send-admin-shipping-email (guest) failed:", err));
          }

          if (!buyNow && typeof (cart as any).clearCart === "function") (cart as any).clearCart();
          navigate(
            `/purchase-complete/${guestOrderId}?orderId=${encodeURIComponent(
              guestOrderId
            )}&token=${encodeURIComponent(token0yen)}&paid=1`,
            { replace: true }
          );
          return;
        }

        const { data: orderRow, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            total: 0,
            payment_method: paymentMethod,
            subtotal,
            discount_amount: discountYen,
            coupon_code: appliedCoupon,
            points_used: pointsUsed,
            status: "pending",
            paypay_return_token: token0yen,
            email: buyerEmail || null,
            name: buyerName || null,
            phone: guestInfo.phone.trim() || null,
            postal_code: guestInfo.postalCode.trim() || null,
            address: guestInfo.address.trim() || null,
            building: guestInfo.building.trim() || null,
            fulfillment_type: fulfillmentType,
            shipping_status: fulfillmentType === "shipping" ? "preparing" : null,
          })
          .select("id")
          .single();

        if (orderErr || !orderRow) {
          console.error(orderErr);
          await appDialog.alert({
            title: "エラー",
            message: "注文の作成に失敗しました",
          });
          return;
        }

        // ✅ セール分と通常分を別明細に分けて保存（セールで買ったことが履歴に残る）
        const orderItemsPayload = itemsForStorage.flatMap((it) => {
          const base = {
            order_id: orderRow.id,
            product_id: Number(it.productId),
            product_name: it.name,
          };
          const rows: any[] = [];
          if (it.saleQty > 0) {
            rows.push({
              ...base,
              price: it.salePrice,
              quantity: it.saleQty,
              is_sale: true,
              original_price: it.price,
              sale_mode: it.saleMode,
            });
          }
          if (it.normalQty > 0 || rows.length === 0) {
            rows.push({
              ...base,
              price: it.price,
              quantity: it.normalQty > 0 ? it.normalQty : it.quantity,
              is_sale: false,
              original_price: null,
              sale_mode: null,
            });
          }
          return rows;
        });

        let itemsErr: any = null;
        {
          const attempt = await supabase.from("order_items").insert(orderItemsPayload);
          itemsErr = attempt.error;
          if (itemsErr) {
            // v26 SQL 未実行でも注文できるようにフォールバック
            const plain = itemsForStorage.flatMap((it) => {
              const base = {
                order_id: orderRow.id,
                product_id: Number(it.productId),
                product_name: it.name,
              };
              const rows: any[] = [];
              if (it.saleQty > 0 && it.salePrice !== it.price) {
                rows.push({ ...base, price: it.salePrice, quantity: it.saleQty });
              }
              const rest = it.normalQty > 0 ? it.normalQty : it.saleQty > 0 ? 0 : it.quantity;
              if (rest > 0) rows.push({ ...base, price: it.price, quantity: rest });
              return rows;
            });
            const retry = await supabase.from("order_items").insert(plain);
            itemsErr = retry.error;
          }
        }
        if (itemsErr) {
          console.error(itemsErr);
          await appDialog.alert({
            title: "エラー",
            message: "注文商品の保存に失敗しました",
          });
          return;
        }

        // ✅ 0円購入はここでポイント差し引き
        if (pointsUsed > 0) {
          const { error: useErr } = await supabase.rpc("points_use_for_order", {
            p_order_id: orderRow.id,
            p_points: pointsUsed,
          });
          if (useErr) {
            console.error("points_use_for_order error:", useErr);
            await appDialog.alert({
              title: "ポイント使用に失敗しました",
              message: "ポイント使用に失敗しました（残高不足など）",
            });
            return;
          }
        }

        // 在庫減算
        for (const it of itemsForStorage) {
          const { error } = await supabase.rpc("decrement_stock", {
            p_product_id: Number(it.productId),
            p_qty: Number(it.quantity),
          });
          if (error) {
            console.error("decrement_stock error:", error);
            await appDialog.alert({
              title: "在庫更新エラー",
              message: (error.message ?? "").includes("在庫不足")
                ? `在庫が足りません：${it.name}`
                : "在庫更新に失敗しました",
            });
            return;
          }
        }

        // ✅ 入荷ロットも消費（セール分 → 期限が近い順／失敗しても購入は止めない）
        {
          const { error: eLot } = await supabase.rpc("consume_lots_for_order", {
            p_order_id: orderRow.id,
          });
          if (eLot) console.error("consume_lots_for_order failed:", eLot);
        }

        await supabase
          .from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", orderRow.id);

        // ✅ アカウント購入（0円）でも、商品に設定された付与ポイントを財布へ反映
        try {
          await supabase.rpc("points_award_for_order", { p_order_id: orderRow.id });
        } catch (e) {
          console.error("points_award_for_order error:", e);
        }

        // ✅ クーポンの使用を記録（使用回数・1人あたり上限／同じ注文では二重に数えない）
        if (appliedCoupon) {
          const { error: eCoupon } = await supabase.rpc("coupon_redeem_for_order", {
            p_order_id: orderRow.id,
          });
          if (eCoupon) console.error("coupon_redeem_for_order failed:", eCoupon);
        }

        if (buyerEmail) {
          await fetch("/api/send-buyer-order-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: orderRow.id, token: token0yen }),
          }).catch(() => {});
        }

        // ✅ 発送商品 → 管理者へ購入者情報メール（お問い合わせテンプレを再利用）
        if (needsShipping) {
          await fetch("/api/send-admin-shipping-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: orderRow.id, token: token0yen }),
          }).catch(() => {});
        }

        if (!buyNow && typeof (cart as any).clearCart === "function") (cart as any).clearCart();
        navigate(
          `/purchase-complete/${orderRow.id}?orderId=${encodeURIComponent(orderRow.id)}&token=${encodeURIComponent(token0yen)}&paid=1`,
          { replace: true }
        );
        return;
      }

      // ========= PayPay購入 =========
      if (method !== "paypay") {
        await appDialog.alert({
          title: "支払い方法",
          message: "支払い方法を選択してください",
        });
        return;
      }

      // ✅ orderId を先に作って、OCIとフロントで同じIDを使う
      const orderIdForPayPay =
        (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const res = await fetch("/api/create-paypay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderIdForPayPay,
          total: payableTotal,
          userId: user?.id ?? null,
          subtotal,
          discountYen,
          coupon: appliedCoupon,
          pointsUsed,
          buyerEmail: buyerEmail || null,
          buyerName,
          phone: guestInfo.phone.trim() || null,
          postalCode: guestInfo.postalCode.trim() || null,
          address: guestInfo.address.trim() || null,
          building: guestInfo.building.trim() || null,
          fulfillmentType,
          items: itemsForStorage.map((it) => ({
            productId: Number(it.productId),
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            isShipping: !!it?.isShipping,
          })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("create-paypay-order failed:", res.status, errText);
        throw new Error("PayPay注文作成に失敗しました");
      }

      const data = await res.json();

      // ✅ PayPay併用時：ポイント使用額を確実に注文へ記録する
      //    VPS側の注文作成に依存せず、トークン検証付きRPCで保存する
      if (pointsUsed > 0 && data?.orderId && data?.token) {
        try {
          const { error: ptsErr } = await supabase.rpc("set_order_points_used", {
            p_order_id: String(data.orderId),
            p_token: String(data.token),
            p_points: Number(pointsUsed),
          });
          if (ptsErr) console.error("set_order_points_used error:", ptsErr);
        } catch (ePts) {
          console.error("set_order_points_used failed:", ePts);
        }
      }

      // ✅ PayPayへ飛ぶURLはここ（redirectUrlじゃない）
      const paypayUrl: string | null = data?.paypay?.url ?? data?.redirectUrl ?? null;

      if (!paypayUrl) {
        console.error("create-paypay-order response:", data);
        throw new Error("PayPay URL が取得できませんでした");
      }

      redirecting = true;
      try { localStorage.setItem(
            "nagazonpay_pending_order",
            JSON.stringify({
              orderId: data?.orderId || "",
              token: data?.token || "",
              merchantPaymentId: data?.merchantPaymentId || "",
            })
          ); } catch { /* ignore */ }
      window.location.href = paypayUrl;
    } catch (e) {
      console.error(e);
      await appDialog.alert({
        title: "決済エラー",
        message: "決済の開始に失敗しました。時間をおいてお試しください。",
      });
    } finally {
      if (!redirecting) setIsProcessing(false);
    }
  };

  const handleClickConfirmButton = async () => {
    if (isProcessing || isCheckingStock) return;

    if (!buyNow && cart.cart.length === 0) {
      await appDialog.alert({
        title: "カート",
        message: "カートが空です",
      });
      return;
    }
    if (!method) {
      await appDialog.alert({
        title: "支払い方法",
        message: "支払い方法を選択してください",
      });
      return;
    }

    // ✅ 発送商品とその場受け取り商品の混在は不可（保険）
    if (hasMixedFulfillment) {
      await appDialog.alert({
        title: "購入できません",
        message:
          "発送商品とその場受け取り商品は同時に購入できません。\nカートを空にして、どちらかにまとめてください。",
      });
      return;
    }

    // ✅ 注文者情報チェック（未入力なら警告→編集画面へ）
    const vErr = validateGuestInfo(guestInfo);
    setGuestErrors(vErr);
    if (Object.keys(vErr).length > 0) {
      await appDialog.alert({
        title: "入力が必要です",
        message:
          needsShipping
            ? "注文者情報と配送先を入力してください。\n氏名・メール・郵便番号・住所・電話番号を「修正」ボタンから入力してください。"
            : "注文者情報を入力してください。\n氏名・メールアドレスを「修正」ボタンから入力してください。",
      });
      setInfoMode("edit");
      scrollToGuestError();
      return;
    }

    setIsCheckingStock(true);
    try {
      const result = await recheckStockBeforeConfirm();
      if (!result.ok) {
        await appDialog.alert({
          title: "在庫が確保できません",
          message:
            `商品の確保ができません。\n在庫不足または非表示：\n` +
            `・${result.ngNames.join("\n・")}\n\n` +
            `カートをリセットしてホームに戻ります。`,
        });

        if (!buyNow && typeof (cart as any).clearCart === "function") (cart as any).clearCart();
        navigate("/", { replace: true });
        return;
      }

      // ✅ 設定ロード中は安全側で止める
      if (storeAuthLoading) {
        await appDialog.alert({
          title: "読み込み中",
          message: "設定を読み込み中です。少し待ってからもう一度お試しください。",
        });
        return;
      }

      // ✅ ONならモーダル、OFFならそのまま決済へ
      if (storeAuthRequired) setShowStoreAuth(true);
      else await startPaymentFlow();
    } catch (e) {
      console.error(e);
      await appDialog.alert({
        title: "在庫確認エラー",
        message: "在庫確認に失敗しました。時間をおいてお試しください。",
      });
    } finally {
      setIsCheckingStock(false);
    }
  };

  const handleStoreAuthCancel = () => {
    setShowStoreAuth(false);
    setStoreCode("");
  };

  const handleStoreAuthConfirm = async () => {
    try {
      const code = storeCode;

      if (!code.trim()) {
        await appDialog.alert({
          title: "入力してください",
          message: "NAGAZON PAY ID を入力してください。",
        });
        return;
      }

      // ✅ Supabase RPCで検証（ハッシュはフロントに出さない）
      const { data: ok, error } = await supabase.rpc("store_auth_verify", { p_code: code });

      if (error) {
        console.error("store_auth_verify error:", error);
        await appDialog.alert({
          title: "認証エラー",
          message: "認証に失敗しました。時間をおいてお試しください。",
        });
        return;
      }

      if (!ok) {
        await appDialog.alert({
          title: "認証失敗",
          message: "NAGAZON PAY ID が正しくありません。",
        });
        return;
      }

      // ✅ 認証OK → モーダル閉じて決済へ
      setShowStoreAuth(false);
      setStoreCode("");
      await startPaymentFlow();
    } catch (e) {
      console.error(e);
      await appDialog.alert({
        title: "認証エラー",
        message: "認証に失敗しました。時間をおいてお試しください。",
      });
    }
  };

  return (
    <div className="checkout-page-wrap">
      <SiteHeader />

      <main className="checkout-page">
        <div className="checkout-layout">
          <div className="checkout-main">
            {/* 購入商品 */}
            <section className="co-section">
              <h3 className="co-section-title">購入商品</h3>
              <div className={`co-fulfillBanner ${fulfillmentType}`}>
                {fulfillmentType === "shipping"
                  ? "📦 発送でお届けします（下で配送先を入力）"
                  : "🏠 その場受け取りでお渡しします"}
              </div>
              <div className="co-card">
                {pricedItems.map((x) => (
                  <div className="co-item" key={x.item.id}>
                    <img
                      src={x.item.product.imageData ?? "/no-image.png"}
                      className="co-item-img"
                      alt={x.item.product.name}
                    />
                    <div className="co-item-info">
                      <div className="co-item-name">
                        {x.item.product.name}
                        {x.item.product.is_shipping ? (
                          <span className="co-item-tag shipping">発送</span>
                        ) : (
                          <span className="co-item-tag pickup">受け取り</span>
                        )}
                        {x.saleQty > 0 && <span className="co-item-tag sale">セール</span>}
                      </div>
                      <div className="co-item-sub">
                        {x.saleQty > 0 && (
                          <>
                            <b>
                              セール {formatPrice(x.salePrice)}円 × {x.saleQty}
                            </b>
                            {x.normalQty > 0 && " ／ "}
                          </>
                        )}
                        {x.normalQty > 0 || x.saleQty === 0 ? (
                          <>
                            {formatPrice(x.normal)}円 × {x.normalQty > 0 ? x.normalQty : x.qty}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="co-item-right">
                      <div className="co-item-subtotal">{formatPrice(x.lineTotal)}円</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ✅ 注文者情報（ゲスト購入対応・ログイン中は自動入力） */}
                        {/* ✅ 注文者情報：アカウント時は自動入力して表示、ゲスト時も確認表示から「修正」で入力（参考サイトと同じUI） */}
            <section className="co-section">
              <h3 className="co-section-title">注文者情報</h3>
              <div className="co-card">
                <div className="guest-info-note">
                  {needsShipping
                    ? "発送商品のため、配送先（郵便番号・住所・電話番号）の入力が必要です。"
                    : authUser?.id
                      ? "アカウント情報を自動入力しました。変更する場合は「修正」ボタンから変更できます。"
                      : "アカウント未登録のまま購入できます。ご連絡のためご入力ください。"}
                </div>

                {/* ----- 確認表示モード（最初からこれを出す） ----- */}
                {infoMode === "view" ? (
                  <div className="buyer-view">
                    <div className="buyer-view-row">
                      <span className="buyer-view-label">氏名</span>
                      <span className="buyer-view-value">
                        {guestInfo.name.trim() || <em className="buyer-view-empty">未入力</em>}
                      </span>
                    </div>
                    <div className="buyer-view-row">
                      <span className="buyer-view-label">メールアドレス</span>
                      <span className="buyer-view-value">
                        {guestInfo.email.trim() || <em className="buyer-view-empty">未入力</em>}
                      </span>
                    </div>
                    {needsShipping ? (
                      <>
                        <div className="buyer-view-row">
                          <span className="buyer-view-label">郵便番号</span>
                          <span className="buyer-view-value">
                            {guestInfo.postalCode.trim() || <em className="buyer-view-empty">未入力</em>}
                          </span>
                        </div>
                        <div className="buyer-view-row">
                          <span className="buyer-view-label">住所</span>
                          <span className="buyer-view-value">
                            {guestInfo.address.trim() || <em className="buyer-view-empty">未入力</em>}
                            {guestInfo.building.trim() ? " " + guestInfo.building.trim() : ""}
                          </span>
                        </div>
                        <div className="buyer-view-row">
                          <span className="buyer-view-label">電話番号</span>
                          <span className="buyer-view-value">
                            {guestInfo.phone.trim() || <em className="buyer-view-empty">未入力</em>}
                          </span>
                        </div>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="buyer-edit-btn"
                      onClick={() => {
                        setGuestErrors({});
                        setInfoMode("edit");
                      }}
                    >
                      修正
                    </button>
                    {guestErrors.name || guestErrors.email || guestErrors.postalCode || guestErrors.address || guestErrors.phone ? (
                      <div className="co-help is-error" style={{ marginTop: 10 }}>
                        注文者情報が未入力です。「修正」から入力してください。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* ----- 編集モード（修正ボタン直後のみ・入力項目は名前とメールの2つ） ----- */
                  <div className="co-fields">
                    <div className={`co-field ${guestErrors.name ? "is-error" : ""}`}>
                      <label>
                        本名（氏名） <span className="contact-req">必須</span>
                      </label>
                      <input
                        type="text"
                        className="co-input"
                        value={guestInfo.name}
                        onChange={setGuestField("name")}
                        placeholder="山田 太郎"
                        autoComplete="name"
                      />
                      {guestErrors.name && <div className="co-help is-error">{guestErrors.name}</div>}
                    </div>

                    <div className={`co-field ${guestErrors.email ? "is-error" : ""}`}>
                      <label>
                        メールアドレス <span className="contact-req">必須</span>
                      </label>
                      <input
                        type="email"
                        className="co-input"
                        value={guestInfo.email}
                        onChange={setGuestField("email")}
                        placeholder="example@example.com"
                        autoComplete="email"
                        inputMode="email"
                      />
                      {guestErrors.email ? (
                        <div className="co-help is-error">{guestErrors.email}</div>
                      ) : (
                        <div className="co-help">購入完了メールをこちらへお送りします。</div>
                      )}
                    </div>

                    {needsShipping ? (
                      <>
                        <div className={`co-field ${guestErrors.postalCode ? "is-error" : ""}`}>
                          <label>
                            郵便番号 <span className="contact-req">必須</span>
                          </label>
                          <input
                            type="text"
                            className="co-input"
                            value={guestInfo.postalCode}
                            onChange={setGuestField("postalCode")}
                            placeholder="例: 100-0001"
                            autoComplete="postal-code"
                            inputMode="numeric"
                          />
                          {guestErrors.postalCode && (
                            <div className="co-help is-error">{guestErrors.postalCode}</div>
                          )}
                        </div>

                        <div className={`co-field ${guestErrors.address ? "is-error" : ""}`}>
                          <label>
                            住所 <span className="contact-req">必須</span>
                          </label>
                          <input
                            type="text"
                            className="co-input"
                            value={guestInfo.address}
                            onChange={setGuestField("address")}
                            placeholder="例: 東京都千代田区丸の内1-1-1"
                            autoComplete="street-address"
                          />
                          {guestErrors.address && (
                            <div className="co-help is-error">{guestErrors.address}</div>
                          )}
                        </div>

                        <div className="co-field">
                          <label>建物名・部屋番号（任意）</label>
                          <input
                            type="text"
                            className="co-input"
                            value={guestInfo.building}
                            onChange={setGuestField("building")}
                            placeholder="例: サンプルビル 3F"
                            autoComplete="street-address"
                          />
                        </div>

                        <div className={`co-field ${guestErrors.phone ? "is-error" : ""}`}>
                          <label>
                            電話番号 <span className="contact-req">必須</span>
                          </label>
                          <input
                            type="tel"
                            className="co-input"
                            value={guestInfo.phone}
                            onChange={setGuestField("phone")}
                            placeholder="例: 090-1234-5678"
                            autoComplete="tel"
                            inputMode="tel"
                          />
                          {guestErrors.phone ? (
                            <div className="co-help is-error">{guestErrors.phone}</div>
                          ) : (
                            <div className="co-help">配送の連絡に使用します。</div>
                          )}
                        </div>
                      </>
                    ) : null}

                    <div className="buyer-edit-actions">
                      <button
                        type="button"
                        className="buyer-save-btn"
                        onClick={() => {
                          const e = validateGuestInfo(guestInfo);
                          setGuestErrors(e);
                          if (Object.keys(e).length > 0) {
                            appDialog.alert({
                              title: "入力エラー",
                              message: needsShipping
                                ? "氏名・メール・郵便番号・住所・電話番号を正しく入力してください。"
                                : "氏名・メールアドレスを正しく入力してください。",
                            });
                            return;
                          }
                          setInfoMode("view"); // 保存して確認表示に戻す
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="buyer-cancel-btn"
                        onClick={() => {
                          setInfoMode("view");
                        }}
                      >
                        戻る
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* クーポン */}
            <section className="co-section">
              <h3 className="co-section-title">クーポンコード</h3>
              <div className="co-card">
                <div className="coupon-row">
                  <input
                    className="coupon-input"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="クーポンコードを入力"
                    autoCapitalize="characters"
                  />
                  <button className="coupon-apply" onClick={applyCoupon}>
                    適用
                  </button>
                </div>

                {(couponMsg || appliedCoupon) && (
                  <div className={`coupon-msg ${appliedCoupon ? "ok" : "ng"}`}>
                    <span>{couponMsg}</span>
                    {appliedCoupon && (
                      <button className="coupon-clear" onClick={clearCoupon}>
                        解除
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ✅ ポイント */}
            <section className="co-section">
              <h3 className="co-section-title">ポイント</h3>
              <div className="co-card">
                {!authUser?.id && (
                  <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800, marginBottom: 8 }}>
                    ※ アカウントにログインするとポイントを利用できます。ゲスト購入ではポイントは使えません。
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                    利用可能：{Number(wallet?.available ?? 0).toLocaleString("ja-JP")} pt
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                    上限：{Number(pointsMax ?? 0).toLocaleString("ja-JP")} pt
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  <input
                    className="coupon-input"
                    disabled={!authUser?.id}
                    inputMode="numeric"
                    value={String(pointsToUse)}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/[^\d]/g, "") || 0);
                      setPointsClamped(v);
                    }}
                    placeholder="使用ポイント"
                  />
                  <button className="coupon-apply" type="button" onClick={() => setPointsClamped(pointsMax)}>
                    最大
                  </button>
                </div>

                {(pointsMsg || pointsDiscountYen > 0) && (
                  <div className="coupon-msg ok" style={{ marginTop: 10 }}>
                    <span>{pointsMsg || `ポイント適用：-${formatPrice(pointsDiscountYen)}円`}</span>
                    <button
                      className="coupon-clear"
                      type="button"
                      onClick={() => {
                        setPointsToUse(0);
                        setPointsMsg("");
                      }}
                    >
                      クリア
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                  ※ 0ならポイント未使用。クーポン適用後の残額まで（1pt=1円）
                </div>
              </div>
            </section>

            {/* 支払い方法（モバイル） */}
            <section className="co-section only-mobile">
              <h3 className="co-section-title">支払い方法</h3>
              <div className="co-card">
                <button
                  type="button"
                  className={`pay-card ${method === "paypay" ? "selected" : ""}`}
                  onClick={() => setMethod("paypay")}
                >
                  <div className="pay-left">
                    <div className="pay-title">PayPay</div>
                    <div className="pay-desc">PayPayでお支払い</div>
                  </div>
                  <div className="pay-check-area">
                    <div className="pay-check">{method === "paypay" ? "✓" : ""}</div>
                  </div>
                </button>
              </div>
            </section>

            {/* 明細（モバイル） */}
            <section className="co-section only-mobile">
              <h3 className="co-section-title">お支払い明細</h3>
              <div className="co-card">
                <div className="sum-row">
                  <span>小計</span>
                  <span>{formatPrice(subtotal)}円</span>
                </div>
                <div className="sum-row">
                  <span>クーポン</span>
                  <span className={discountYen > 0 ? "sum-discount" : ""}>-{formatPrice(discountYen)}円</span>
                </div>
                <div className="sum-row">
                  <span>ポイント</span>
                  <span className={pointsDiscountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(pointsDiscountYen)}円
                  </span>
                </div>
                <div className="sum-sep" />
                <div className="sum-row sum-total">
                  <span>合計</span>
                  <span>{formatPrice(payableTotal)}円</span>
                </div>
              </div>
            </section>
          </div>

          {/* 右側（PC） */}
          <aside className="checkout-side">
            <section className="co-section only-desktop">
              <h3 className="co-section-title">支払い方法</h3>
              <div className="co-card">
                <button
                  type="button"
                  className={`pay-card pay-mini ${method === "paypay" ? "selected" : ""}`}
                  onClick={() => setMethod("paypay")}
                >
                  <div className="pay-left">
                    <div className="pay-title">PayPay</div>
                    <div className="pay-desc">PayPayでお支払い</div>
                  </div>
                  <div className="pay-check-area">
                    <div className="pay-check">{method === "paypay" ? "✓" : ""}</div>
                  </div>
                </button>
              </div>
            </section>

            <section className="co-section only-desktop">
              <h3 className="co-section-title">お支払い明細</h3>
              <div className="co-card">
                <div className="sum-row">
                  <span>小計</span>
                  <span>{formatPrice(subtotal)}円</span>
                </div>
                <div className="sum-row">
                  <span>クーポン</span>
                  <span className={discountYen > 0 ? "sum-discount" : ""}>-{formatPrice(discountYen)}円</span>
                </div>
                <div className="sum-row">
                  <span>ポイント</span>
                  <span className={pointsDiscountYen > 0 ? "sum-discount" : ""}>
                    -{formatPrice(pointsDiscountYen)}円
                  </span>
                </div>
                <div className="sum-sep" />
                <div className="sum-row sum-total">
                  <span>合計</span>
                  <span>{formatPrice(payableTotal)}円</span>
                </div>

                <button
                  className="side-pay-btn"
                  onClick={handleClickConfirmButton}
                  disabled={isProcessing || isCheckingStock}
                >
                  {isCheckingStock ? "在庫確認中..." : isProcessing ? "処理中..." : "購入を確定する"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <div className="checkout-bottom-fixed only-mobile">
        <button
          className="checkout-btn checkout-btn-full"
          onClick={handleClickConfirmButton}
          disabled={isProcessing || isCheckingStock}
        >
          {isCheckingStock ? "在庫確認中..." : isProcessing ? "処理中..." : "購入を確定する"}
        </button>
      </div>

      <SiteFooter />

      {showStoreAuth && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>NAGAZON PAY ID</h3>
            <input
              type="password"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="IDを入力してください"
              className="store-auth-input"
            />
            <div className="modal-buttons">
              <button className="modal-main-btn" onClick={handleStoreAuthConfirm}>
                次へ進む
              </button>
              <button className="modal-sub-btn" onClick={handleStoreAuthCancel}>
                戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkout;
