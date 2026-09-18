// src/pages/AdminAdd.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminAdd.css";
import { appDialog } from "../lib/appDialog"; // ✅ 追加

function AdminAdd() {
  const navigate = useNavigate();

  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stock, setStock] = useState("");
  const [memberPrice, setMemberPrice] = useState("");
  const [earnPoints, setEarnPoints] = useState("");
  // ✅ 仕入れ原価（1個あたり・円）
  const [cost, setCost] = useState("");
  // ✅ 賞味期限（在庫を登録するときは必須）
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryType, setExpiryType] = useState<"best_before" | "use_by">("best_before");
  // ✅ 1回のお会計での購入上限・賞味期限アラート日数
  const [maxPerOrder, setMaxPerOrder] = useState("");
  const [alertDays, setAlertDays] = useState("30");
  const [isShipping, setIsShipping] = useState(false);
  // ✅ 発送目安（任意）: 最短〜最長＋単位（営業日/日）
  const [shippingLeadMin, setShippingLeadMin] = useState("");
  const [shippingLeadMax, setShippingLeadMax] = useState("");
  const [shippingLeadUnit, setShippingLeadUnit] = useState<"business_days" | "days">("business_days");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (!productId || !name || !price || !stock) {
      await appDialog.alert({
        title: "入力エラー",
        message: "商品ID・商品名・価格・在庫をすべて入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    const idNum = Number(productId);
    const priceNum = Number(price);
    const originalPriceNum = originalPrice.trim() === "" ? null : Number(originalPrice);
    const stockNum = Number(stock);

    if (!Number.isInteger(idNum) || idNum <= 0) {
      await appDialog.alert({
        title: "入力エラー",
        message: "商品IDは1以上の整数で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    if (Number.isNaN(priceNum) || Number.isNaN(stockNum)) {
      await appDialog.alert({
        title: "入力エラー",
        message: "価格と在庫は数値で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    if (originalPrice.trim() !== "" && (originalPriceNum == null || Number.isNaN(originalPriceNum))) {
      await appDialog.alert({
        title: "入力エラー",
        message: "通常価格は数値で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    if (originalPriceNum != null && originalPriceNum <= priceNum) {
      await appDialog.alert({
        title: "入力エラー",
        message: "通常価格は販売価格より大きい金額を入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    const memberPriceNum = memberPrice.trim() === "" ? null : Number(memberPrice);
    const earnNum = Math.max(0, Math.floor(Number(earnPoints || 0) || 0));

    if (memberPrice.trim() !== "" && (memberPriceNum == null || Number.isNaN(memberPriceNum))) {
      await appDialog.alert({ title: "入力エラー", message: "会員価格は数値で入力してください" });
      setIsSubmitting(false);
      return;
    }

    // ✅ 発送目安の入力チェック（発送商品では必須・0以上の整数・最短≦最長）
    const leadMinRaw = shippingLeadMin.trim();
    const leadMaxRaw = shippingLeadMax.trim();
    const leadMinNum = leadMinRaw === "" ? null : Math.floor(Number(leadMinRaw));
    const leadMaxNum = leadMaxRaw === "" ? null : Math.floor(Number(leadMaxRaw));

    if (isShipping) {
      if (leadMinRaw === "" || leadMinNum == null || Number.isNaN(leadMinNum) || leadMinNum < 0) {
        await appDialog.alert({ title: "入力エラー", message: "発送商品では発送目安（最短）の入力が必要です（0以上の整数）" });
        setIsSubmitting(false);
        return;
      }
      if (leadMaxRaw === "" || leadMaxNum == null || Number.isNaN(leadMaxNum) || leadMaxNum < 0) {
        await appDialog.alert({ title: "入力エラー", message: "発送商品では発送目安（最長）の入力が必要です（0以上の整数）" });
        setIsSubmitting(false);
        return;
      }
      if (leadMinNum > leadMaxNum) {
        await appDialog.alert({ title: "入力エラー", message: "発送目安は「最短 ≦ 最長」になるよう入力してください" });
        setIsSubmitting(false);
        return;
      }
    }

    const costRaw = cost.trim();
    const costNum = costRaw === "" ? null : Math.floor(Number(costRaw));

    if (costRaw !== "" && (costNum == null || Number.isNaN(costNum) || costNum < 0)) {
      await appDialog.alert({
        title: "入力エラー",
        message: "仕入れ原価は0以上の数字で入力してください",
      });
      setIsSubmitting(false);
      return;
    }

    // ✅ 在庫を登録するときは原価と期限が必須
    if (stockNum > 0) {
      if (costRaw === "") {
        await appDialog.alert({
          title: "入力エラー",
          message:
            "在庫を登録する場合は「仕入れ原価（1個あたり）」が必須です。\n入荷ロットとして登録されます。",
        });
        setIsSubmitting(false);
        return;
      }
      if (expiryDate.trim() === "") {
        await appDialog.alert({
          title: "入力エラー",
          message:
            "在庫を登録する場合は「賞味期限 / 消費期限」が必須です。\n入荷ロットとして登録されます。",
        });
        setIsSubmitting(false);
        return;
      }
    }

    const maxPerOrderNum = maxPerOrder.trim() === "" ? null : Math.max(1, Math.floor(Number(maxPerOrder)));
    const alertDaysNum = alertDays.trim() === "" ? 30 : Math.max(1, Math.floor(Number(alertDays)));

    const payload: Record<string, unknown> = {
      id: idNum,
      name,
      price: priceNum,
      cost: costNum,
      max_per_order: maxPerOrderNum,
      expiry_alert_days: alertDaysNum,
      stock: stockNum,
      member_price: Number.isFinite(memberPriceNum) ? memberPriceNum : null,
      earn_points: earnNum,
      is_shipping: isShipping,
      shipping_lead_min: isShipping ? leadMinNum : null,
      shipping_lead_max: isShipping ? leadMaxNum : null,
      shipping_lead_unit: isShipping ? shippingLeadUnit : "business_days",
    };

    if (originalPriceNum != null) payload.original_price = originalPriceNum;

    const { error } = await supabase.from("products").insert(payload);

    if (error) {
      console.error(error);
      await appDialog.alert({
        title: "追加に失敗しました",
        message: "商品追加に失敗: " + error.message,
      });
      setIsSubmitting(false);
      return;
    }

    // ✅ 在庫ぶんの入荷ロットを登録（原価・期限つき）
    if (stockNum > 0) {
      const { error: eLot } = await supabase.from("product_lots").insert({
        product_id: idNum,
        lot_label: "初回入荷",
        cost: costNum ?? 0,
        quantity: stockNum,
        remaining: stockNum,
        expiry_date: expiryDate.trim(),
        expiry_type: expiryType,
      });

      if (eLot) {
        await appDialog.alert({
          title: "注意",
          message:
            "商品は追加しましたが、入荷ロットの登録に失敗しました: " +
            eLot.message +
            "\n「仕入れ原価・入荷ロット管理」から登録してください。",
        });
        navigate("/admin-page");
        return;
      }
    }

    await appDialog.alert({ title: "完了", message: "商品を追加しました！" });
    navigate("/admin-page");
  };

  return (
    <div className="add-container">
      <header className="add-header">
        <button className="back-button" onClick={() => navigate("/admin-page")}>
          ← 戻る
        </button>

        <h2 className="add-title">商品追加</h2>

        <button
          className="add-submit-button"
          onClick={handleAdd}
          disabled={isSubmitting}
        >
          {isSubmitting ? "送信中..." : "追加"}
        </button>
      </header>

      <input
        type="number"
        placeholder="商品ID（例：101）"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
      />

      <input
        type="text"
        placeholder="商品名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        type="number"
        placeholder="価格"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <input
        type="number"
        placeholder="通常価格（SALE表示する時だけ）"
        value={originalPrice}
        onChange={(e) => setOriginalPrice(e.target.value)}
      />

      <input
        type="number"
        placeholder="在庫数"
        value={stock}
        onChange={(e) => setStock(e.target.value)}
      />

      <input
        type="number"
        placeholder="会員価格（ログイン時の価格・未入力なら通常価格）"
        value={memberPrice}
        onChange={(e) => setMemberPrice(e.target.value)}
      />

      <input
        type="number"
        placeholder="購入時付与ポイント（pt・購入後にアカウントへ付与）"
        value={earnPoints}
        onChange={(e) => setEarnPoints(e.target.value)}
      />

      <input
        type="number"
        placeholder="仕入れ原価（1個あたり・円）※在庫を入れる場合は必須"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />

      <div className="add-lot-box">
        <div className="add-lot-title">
          賞味期限 / 消費期限<span className="add-lot-req">在庫を入れる場合は必須</span>
        </div>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
        <select
          value={expiryType}
          onChange={(e) => setExpiryType(e.target.value as "best_before" | "use_by")}
        >
          <option value="best_before">賞味期限</option>
          <option value="use_by">消費期限</option>
        </select>
        <div className="add-lot-help">
          在庫を入れると、この期限・原価で「初回入荷」ロットが自動作成されます。
          その後の入荷は「仕入れ原価・入荷ロット管理」から登録してください。
        </div>
      </div>

      <input
        type="number"
        placeholder="1回のお会計での購入上限（個・空欄=無制限）"
        value={maxPerOrder}
        onChange={(e) => setMaxPerOrder(e.target.value)}
      />

      <input
        type="number"
        placeholder="賞味期限アラートの日数（既定30）"
        value={alertDays}
        onChange={(e) => setAlertDays(e.target.value)}
      />

      <label className="add-shipping-toggle">
        <input
          type="checkbox"
          checked={isShipping}
          onChange={(e) => setIsShipping(e.target.checked)}
        />
        <span>発送商品（購入時に配送先の住所・電話番号が必要）</span>
      </label>

      {isShipping && (
        <div className="add-shipping-lead">
          <div className="add-lead-title">発送目安<span className="add-lead-req">必須</span></div>
          <div className="add-lead-sub">発送商品にする場合は必ず入力してください。最短〜最長（例: 最短3 〜 最長5）に「営業日」か「日」を選びます</div>
          <div className="add-lead-row">
            <input
              type="number"
              min={0}
              placeholder="最短（例: 3）"
              value={shippingLeadMin}
              onChange={(e) => setShippingLeadMin(e.target.value)}
            />
            <span className="add-lead-sep">〜</span>
            <input
              type="number"
              min={0}
              placeholder="最長（例: 5）"
              value={shippingLeadMax}
              onChange={(e) => setShippingLeadMax(e.target.value)}
            />
            <select
              value={shippingLeadUnit}
              onChange={(e) => setShippingLeadUnit(e.target.value as "business_days" | "days")}
            >
              <option value="business_days">営業日</option>
              <option value="days">日</option>
            </select>
          </div>
          <div className="add-lead-help">
            例:「最短3 〜 最長5・営業日」→ 「ご注文から3〜5営業日以内に発送」と商品詳細に表示されます
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAdd;