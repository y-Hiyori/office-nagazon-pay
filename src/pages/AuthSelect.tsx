import { useNavigate } from "react-router-dom";

function AuthSelect() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        padding: 30,
        maxWidth: 400,
        margin: "80px auto",
        background: "white",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        position: "relative",
        textAlign: "center",
      }}
    >
      {/* ← 戻る */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "#f2f2f2",
          padding: "8px 14px",
          borderRadius: 12,
          border: "none",
          fontSize: 16,
        }}
      >
        ← 戻る
      </button>

      <h2 style={{ marginTop: 40, marginBottom: 30, fontSize: 24 }}>アカウント</h2>

      {/* ログイン */}
      <button
        onClick={() => navigate("/login")}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 12,
          background: "#007aff",
          color: "white",
          border: "none",
          fontSize: 18,
          marginBottom: 15,
        }}
      >
        ログイン
      </button>

      {/* 新規作成 */}
      <button
        onClick={() => navigate("/signup")}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 12,
          background: "#4CAF50",
          color: "white",
          border: "none",
          fontSize: 18,
        }}
      >
        新規アカウント作成
      </button>
    </div>
  );
}

export default AuthSelect;