import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./AccountEdit.css";

// ✅ 追加：アプリ内ダイアログ
import { appDialog } from "../lib/appDialog";

function AccountEdit() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");

  // パスワード編集用
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setUser(user);

      // プロフィール読み込み
      const { data } = await supabase.from("profiles").select("name").eq("id", user.id).single();

      setName(data?.name || "");
    };

    load();
  }, [navigate]);

  // 🔵 保存処理
  const handleSave = async () => {
    if (!name) {
      await appDialog.alert({ title: "入力エラー", message: "名前を入力してください" });
      return;
    }

    // === 1) 名前更新 ===
    const { error: nameError } = await supabase.from("profiles").update({ name }).eq("id", user.id);

    if (nameError) {
      await appDialog.alert({
        title: "保存に失敗しました",
        message: "名前の保存に失敗しました: " + nameError.message,
      });
      return;
    }

    // === 2) パスワード変更 ===
    if (password || passwordConfirm) {
      if (password.length < 6) {
        await appDialog.alert({ title: "入力エラー", message: "パスワードは6文字以上必要です" });
        return;
      }
      if (password !== passwordConfirm) {
        await appDialog.alert({ title: "入力エラー", message: "パスワードが一致しません" });
        return;
      }

      const { error: passError } = await supabase.auth.updateUser({
        password: password,
      });

      if (passError) {
        await appDialog.alert({
          title: "変更に失敗しました",
          message: "パスワード変更に失敗しました: " + passError.message,
        });
        return;
      }
    }

    await appDialog.alert({ title: "完了", message: "保存しました！" });
    navigate("/account");
  };

  return (
    <div className="acc-edit">
      {/* ← 戻るボタン */}
      <button className="acc-edit-back" onClick={() => navigate("/account")}>
        ← アカウント情報へ戻る
      </button>

      <h2 className="acc-edit-title">アカウント編集</h2>

      {/* 名前 */}
      <label className="acc-label">名前</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className="acc-input" placeholder="名前を入力" />

      {/* パスワード */}
      <label className="acc-label" style={{ marginTop: "20px" }}>
        新しいパスワード
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="acc-input"
        placeholder="新しいパスワード"
      />

      <label className="acc-label">パスワード（確認用）</label>
      <input
        type="password"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
        className="acc-input"
        placeholder="もう一度入力"
      />

      {/* 保存ボタン */}
      <button className="acc-edit-save" onClick={handleSave}>
        保存する
      </button>
    </div>
  );
}

export default AccountEdit;