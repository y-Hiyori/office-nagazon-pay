// src/pages/Contact.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./Contact.css";

function Contact() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [orderId, setOrderId] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // ✅ honeypot（画面には出さない）
  const [hp, setHp] = useState("");

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

  const isValidEmail = (v: string) => {
    const s = v.trim();
    return s.includes("@") && s.length <= 254;
  };

  const handleClickSend = () => {
    if (!name.trim() || !email.trim() || !subject.trim() || !detail.trim()) {
      alert("名前・メールアドレス・用件・詳細をすべて入力してください。");
      return;
    }
    if (!isValidEmail(email)) {
      alert("メールアドレスの形式が正しくありません。");
      return;
    }
    if (subject.trim().length > 120) {
      alert("用件は120文字以内で入力してください。");
      return;
    }
    if (detail.trim().length < 10) {
      alert("詳細は10文字以上で入力してください。");
      return;
    }
    if (detail.trim().length > 4000) {
      alert("詳細は4000文字以内で入力してください。");
      return;
    }
    if (orderId.trim().length > 100) {
      alert("注文IDは100文字以内で入力してください。");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    if (isSending) return;
    setIsSending(true);

    try {
      const r = await fetch("/api/send-contact-email", {
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

      const json = await r.json().catch(() => null);

      if (!r.ok) {
        console.error("contact api error:", r.status, json);
        alert("送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      setShowConfirm(false);
      alert("お問い合わせを送信しました。");

      setSubject("");
      setDetail("");
      setOrderId("");

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
          {/* ✅ honeypot（見えないフィールド） */}
          <div style={{ position: "absolute", left: "-10000px", top: "auto" }} aria-hidden="true">
            <label>Leave this field empty</label>
            <input value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} />
          </div>

          <div className="contact-field">
            <label>お名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              maxLength={80}
            />
          </div>

          <div className="contact-field">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              maxLength={254}
            />
          </div>

          <div className="contact-field">
            <label>用件</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="購入時、支払い時のトラブルなど"
              maxLength={120}
            />
          </div>

          <div className="contact-field">
            <label>注文ID（任意）</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="例: 9b5d3024-xxxx... （わかれば）"
              maxLength={100}
            />
          </div>

          <div className="contact-field">
            <label>詳細</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={6}
              placeholder="お問い合わせの内容を詳しくご記入ください。"
              maxLength={4000}
            />
          </div>

          <button
            className="contact-send-btn"
            onClick={handleClickSend}
            disabled={isSending}
          >
            {isSending ? "送信中..." : "送信"}
          </button>
        </div>

        {/* 確認モーダル */}
        {showConfirm && (
          <div className="contact-modal-overlay">
            <div className="contact-modal">
              <h3>本当に送信しますか？</h3>
              <p>入力内容を確認のうえ、「はい、送信する」を押してください。</p>

              <div className="contact-modal-buttons">
                <button
                  className="contact-modal-main"
                  onClick={handleConfirmSend}
                  disabled={isSending}
                >
                  {isSending ? "送信中..." : "はい、送信する"}
                </button>
                <button
                  className="contact-modal-sub"
                  onClick={() => setShowConfirm(false)}
                  disabled={isSending}
                >
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