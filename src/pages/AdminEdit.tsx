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
      .select("id, name, price, original_price, stock")
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
            <label className="ae-label">在庫数</label>
            <div className="ae-input-wrap">
              <input
                className="ae-input"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="0"
              />
              <span className="ae-suffix">個</span>
            </div>
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
