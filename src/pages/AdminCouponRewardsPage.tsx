import { useEffect, useMemo, useState } from "react";
import AdminHeader from "../components/AdminHeader";
import { supabase } from "../lib/supabase";
import "./AdminCouponRewardsPage.css";
import { appDialog } from "../lib/appDialog";

type Reward = {
  id: string;
  is_active: boolean;
  store_name: string;
  store_info: string;
  product_name: string;
  score_threshold: number;
  coupon_title: string;
  description: string;
  valid_from: string | null;
  valid_to: string | null;
  redeem_password_hash: string | null; // ✅ 追加
  created_at: string;
  updated_at: string;
};

type RewardForm = Omit<Reward, "id" | "created_at" | "updated_at" | "redeem_password_hash"> & {
  redeem_password: string; // ✅ UI入力（平文はDBに保存しない）
};

const emptyForm: RewardForm = {
  is_active: true,
  store_name: "",
  store_info: "",
  product_name: "",
  score_threshold: 1000,
  coupon_title: "クーポン",
  description: "",
  valid_from: null,
  valid_to: null,
  redeem_password: "",
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminCouponRewardsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Reward[]>([]);
  const [form, setForm] = useState<RewardForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupon_rewards")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as Reward[]);
    setLoading(false);
  };

  useEffect(() => {
    document.body.classList.add("adminRewardsBody");
    void load();
    return () => document.body.classList.remove("adminRewardsBody");
  }, []);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const onEdit = (r: Reward) => {
    setEditingId(r.id);
    setForm({
      is_active: r.is_active,
      store_name: r.store_name,
      store_info: r.store_info,
      product_name: r.product_name,
      score_threshold: r.score_threshold,
      coupon_title: r.coupon_title,
      description: r.description,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      redeem_password: "", // ✅ 編集時は空（空なら変更しない）
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (id: string) => {
    const ok = await appDialog.confirm({
      title: "削除確認",
      message: "このクーポン設定を削除しますか？（元に戻せません）",
      okText: "削除する",
      cancelText: "キャンセル",
    });
    if (!ok) return;

    const { error } = await supabase.from("coupon_rewards").delete().eq("id", id);
    if (error) {
      await appDialog.alert({
        title: "削除エラー",
        message: String(error.message),
        okText: "OK",
      });
      return;
    }
    await load();
  };

  const onSave = async () => {
    try {
      setSaving(true);

      if (!form.store_name.trim() || !form.product_name.trim()) {
        await appDialog.alert({
          title: "入力不足",
          message: "店名と商品名は必須です。",
          okText: "OK",
        });
        return;
      }

      // ✅ 新規作成はパスワード必須（編集は空なら変更しない）
      const pw = form.redeem_password.trim();
      if (!isEditing && pw.length < 4) {
        await appDialog.alert({
          title: "入力不足",
          message: "パスワードは4文字以上で設定してください。",
          okText: "OK",
        });
        return;
      }

      // ✅ DBに送るpayload（平文は入れない）
      const basePayload = {
        is_active: form.is_active,
        store_name: form.store_name,
        store_info: form.store_info,
        product_name: form.product_name,
        score_threshold: form.score_threshold,
        coupon_title: form.coupon_title,
        description: form.description,
        valid_from: form.valid_from,
        valid_to: form.valid_to,
      };

      // パスワード入力がある場合だけ hash を更新
      const payload =
        pw.length >= 4
          ? {
              ...basePayload,
              redeem_password_hash: await sha256Hex(pw),
            }
          : basePayload;

      if (isEditing) {
        const { error } = await supabase.from("coupon_rewards").update(payload).eq("id", editingId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupon_rewards").insert(payload);
        if (error) throw error;
      }

      await load();
      reset();

      await appDialog.alert({
        title: "保存完了",
        message: "保存しました。",
        okText: "OK",
      });
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e && "message" in e ? String((e as any).message) : String(e);
      await appDialog.alert({
        title: "保存エラー",
        message: msg,
        okText: "OK",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adminRewardsPageRoot">
      <AdminHeader />
      <div className="adminHeaderSpacer" />

      <main className="adminRewardsMain">
        <div className="adminRewardsWrap">
          <div className="adminRewardsHead">
            <div>
              <h1 className="adminRewardsTitle">クーポン配布設定</h1>
              <p className="adminRewardsSub">
                ゲームスコアに応じて配布されるクーポン報酬（coupon_rewards）を管理します。
              </p>
            </div>
            <div className="adminRewardsPill" title="管理者のみ操作可能">
              <span className="dot" />
              管理画面
            </div>
          </div>

          <div className="adminRewardsGrid">
            {/* ===== 左：フォーム ===== */}
            <section className="panel">
              <div className="panelHead">
                <div className="panelHeadLeft">
                  <h2>{isEditing ? "編集" : "新規作成"}</h2>
                  <div className="panelSub">必須：店名 / 商品名 /（新規はパスワード）</div>
                </div>
              </div>

              <div className="form">
                {/* 有効スイッチ */}
                <div className="field">
                  <div className="fieldLabel">有効</div>
                  <div className="switchRow">
                    <label className="switch" aria-label="有効/無効">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                      />
                      <span className="slider" />
                    </label>
                    <div className="switchText">有効（配布対象）</div>
                  </div>
                </div>

                <div className="formRow">
                  <label className="field">
                    <div className="fieldLabel">
                      店名 <span className="req">必須</span>
                    </div>
                    <input
                      className="input"
                      value={form.store_name}
                      onChange={(e) => setForm((p) => ({ ...p, store_name: e.target.value }))}
                      placeholder="例：NAGAZON 三宮店"
                    />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">配布スコア（以上）</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={form.score_threshold}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, score_threshold: Number(e.target.value || 0) }))
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">店情報</div>
                  <textarea
                    className="textarea"
                    value={form.store_info}
                    onChange={(e) => setForm((p) => ({ ...p, store_info: e.target.value }))}
                    placeholder="住所 / 営業時間 / 注意事項など"
                  />
                </label>

                <div className="formRow">
                  <label className="field">
                    <div className="fieldLabel">
                      商品名 <span className="req">必須</span>
                    </div>
                    <input
                      className="input"
                      value={form.product_name}
                      onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))}
                      placeholder="例：店内ドリンク100円引き"
                    />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">クーポンタイトル</div>
                    <input
                      className="input"
                      value={form.coupon_title}
                      onChange={(e) => setForm((p) => ({ ...p, coupon_title: e.target.value }))}
                      placeholder="例：ドリンク割引クーポン"
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">説明</div>
                  <textarea
                    className="textarea"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="例：会計時に提示。1回限り。"
                  />
                </label>

                {/* ✅ パスワード（新規必須 / 編集は空で維持） */}
                <label className="field">
                  <div className="fieldLabel">
                    店舗用パスワード{" "}
                    {!isEditing ? <span className="req">必須</span> : <span style={{ opacity: 0.7 }}>（空なら変更しません）</span>}
                  </div>
                  <input
                    className="input"
                    type="password"
                    value={form.redeem_password}
                    onChange={(e) => setForm((p) => ({ ...p, redeem_password: e.target.value }))}
                    placeholder={!isEditing ? "例：1234（4文字以上）" : "変更する時だけ入力"}
                    autoComplete="new-password"
                  />
                </label>

                <div className="formRow">
                  <label className="field">
                    <div className="fieldLabel">有効開始（任意）</div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={form.valid_from ? toLocalInput(form.valid_from) : ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          valid_from: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">有効終了（任意）</div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={form.valid_to ? toLocalInput(form.valid_to) : ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          valid_to: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="actions">
                  <button type="button" className="btn ghost" onClick={reset} disabled={saving}>
                    リセット
                  </button>
                  <button type="button" className="btn primary" onClick={onSave} disabled={saving}>
                    {saving ? "保存中…" : isEditing ? "更新する" : "作成する"}
                  </button>
                </div>
              </div>
            </section>

            {/* ===== 右：一覧 ===== */}
            <section className="panel">
              <div className="panelHead">
                <div className="panelHeadLeft">
                  <h2>一覧</h2>
                  <div className="panelSub">全 {rows.length} 件</div>
                </div>
              </div>

              <div className="list">
                {loading ? (
                  <div className="empty">読み込み中…</div>
                ) : rows.length === 0 ? (
                  <div className="empty">まだありません</div>
                ) : (
                  rows.map((r) => (
                    <div className="item" key={r.id}>
                      <div className="itemLeft">
                        <div className="itemTop">
                          <div className="itemTitle">
                            {r.store_name}
                            <span className="sep">/</span>
                            {r.product_name}
                          </div>
                          <div className={`status ${r.is_active ? "on" : "off"}`}>
                            {r.is_active ? "ON" : "OFF"}
                          </div>
                        </div>

                        <div className="itemMeta">
                          <div className="metaChip">しきい値：{r.score_threshold}</div>
                          <div className="metaChip">{r.coupon_title}</div>
                          <div className="metaChip">
                            パスワード：{r.redeem_password_hash ? "設定済み" : "未設定"}
                          </div>
                        </div>
                      </div>

                      <div className="itemRight">
                        <button type="button" className="btn small" onClick={() => onEdit(r)}>
                          編集
                        </button>
                        <button type="button" className="btn small danger" onClick={() => onDelete(r.id)}>
                          削除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="note">
                ※動かない場合：coupon_rewards の RLS が「管理者のみ select/insert/update/delete」になっているか確認。
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}