import { useNavigate } from "react-router-dom";

function PayPaySim() {
  const navigate = useNavigate();

  const handleComplete = () => {
    alert("（テスト）PayPayの支払いが完了しました！");
    navigate("/"); // 完了後どこに戻すかはお好みで
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "80px 16px 24px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
        background: "#f3f4f6",
      }}
    >
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffffcc",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #e5e7eb",
          zIndex: 10,
        }}
      >
        <button
          style={{
            position: "absolute",
            left: 14,
            padding: "7px 14px",
            borderRadius: 999,
            border: "none",
            background: "#f4f4f4",
            cursor: "pointer",
          }}
          onClick={() => navigate(-1)}
        >
          ←
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>PayPay決済（テスト）</h2>
      </header>

      <main style={{ marginTop: 70 }}>
        <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 16 }}>
          これはテスト用の画面です。本番では実際の PayPay 決済画面に切り替わります。
        </p>

        {/* ここにダミーのQR画像とか入れてもOK（今は枠だけ） */}
        <div
          style={{
            width: "100%",
            maxWidth: 260,
            height: 260,
            margin: "0 auto 20px",
            borderRadius: 16,
            background: "#e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          PayPay QR（テスト表示）
        </div>

        <button
          onClick={handleComplete}
          style={{
            width: "100%",
            maxWidth: 320,
            display: "block",
            margin: "0 auto",
            padding: "14px 0",
            borderRadius: 999,
            border: "none",
            fontSize: 16,
            fontWeight: 600,
            background:
              "linear-gradient(135deg, #ff4646, #ff8a00)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          支払い完了（テスト）
        </button>
      </main>
    </div>
  );
}

export default PayPaySim;