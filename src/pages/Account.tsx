import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

function Account() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  // ユーザー読み込み
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(profileData);

      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setOrders(orderData || []);
    };

    load();
  }, []);

  // ログアウト
  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // アカウント削除（安全版）
  const deleteAccount = async () => {
    if (!confirm("本当にアカウントを削除しますか？")) return;

    const { error } = await supabase.rpc("delete_user");
    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }

    alert("アカウントを削除しました");
    navigate("/");
  };

  return (
    <div className="account-page">
      <h2>アカウント情報</h2>

      {profile && (
        <>
          <p><b>名前：</b> {profile.name}</p>
          <p><b>メール：</b> {profile.email}</p> {/* ← 修正済み */}
        </>
      )}

      <h3>購入履歴</h3>

      {orders.length === 0 ? (
        <p>購入履歴がありません</p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="order-item">
            <p>商品ID: {o.product_id}</p>
            <p>数量: {o.quantity}</p>
            <p>日時: {o.created_at}</p>
          </div>
        ))
      )}

      <button onClick={() => navigate("/")}>ホームへ戻る</button>
      <button onClick={logout}>ログアウト</button>
      <button onClick={deleteAccount} style={{ color: "red" }}>
        アカウント削除
      </button>
    </div>
  );
}

export default Account;