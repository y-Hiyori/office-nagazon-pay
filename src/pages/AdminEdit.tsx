// src/pages/AdminEdit.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminEdit.css";
import { appDialog } from "../lib/appDialog";

export default function AdminEdit() {
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");

  // ✅ 通常価格（メイン）とセール価格（任意）
  //   DB保存時：
  //     セールなし → price = normalPrice / original_price = null
  //     セールあり → price = salePrice  / original_price = normalPrice
  const [normalPrice, setNormalPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const [stock, setStock] = useState("");
  const [memberPrice, setMemberPrice] = useState("");
  const [earnPoints, setEarnPoints] = useState("");
  // ✅ 仕入れ原価（1個あたり・円）
  const [cost, setCost] = useState("");
  // ✅ 1回のお会計での購入上限・賞味期限アラート日数
  const [maxPerOrder, setMaxPerOrder] = useState("");
  const [alertDays, setAlertDays] = useState("30");
  const [isShipping, setIsShipping] = useState(false);
  // ✅ 発送目安（任意）
  const [shippingLeadMin, setShippingLeadMin] = useState("");
  const [shippingLeadMax, setShippingLeadMax] = useState("");
  const [shippingLeadUnit, setShippingLeadUnit] = useState<"business_days" | "days">("business_days");

  const [isSaving, setIsSaving] = useState(false);
  const [openIdEdit, setOpenIdEdit] = useState(false);

  const loadProduct = async () => {
    if (!urlId) {
      await appDialog.alert({
        title: "エラー",
        message: "商品のIDが不正です",
      });
      navigate("/admin-page");
      return;
    }

    const { data, error } = await supabase
      .from("products")
        .select("id, name, price, original_price, stock, member_price, earn_points, is_shipping, shipping_lead_min, shipping_lead_max, shipping_lead_unit, cost, max_per_order, expiry_alert_days")

      .eq("id", urlId)
      .maybeSingle();

    if (error || !data) {
      await appDialog.alert({
        title: "エラー",
        message: "商品が見つかりません",
      });
      console.error(error);
      navigate("/admin-page");
      return;
    }

    setEditId(String(data.id));
    setName(data.name);

    const dbPrice = Number(data.price ?? 0);
    const dbOriginal = Number((data as any).original_price ?? 0);
    const hasSale =
      Number.isFinite(dbOriginal) && dbOriginal > 0 && dbOriginal > dbPrice;

    if (hasSale) {
      setNormalPrice(String(dbOriginal));
      setSalePrice(String(dbPrice));
    } else {
      setNormalPrice(String(dbPrice));
      setSalePrice("");
    }

    setStock(String(data.stock));
    const dbMember = (data as any).member_price ?? null;
    setMemberPrice(dbMember != null && Number(dbMember) > 0 ? String(dbMember) : "");
    const dbEarn = Number((data as any).earn_points ?? 0);
    setEarnPoints(dbEarn > 0 ? String(dbEarn) : "");
    const dbCost = (data as any).cost;
    setCost(dbCost != null && Number(dbCost) > 0 ? String(Math.floor(Number(dbCost))) : "");
    const dbMax = (data as any).max_per_order;
    setMaxPerOrder(dbMax != null && Number(dbMax) > 0 ? String(Math.floor(Number(dbMax))) : "");
    const dbAlert = (data as any).expiry_alert_days;
    setAlertDays(dbAlert != null && Number(dbAlert) > 0 ? String(Math.floor(Number(dbAlert))) : "30");
    setIsShipping(!!(data as any).is_shipping);
    const dbLeadMin = (data as any).shipping_lead_min;
    const dbLeadMax = (data as any).shipping_lead_max;
    setShippingLeadMin(dbLeadMin != null && Number(dbLeadMin) > 0 ? String(dbLeadMin) : "");
    setShippingLeadMax(dbLeadMax != null && Number(dbLeadMax) > 0 ? String(dbLeadMax) : "");
    const dbUnit = (data as any).shipping_lead_unit;
    setShippingLeadUnit(dbUnit === "days" ? "days" : "business_days");
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId]);

  const saleInfo = useMemo(() => {
    const n = Number(normalPrice);
    const s = Number(salePrice);
    const isSale =
      Number.isFinite(s) && s > 0 &&
      Number.isFinite(n) && n > 0 &&
      s < n;

    if (!isSale) return { isSale: false as const };

    const discountYen = n - s;
    const discountRate = Math.round((discountYen / n) * 100);
    return {
      isSale: true as const,
      discountYen,
      discountRate,
      normalNum: n,
      saleNum: s,
    };
  }, [normalPrice, salePrice]);

  const formatYen = (n: number) => (Number(n) || 0).toLocaleString("ja-JP");

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    if (!editId || !name || !normalPrice || !stock) {
      await appDialog.alert({
        title: "入力エラー",
        message: "すべての項目を入力してください",
      });
      setIsSaving(false);
      return;
    }

    const idNum = Number(editId);
    const normalNum = Number(normalPrice);
    const stockNum = Number(stock);
    const saleRaw = salePrice.trim();
    const saleNum = saleRaw === "" ? 0 : Number(saleRaw);

    if (Number.isNaN(idNum) || Number.isNaN(normalNum) || Number.isNaN(stockNum)) {
      await appDialog.alert({
        title: "入力エラー",
        message: "ID・通常価格・在庫は数値で入力してください",
      });
      setIsSaving(false);
      return;
    }

    if (saleRaw !== "" && Number.isNaN(saleNum)) {
      await appDialog.alert({
        title: "入力エラー",
        message: "セール価格は数値で入力してください",
      });
      setIsSaving(false);
      return;
    }

    if (saleNum > 0 && saleNum >= normalNum) {
      await appDialog.alert({
        title: "入力エラー",
        message:
          "セール価格は通常価格より安い値を入力してください。\n" +
          "SALEにしない場合はセール価格を空欄にしてください。",
      });
      setIsSaving(false);
      return;
    }

    if (!urlId) {
      await appDialog.alert({
        title: "エラー",
        message: "商品のIDが不正です",
      });
      setIsSaving(false);
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
        setIsSaving(false);
        return;
      }
      if (leadMaxRaw === "" || leadMaxNum == null || Number.isNaN(leadMaxNum) || leadMaxNum < 0) {
        await appDialog.alert({ title: "入力エラー", message: "発送商品では発送目安（最長）の入力が必要です（0以上の整数）" });
        setIsSaving(false);
        return;
      }
      if (leadMinNum > leadMaxNum) {
        await appDialog.alert({ title: "入力エラー", message: "発送目安は「最短 ≦ 最長」になるよう入力してください" });
        setIsSaving(false);
        return;
      }
    }

    const priceToSave = saleNum > 0 ? saleNum : normalNum;
    const originalToSave = saleNum > 0 ? normalNum : null;

    const { error } = await supabase
      .from("products")
      .update({
        id: idNum,
        name: name.trim(),
        price: priceToSave,
        original_price: originalToSave,
        stock: stockNum,
        member_price: memberPrice.trim() === "" ? null : Math.floor(Number(memberPrice)),
        earn_points: Math.max(0, Math.floor(Number(earnPoints || 0) || 0)),
        cost: cost.trim() === "" ? null : Math.max(0, Math.floor(Number(cost))),
        max_per_order: maxPerOrder.trim() === "" ? null : Math.max(1, Math.floor(Number(maxPerOrder))),
        expiry_alert_days: alertDays.trim() === "" ? 30 : Math.max(1, Math.floor(Number(alertDays))),
        is_shipping: isShipping,
        shipping_lead_min: isShipping ? leadMinNum : null,
        shipping_lead_max: isShipping ? leadMaxNum : null,
        shipping_lead_unit: isShipping ? shippingLeadUnit : "business_days",
      })
      .eq("id", urlId);

    if (error) {
      await appDialog.alert({
        title: "更新失敗",
        message: "商品更新に失敗しました: " + error.message,
      });
      console.error(error);
      setIsSaving(false);
      return;
    }

    await appDialog.alert({
      title: "更新完了",
      message: "商品を更新しました！",
    });
    navigate("/admin-page");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="ae-page">
      <header className="ae-header">
        <button className="ae-back" onClick={() => navigate("/admin-page")} aria-label="戻る">
          ←
        </button>
        <div className="ae-header-title">
          <h2>商品編集</h2>
          <p>商品ID: <strong>{urlId}</strong></p>
        </div>
      </header>

      <main className="ae-card">
        <div className="ae-section-title">
          <h3>基本情報</h3>
          <p>必要な項目を更新して保存してください</p>
        </div>

        {/* 商品名 */}
        <div className="ae-field">
          <label className="ae-label">商品名</label>
          <input
            className="ae-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            placeholder="例:NAGAZON ステッカー"
          />
        </div>

        {/* 通常価格・在庫（2列） */}
        <div className="ae-grid2">
          <div className="ae-field">
            <label className="ae-label">通常価格</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={normalPrice}
                onChange={(e) => setNormalPrice(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="0"
              />
              <span className="ae-suffix">円</span>
            </div>
          </div>

          <div className="ae-field">
            <label className="ae-label">在庫数（ロット管理で自動計算）</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={stock}
                type="number"
                inputMode="numeric"
                readOnly
              />
              <span className="ae-suffix">個</span>
            </div>
            <div className="ae-help">
              在庫はここでは変更できません。<br />
              <b>増やすとき</b>は「商品管理」画面の入荷（<b>原価と賞味期限を登録</b>）から行ってください。<br />
              <b>減らすとき</b>は同画面の<b>理由と対象ロット</b>を指定してください。
            </div>
            <button
              type="button"
              className="ae-input"
              style={{ marginTop: 8, cursor: "pointer" }}
              onClick={() => navigate("/admin-page")}
            >
              商品管理（入荷・在庫の操作）を開く
            </button>
          </div>

          <div className="ae-input-wrap">
            <label>会員価格（ログイン時の価格・未入力なら通常価格）</label>
            <input
              className="ae-input"
              type="number"
              inputMode="numeric"
              placeholder="会員価格"
              value={memberPrice}
              onChange={(e) => setMemberPrice(e.target.value)}
            />
          </div>

          <div className="ae-input-wrap">
            <label>購入時付与ポイント（pt）</label>
            <input
              className="ae-input"
              type="number"
              inputMode="numeric"
              placeholder="例: 10"
              value={earnPoints}
              onChange={(e) => setEarnPoints(e.target.value)}
            />
          </div>

          <div className="ae-input-wrap">
            <label>仕入れ原価（1個あたり・円／任意）</label>
            <input
              className="ae-input"
              type="number"
              inputMode="numeric"
              placeholder="例: 80"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>

          <div className="ae-input-wrap">
            <label>1回のお会計での購入上限（個・空欄=無制限）</label>
            <input
              className="ae-input"
              type="number"
              inputMode="numeric"
              placeholder="例: 3"
              value={maxPerOrder}
              onChange={(e) => setMaxPerOrder(e.target.value)}
            />
          </div>

          <div className="ae-input-wrap">
            <label>賞味期限アラートの日数（既定30日）</label>
            <input
              className="ae-input"
              type="number"
              inputMode="numeric"
              placeholder="30"
              value={alertDays}
              onChange={(e) => setAlertDays(e.target.value)}
            />
          </div>

          <div className="ae-field">
            <label className="ae-label">受渡方法</label>
            <label className="ae-shipping-toggle">
              <input
                type="checkbox"
                checked={isShipping}
                onChange={(e) => setIsShipping(e.target.checked)}
              />
              <span>発送商品（購入時に配送先の住所・電話番号が必要）</span>
            </label>
            <div className="ae-help">
              オフ（未チェック）は「その場受け取り」として販売します
            </div>

            {isShipping && (
              <div className="ae-field">
                <label className="ae-label">発送目安<span className="ae-required">必須</span></label>
                <div className="ae-ship-lead-row">
                  <input
                    className="ae-input"
                    type="number"
                    min={0}
                    placeholder="最短"
                    value={shippingLeadMin}
                    onChange={(e) => setShippingLeadMin(e.target.value)}
                  />
                  <span className="ae-ship-lead-sep">〜</span>
                  <input
                    className="ae-input"
                    type="number"
                    min={0}
                    placeholder="最長"
                    value={shippingLeadMax}
                    onChange={(e) => setShippingLeadMax(e.target.value)}
                  />
                  <select
                    className="ae-input ae-ship-unit"
                    value={shippingLeadUnit}
                    onChange={(e) => setShippingLeadUnit(e.target.value as "business_days" | "days")}
                  >
                    <option value="business_days">営業日</option>
                    <option value="days">日</option>
                  </select>
                </div>
                <div className="ae-help">
                  発送商品では必須項目です。例:「最短3〜最長5・営業日」→ 「ご注文から3〜5営業日以内に発送」と商品詳細に表示
                </div>
              </div>
            )}
          </div>
        </div>
 
        {/* ✅ SALE設定 */}
        <div className="ae-sale">
          <div className="ae-sale-head">
            <div>
              <div className="ae-sale-title">SALE設定</div>
              <div className="ae-sale-desc">
                セール価格を入力すると、その金額で販売されます。空欄なら通常価格で販売。
              </div>
            </div>
            {saleInfo.isSale && (
              <span className="ae-sale-badge">SALE {saleInfo.discountRate}%OFF</span>
            )}
          </div>

          <div className="ae-field">
            <label className="ae-label">セール価格(実際に販売される価格)</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="SALEにしない場合は空欄"
              />
              <span className="ae-suffix">円</span>
            </div>
          </div>

          {saleInfo.isSale ? (
            <div className="ae-sale-preview">
              <div className="ae-sale-preview-row">
                <span className="ae-sale-preview-label">通常価格</span>
                <span className="ae-sale-preview-old">¥{formatYen(saleInfo.normalNum)}</span>
              </div>
              <div className="ae-sale-preview-row">
                <span className="ae-sale-preview-label">販売価格</span>
                <span className="ae-sale-preview-new">¥{formatYen(saleInfo.saleNum)}</span>
              </div>
              <div className="ae-sale-preview-row ae-sale-preview-total">
                <span className="ae-sale-preview-label">割引額</span>
                <span className="ae-sale-preview-save">
                  ¥{formatYen(saleInfo.discountYen)} OFF({saleInfo.discountRate}%)
                </span>
              </div>
            </div>
          ) : salePrice.trim() !== "" && Number(salePrice) > 0 ? (
            <div className="ae-sale-warn">
              セール価格は通常価格より安い値を入力してください。
            </div>
          ) : null}
        </div>

        {/* ID変更 */}
        <div className="ae-danger">
          <button
            type="button"
            className="ae-danger-toggle"
            onClick={() => setOpenIdEdit((v) => !v)}
          >
            {openIdEdit ? "▲ 商品ID変更を閉じる" : "▼ 商品ID変更(注意)"}
          </button>

          {openIdEdit && (
            <div className="ae-danger-body">
              <p className="ae-danger-text">
                商品IDの変更はリンク切れや参照ズレの原因になります。必要な場合のみ変更してください。
              </p>

              <div className="ae-field">
                <label className="ae-label">商品ID</label>
                <input
                  className="ae-input"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="例:101"
                />
              </div>
            </div>
          )}
        </div>

        <div className="ae-bottom-space" />
      </main>

      <footer className="ae-footer">
        <button className="ae-save" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存する"}
        </button>
      </footer>
    </div>
  );
}
