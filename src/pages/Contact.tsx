import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./Contact.css";

type Errors = Partial<Record<"name" | "email" | "subject" | "detail" | "orderId", string>>;

function isEmailLike(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function Contact() {
  const navigate = useNavigate();
  const location = useLocation();
  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [orderId, setOrderId] = useState("");

  // honeypot（通常ユーザーは触らない）
  const [hp, setHp] = useState("");

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [globalError, setGlobalError] = useState<string>("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // ✅ URLクエリから自動入力（最初の1回だけ）
  useEffect(() => {
    const qsOrderId = q.get("orderId") || "";
    const qsSubject = q.get("subject") || "";
    const qsDetail = q.get("detail") || "";

    if (!orderId && qsOrderId) setOrderId(qsOrderId);
    if (!subject && qsSubject) setSubject(qsSubject);
    if (!detail && qsDetail) setDetail(qsDetail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ✅ ログインしてたらプロフィールから自動入力
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", user.id)
        .single();

      if (profile?.name) setName(profile.name);
      if (profile?.email) setEmail(profile.email);
    };
    load();
  }, []);

  const validate = (vals?: Partial<{ name: string; email: string; subject: string; detail: string; orderId: string }>) => {
    const v = {
      name,
      email,
      subject,
      detail,
      orderId,
      ...(vals || {}),
    };

    const e: Errors = {};

    if (!v.name.trim()) e.name = "お名前を入力してください。";
    if (!v.email.trim()) e.email = "メールアドレスを入力してください。";
    else if (!isEmailLike(v.email)) e.email = "メールアドレスの形式が正しくありません。";

    if (!v.subject.trim()) e.subject = "用件を入力してください。";

    const d = v.detail.trim();
    if (!d) e.detail = "詳細を入力してください。";
    else if (d.length < 10) e.detail = "詳細は10文字以上で入力してください。";

    // 注文IDは任意（ただし入れるなら軽くチェック）
    const oid = v.orderId.trim();
    if (oid && oid.length < 6) e.orderId = "注文IDが短すぎます（未入力でもOK）。";

    return e;
  };

  const markTouchedAll = () => {
    setTouched({
      name: true,
      email: true,
      subject: true,
      detail: true,
      orderId: true,
    });
  };

  const openConfirmIfValid = () => {
    setGlobalError("");
    const e = validate();
    setErrors(e);

    if (Object.keys(e).length > 0) {
      markTouchedAll();
      // 先頭のエラーへスクロール
      window.setTimeout(() => {
        const first = document.querySelector(".contact-field.is-error");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    if (isSending) return;

    setGlobalError("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      markTouchedAll();
      setShowConfirm(false);
      return;
    }

    setIsSending(true);

    try {
      const res = await fetch("/api/send-contact-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: name.trim(),
          contact_email: email.trim(),
          contact_subject: subject.trim(),
          contact_message: detail.trim(),
          contact_order_id: orderId.trim() || "（未入力）",
          hp, // honeypot
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("send-contact-email failed:", res.status, json);
        setGlobalError("送信に失敗しました。時間をおいて再度お試しください。");
        setShowConfirm(false);
        return;
      }

      setSentOk(true);
      setShowConfirm(false);

      // 入力リセット（名前/メールは残す派ならここは消してOK）
      setSubject("");
      setDetail("");
      setOrderId("");
      setHp("");
      setTouched({});
      setErrors({});

      // 少し見せてから戻す
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      console.error("お問い合わせ送信エラー:", err);
      setGlobalError("送信に失敗しました。ネットワーク状況を確認してください。");
      setShowConfirm(false);
    } finally {
      setIsSending(false);
    }
  };

  const onBlur = (key: keyof Errors) => {
    setTouched((p) => ({ ...p, [key]: true }));
    const e = validate();
    setErrors(e);
  };

  const fieldError = (key: keyof Errors) => {
    return (touched[key] ? errors[key] : "") || "";
  };

  return (
    <div className="contact-page-wrap">
      <SiteHeader />

      <main className="contact-page">
        <div className="contact-head">
          <h2 className="contact-title">お問い合わせ</h2>
          <p className="contact-sub">
            送信内容はサポートに届きます。購入や決済のトラブルは「注文ID」があると早いです。
          </p>
        </div>

        <div className="contact-card" aria-busy={isSending ? "true" : "false"}>
          {/* honeypot（CSSで隠す） */}
          <input
            type="text"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            autoComplete="off"
            tabIndex={-1}
            className="contact-hp"
            aria-hidden="true"
          />

          {globalError && (
            <div className="contact-alert is-error" role="alert">
              <span className="contact-alert-dot" />
              {globalError}
            </div>
          )}

          {sentOk && (
            <div className="contact-alert is-ok" role="status">
              <span className="contact-alert-dot" />
              送信しました。トップへ戻ります…
            </div>
          )}

          <div className={`contact-field ${fieldError("name") ? "is-error" : ""}`}>
            <label>
              お名前 <span className="contact-req">必須</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => onBlur("name")}
              placeholder="山田 太郎"
              autoComplete="name"
            />
            {fieldError("name") ? <div className="contact-help is-error">{fieldError("name")}</div> : null}
          </div>

          <div className={`contact-field ${fieldError("email") ? "is-error" : ""}`}>
            <label>
              メールアドレス <span className="contact-req">必須</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => onBlur("email")}
              placeholder="example@example.com"
              autoComplete="email"
              inputMode="email"
            />
            {fieldError("email") ? <div className="contact-help is-error">{fieldError("email")}</div> : null}
          </div>

          <div className={`contact-field ${fieldError("subject") ? "is-error" : ""}`}>
            <label>
              用件 <span className="contact-req">必須</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => onBlur("subject")}
              placeholder="購入時、支払い時のトラブルなど"
            />
            {fieldError("subject") ? <div className="contact-help is-error">{fieldError("subject")}</div> : null}
          </div>

          <div className={`contact-field ${fieldError("orderId") ? "is-error" : ""}`}>
            <label>注文ID（任意）</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onBlur={() => onBlur("orderId")}
              placeholder="例: 9b5d3024-xxxx..."
            />
            {fieldError("orderId") ? (
              <div className="contact-help is-error">{fieldError("orderId")}</div>
            ) : (
              <div className="contact-help">購入後の画面/メールにあるIDです。</div>
            )}
          </div>

          <div className={`contact-field ${fieldError("detail") ? "is-error" : ""}`}>
            <label>
              詳細 <span className="contact-req">必須</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onBlur={() => onBlur("detail")}
              rows={7}
              placeholder="内容を詳しく説明してください。"
            />
            {fieldError("detail") ? (
              <div className="contact-help is-error">{fieldError("detail")}</div>
            ) : (
              <div className="contact-help">状況・日時・端末・表示されたエラー内容があると解決が早いです。</div>
            )}
          </div>

          <button className="contact-send-btn" onClick={openConfirmIfValid} disabled={isSending || sentOk} type="button">
            {isSending ? (
              <span className="contact-btn-inline">
                <span className="contact-spinner" aria-hidden="true" />
                送信中…
              </span>
            ) : (
              "送信"
            )}
          </button>

          <button
            className="contact-sub-btn"
            onClick={() => navigate("/", { replace: true })}
            disabled={isSending}
            type="button"
          >
            戻る
          </button>
        </div>

        {showConfirm && (
          <div className="contact-modal-overlay" role="presentation" onClick={() => !isSending && setShowConfirm(false)}>
            <div className="contact-modal" role="dialog" aria-modal="true" aria-label="送信確認" onClick={(e) => e.stopPropagation()}>
              <h3>この内容で送信しますか？</h3>

              <div className="contact-confirm-box">
                <div className="contact-confirm-row">
                  <span>お名前</span>
                  <b>{name.trim()}</b>
                </div>
                <div className="contact-confirm-row">
                  <span>メール</span>
                  <b>{email.trim()}</b>
                </div>
                <div className="contact-confirm-row">
                  <span>用件</span>
                  <b>{subject.trim()}</b>
                </div>
                <div className="contact-confirm-row">
                  <span>注文ID</span>
                  <b>{orderId.trim() || "（未入力）"}</b>
                </div>
                <div className="contact-confirm-msg">
                  <span>詳細</span>
                  <pre>{detail.trim()}</pre>
                </div>
              </div>

              <div className="contact-modal-buttons">
                <button className="contact-modal-main" onClick={handleConfirmSend} disabled={isSending} type="button">
                  {isSending ? (
                    <span className="contact-btn-inline">
                      <span className="contact-spinner" aria-hidden="true" />
                      送信中…
                    </span>
                  ) : (
                    "はい、送信する"
                  )}
                </button>
                <button className="contact-modal-sub" onClick={() => setShowConfirm(false)} disabled={isSending} type="button">
                  戻る
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}