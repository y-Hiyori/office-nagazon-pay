// src/pages/AdminEdit.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminEdit.css";
import { appDialog } from "../lib/appDialog"; // ✅ 追加

export default function AdminEdit() {
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadProduct = async () => {
    if (!urlId) {
      await appDialog.alert({ title: "エラー", message: "商品のIDが不正です" });
      navigate("/admin-page");
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, stock")
      .eq("id", urlId)
      .maybeSingle();

    if (error || !data) {
      await appDialog.alert({ title: "エラー", message: "商品が見つかりません" });
      navigate("/admin-page");
      return;
    }

    setEditId(String(data.id));
    setName(data.name);
    setPrice(String(data.price));
    setStock(String(data.stock));
    setLoading(false);
  };

  useEffect(() => {
    loadProduct();
  }, [urlId]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    if (!editId || !name || !price || !stock) {
      await appDialog.alert({
        title: "入力エラー",
        message: "すべての項目を入力してください",
      });
      setIsSaving(false);
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({
        id: Number(editId),
        name: name.trim(),
        price: Number(price),
        stock: Number(stock),
      })
      .eq("id", urlId);

    if (error) {
      await appDialog.alert({
        title: "更新失敗",
        message: error.message,
      });
      setIsSaving(false);
      return;
    }

    await appDialog.alert({
      title: "更新完了",
      message: "商品を更新しました",
    });

    navigate("/admin-page");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="ae-page">
      <header className="ae-header">
        <button className="ae-back" onClick={() => navigate("/admin-page")}>
          ←
        </button>
        <h2>商品編集</h2>
      </header>

      <div className="ae-card">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} />
        <input value={stock} onChange={(e) => setStock(e.target.value)} />
      </div>

      <footer className="ae-footer">
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存する"}
        </button>
      </footer>
    </div>
  );
}