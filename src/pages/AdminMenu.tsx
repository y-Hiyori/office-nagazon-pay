import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import AdminHeader from "../components/AdminHeader";
import "./AdminMenu.css";

type MenuItem = {
  label: string;
  path: string;
  cls?: string;
};

type MenuGroup = {
  title: string;
  note?: string;
  items: MenuItem[];
};

// ✅ v30/v31：項目をグループ分け（ゲーム関連は独立）
const GROUPS: MenuGroup[] = [
  {
    title: "商品・販売",
    items: [
      { label: "商品管理", path: "/admin-page", cls: "is-main" },
      { label: "お知らせ管理", path: "/admin-notices" },
      { label: "クーポン管理", path: "/admin-coupons" },
      { label: "ポイント管理", path: "/admin-points", cls: "is-danger" },
      { label: "売上状況確認", path: "/admin-sales" },
      { label: "ゲスト購入履歴", path: "/admin-guest-orders" },
      { label: "アカウント管理", path: "/admin-users" },
    ],
  },
  {
    title: "ゲーム",
    note: "ゲームのスコアと報酬（クーポン）の設定",
    items: [
      { label: "ゲームスコア管理", path: "/admin-game-scores" },
      { label: "ゲーム報酬設定", path: "/admin-coupon-rewards" },
    ],
  },
];

function AdminMenu() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add("adminmenu-whitebg");
    return () => document.body.classList.remove("adminmenu-whitebg");
  }, []);

  return (
    <>
      <AdminHeader />

      <div className="admin-menu-page">
        <div className="admin-menu-container">
          <h2 className="admin-menu-title">管理者メニュー</h2>

          {GROUPS.map((g) => (
            <section className="admin-menu-group" key={g.title}>
              <h3 className="admin-menu-group-title">
                {g.title}
                {g.note && <span className="admin-menu-group-note">{g.note}</span>}
              </h3>

              <div className="admin-menu-buttons">
                {g.items.map((it) => (
                  <button
                    key={it.path}
                    className={`admin-menu-btn ${it.cls ?? ""}`}
                    onClick={() => navigate(it.path)}
                    type="button"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export default AdminMenu;
