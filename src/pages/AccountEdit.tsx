import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AccountEdit.css";
import { appDialog } from "../lib/appDialog";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  is_admin?: boolean | null;
};

export default function AccountEdit() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialName, setInitialName] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [initialProfileEmail, setInitialProfileEmail] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("getUser error:", userError);
        setError("ログイン情報の取得に失敗しました");
        setLoading(false);
        return;
      }

      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }

      setUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("profiles select error:", profileError);
        setError("プロフィールの読み込みに失敗しました");
        setLoading(false);
        return;
      }

      if (!profile) {
        setError("プロフィールが見つかりませんでした");
        setLoading(false);
        return;
      }

      const safeProfile = profile as ProfileRow;
      const nextName = String(safeProfile.name ?? "");
      const nextProfileEmail = String(safeProfile.email ?? "");
      const nextEmail = String(nextProfileEmail || user.email || "");

      setName(nextName);
      setEmail(nextEmail);
      setInitialName(nextName);
      setInitialEmail(nextEmail);
      setInitialProfileEmail(nextProfileEmail);
      setLoading(false);
    };

    load();
  }, [navigate]);

  const hasChanges = useMemo(() => {
    return name.trim() !== initialName.trim() || email.trim() !== initialEmail.trim();
  }, [email, initialEmail, initialName, name]);

  const handleSave = async () => {
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!userId) {
      await appDialog.alert({ title: "エラー", message: "ユーザー情報が見つかりません" });
      return;
    }

    if (!trimmedName) {
      await appDialog.alert({ title: "入力エラー", message: "お名前を入力してください" });
      return;
    }

    if (!trimmedEmail) {
      await appDialog.alert({ title: "入力エラー", message: "メールアドレスを入力してください" });
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      await appDialog.alert({ title: "入力エラー", message: "正しいメールアドレスを入力してください" });
      return;
    }

    setSaving(true);

    try {
      const emailChanged = trimmedEmail !== initialEmail.trim();
      const profileEmailChanged = trimmedEmail !== initialProfileEmail.trim();
      const nameChanged = trimmedName !== initialName.trim();

      if (!emailChanged) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({
            name: trimmedName,
            email: trimmedEmail,
          })
          .eq("id", userId);

        if (profileUpdateError) {
          await appDialog.alert({
            title: "更新に失敗しました",
            message: profileUpdateError.message,
          });
          return;
        }

        setInitialName(trimmedName);
        setInitialEmail(trimmedEmail);
        setInitialProfileEmail(trimmedEmail);
        setName(trimmedName);
        setEmail(trimmedEmail);

        await appDialog.alert({
          title: "更新完了",
          message: "アカウント情報を更新しました。",
        });

        navigate("/account");
        return;
      }

      if (nameChanged) {
        const { error: nameUpdateError } = await supabase
          .from("profiles")
          .update({ name: trimmedName })
          .eq("id", userId);

        if (nameUpdateError) {
          await appDialog.alert({
            title: "更新に失敗しました",
            message: nameUpdateError.message,
          });
          return;
        }

        setInitialName(trimmedName);
        setName(trimmedName);
      }

      const { error: authUpdateError } = await supabase.auth.updateUser({
        email: trimmedEmail,
      });

      if (authUpdateError) {
        await appDialog.alert({
          title: "メール更新に失敗しました",
          message: nameChanged
            ? `お名前は更新しましたが、メール変更は失敗しました。${authUpdateError.message}`
            : authUpdateError.message,
        });
        return;
      }

      if (profileEmailChanged) {
        const { error: profileEmailSyncError } = await supabase
          .from("profiles")
          .update({ email: trimmedEmail })
          .eq("id", userId);

        if (profileEmailSyncError) {
          await appDialog.alert({
            title: "一部更新に失敗しました",
            message:
              "ログイン用メールの更新処理は実行されましたが、プロフィール表示用メールの同期に失敗しました。もう一度保存してください。\n" +
              profileEmailSyncError.message,
          });
          return;
        }
      }

      setInitialName(trimmedName);
      setInitialEmail(trimmedEmail);
      setInitialProfileEmail(trimmedEmail);
      setName(trimmedName);
      setEmail(trimmedEmail);

      await appDialog.alert({
        title: "更新完了",
        message:
          trimmedEmail !== initialEmail.trim()
            ? "アカウント情報を更新しました。メール変更時は確認メールが送られる場合があります。"
            : "アカウント情報を更新しました。",
      });

      navigate("/account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-edit-wrap">
      <SiteHeader />

      <main className="account-edit-main">
        <section className="account-edit-shell">
          <div className="account-edit-card">
            <button className="acc-edit-back" onClick={() => navigate("/account")} type="button">
              ← 戻る
            </button>

            <div className="account-edit-head">
              <p className="account-edit-eyebrow">ACCOUNT SETTINGS</p>
              <h1 className="acc-edit-title">アカウント編集</h1>
              <p className="account-edit-lead">
                お名前とメールアドレスを更新できます。内容を保存するとアカウント画面へ戻ります。
              </p>
            </div>

            {loading ? (
              <div className="account-edit-state">読み込み中...</div>
            ) : error ? (
              <div className="account-edit-error">{error}</div>
            ) : (
              <>
                <div className="account-edit-fields">
                  <label className="acc-label" htmlFor="account-name">
                    お名前
                  </label>
                  <input
                    id="account-name"
                    className="acc-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="お名前を入力"
                  />

                  <label className="acc-label" htmlFor="account-email">
                    メールアドレス
                  </label>
                  <input
                    id="account-email"
                    className="acc-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@example.com"
                    inputMode="email"
                  />
                </div>

                <div className="account-edit-note">
                  <div className="account-edit-note__item">変更は `profiles` に保存されます。</div>
                  <div className="account-edit-note__item">メール変更時は確認メールが送信される場合があります。</div>
                </div>

                <button
                  className="acc-edit-save"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  type="button"
                >
                  {saving ? "保存中..." : hasChanges ? "変更を保存する" : "変更はありません"}
                </button>
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
