// src/pages/Contact.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import emailjs from "@emailjs/browser";
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
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    if (isSending) return;
    setIsSending(true);

    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID as string,
        import.meta.env.VITE_EMAILJS_CONTACT_TEMPLATE_ID as string,
        {
          contact_name: name,
          contact_email: email,
          contact_subject: subject,
          contact_message: detail,
          contact_order_id: orderId || "（未入力）",
        },
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string
      );

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
              placeholder="お問い合わせの内容を詳しくご記入ください。"
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