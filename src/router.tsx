// src/router.tsx

import { createBrowserRouter } from "react-router-dom";
import App from "./App";

// ▼ 一般ユーザー画面
import Home from "./pages/Home";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import CartPage from "./pages/CartPage";
import Checkout from "./pages/Checkout";
import Contact from "./pages/Contact";

// ▼ アカウントメニュー
import AccountMenu from "./pages/AccountMenu";
import AccountEdit from "./pages/AccountEdit";
import OrdersList from "./pages/OrdersList";
import OrderDetail from "./pages/OrderDetail";

// ▼ 認証
import AuthSelect from "./pages/AuthSelect";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

// ▼ 管理者
import AdminLogin from "./pages/AdminLogin";
import AdminMenu from "./pages/AdminMenu";
import AdminPage from "./pages/AdminPage";
import AdminAdd from "./pages/AdminAdd";
import AdminDetail from "./pages/AdminDetail";
import AdminEdit from "./pages/AdminEdit";

import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";

// 管理者：ユーザーの購入履歴一覧
import AdminUserOrders from "./pages/AdminUserOrders";

// 管理者：売上状況ページ
import AdminSales from "./pages/AdminSales";

// ⭐ 管理者：売上一覧から「この商品を買ったユーザー」ページ ← 追加
import AdminSalesProductDetail from "./pages/AdminSalesProductDetail";

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

      // ★ お問い合わせページ
      { path: "contact", element: <Contact /> },

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
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "reset-password", element: <ResetPassword /> },

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

      // 管理者：ユーザーの購入履歴一覧
      { path: "admin-user-orders/:id", element: <AdminUserOrders /> },

      // 管理者：売上状況確認ページ
      { path: "admin-sales", element: <AdminSales /> },

      // ⭐ 管理者：売上一覧からの「この商品を買ったユーザー」ページ
      { path: "admin-sales-product/:name", element: <AdminSalesProductDetail /> },

      // 購入完了
      { path: "purchase-complete/:id", element: <PurchaseComplete /> },

      // 404
      { path: "*", element: <p>ページが見つかりません</p> },
    ],
  },
]);

export default router;