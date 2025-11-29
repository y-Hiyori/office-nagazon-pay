// src/pages/PurchaseComplete.tsx
import { useNavigate, useParams } from "react-router-dom";
import "./PurchaseComplete.css";

function PurchaseComplete() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="complete-page">
      <h2>ご購入ありがとうございます！</h2>

      <p>注文番号：{id}</p>

      <div className="complete-box">
        <p>お支払いが完了しました。</p>
        <p>商品をお取りください。</p>
      </div>

      <button className="home-btn" onClick={() => navigate("/")}>
        ホームに戻る
      </button>
    </div>
  );
}

export default PurchaseComplete;