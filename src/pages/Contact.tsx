import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./Contact.css";

function Contact() {
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

  const [showConfirm, setShowConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // ✅ URLクエリから自動入力（最初の1回だけ）
  useEffect(() => {
    const qsOrderId = q.get("orderId") || "";
    const qsSubject = q.get("subject") || "";
    const qsDetail = q.get("detail") || "";

    // ユーザーが既に打ってたら上書きしない
    if (!orderId && qsOrderId) setOrderId(qsOrderId);
    if (!subject && qsSubject) setSubject(qsSubject);
    if (!detail && qsDetail) setDetail(qsDetail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", user.id)
        .single();

      if (!error && profile) {
        if (profile.name) setName(profile.name);
        if (profile.email) setEmail(profile.email);
      }
    };
    load();
  }, []);

  const handleClickSend = () => {
    if (!name || !email || !subject || !detail) {
      alert("名前・メールアドレス・用件・詳細をすべて入力してください。");
      return;
    }
    if (detail.trim().length < 10) {
      alert("詳細は10文字以上で入力してください。");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    if (isSending) return;
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
          hp, // ✅ honeypot
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("send-contact-email failed:", res.status, json);
        alert("送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      setShowConfirm(false);
      alert("お問い合わせを送信しました。");

      setSubject("");
      setDetail("");
      setOrderId("");
      setHp("");

      navigate("/");
    } catch (e) {
      console.error("お問い合わせ送信エラー:", e);
      alert("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="contact-page-wrap">
      <SiteHeader />

      <main className="contact-page">
        <div className="contact-head">
          <h2 className="contact-title">お問い合わせ</h2>
        </div>

        <div className="contact-card">
          {/* honeypot（CSSで隠す。display:noneでもOK） */}
          <input
            type="text"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            autoComplete="off"
            tabIndex={-1}
            style={{ display: "none" }}
          />

          <div className="contact-field">
            <label>お名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
            />
          </div>

          <div className="contact-field">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
            />
          </div>

          <div className="contact-field">
            <label>用件</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="購入時、支払い時のトラブルなど"
            />
          </div>

          <div className="contact-field">
            <label>注文ID（任意）</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="例: 9b5d3024-xxxx... （わかれば）"
            />
          </div>

          <div className="contact-field">
            <label>詳細</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={6}
              placeholder="お問い合わせの内容を詳しくご記入ください。（10文字以上）"
            />
          </div>

          <button className="contact-send-btn" onClick={handleClickSend} disabled={isSending}>
            {isSending ? "送信中..." : "送信"}
          </button>
        </div>

        {showConfirm && (
          <div className="contact-modal-overlay">
            <div className="contact-modal">
              <h3>本当に送信しますか？</h3>
              <p>入力内容を確認のうえ、「はい、送信する」を押してください。</p>

              <div className="contact-modal-buttons">
                <button className="contact-modal-main" onClick={handleConfirmSend} disabled={isSending}>
                  {isSending ? "送信中..." : "はい、送信する"}
                </button>
                <button className="contact-modal-sub" onClick={() => setShowConfirm(false)} disabled={isSending}>
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

export default Contact;