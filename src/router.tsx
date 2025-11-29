import { createBrowserRouter } from "react-router-dom";
import App from "./App";

// ▼ 一般ユーザー画面
import Home from "./pages/Home";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import CartPage from "./pages/CartPage";
import Checkout from "./pages/Checkout";

// ▼ アカウントメニュー
import AccountMenu from "./pages/AccountMenu";
import AccountEdit from "./pages/AccountEdit";
import OrdersList from "./pages/OrdersList";
import OrderDetail from "./pages/OrderDetail";

// ▼ 認証
import AuthSelect from "./pages/AuthSelect";
import Signup from "./pages/Signup";
import Login from "./pages/Login";

// ▼ 管理者
import AdminLogin from "./pages/AdminLogin";
import AdminMenu from "./pages/AdminMenu";
import AdminPage from "./pages/AdminPage";
import AdminAdd from "./pages/AdminAdd";
import AdminDetail from "./pages/AdminDetail";
import AdminEdit from "./pages/AdminEdit";

import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";

// ⭐ 新しく作る購入履歴ページ（管理者用）
import AdminUserOrders from "./pages/AdminUserOrders";

import PurchaseComplete from "./pages/PurchaseComplete";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      // 一般ユーザー
      { index: true, element: <Home /> },
      { path: "products", element: <ProductList /> },
      { path: "product/:id", element: <ProductDetail /> },
      { path: "cart", element: <CartPage /> },

      // 購入フロー
      { path: "checkout", element: <Checkout /> },

      // アカウント
      { path: "account", element: <AccountMenu /> },
      { path: "account-edit", element: <AccountEdit /> },

      // 購入履歴（ユーザー）
      { path: "orders", element: <OrdersList /> },
      { path: "orders/:id", element: <OrderDetail /> },

      // 認証
      { path: "auth", element: <AuthSelect /> },
      { path: "signup", element: <Signup /> },
      { path: "login", element: <Login /> },

      // 管理者
      { path: "admin-login", element: <AdminLogin /> },
      { path: "admin-menu", element: <AdminMenu /> },
      { path: "admin-page", element: <AdminPage /> },
      { path: "admin-add", element: <AdminAdd /> },
      { path: "admin-detail/:id", element: <AdminDetail /> },
      { path: "admin-edit/:id", element: <AdminEdit /> },

      // 管理者：ユーザー管理
      { path: "admin-users", element: <AdminUsers /> },
      { path: "admin-user-detail/:id", element: <AdminUserDetail /> },

      // ⭐ 管理者：ユーザーの購入履歴一覧
      { path: "admin-user-orders/:id", element: <AdminUserOrders /> },

      // 購入完了
      { path: "purchase-complete/:id", element: <PurchaseComplete /> },

      // 404
      { path: "*", element: <p>ページが見つかりません</p> },
    ],
  },
]);

export default router;