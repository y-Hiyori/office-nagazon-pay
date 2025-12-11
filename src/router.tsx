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
import HowTo from "./pages/HowTo";

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
import AuthCallback from "./pages/AuthCallback";

// ▼ 管理者
import AdminLogin from "./pages/AdminLogin";
import AdminMenu from "./pages/AdminMenu";
import AdminPage from "./pages/AdminPage";
import AdminAdd from "./pages/AdminAdd";
import AdminDetail from "./pages/AdminDetail";
import AdminEdit from "./pages/AdminEdit";
import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminUserOrders from "./pages/AdminUserOrders";
import AdminSales from "./pages/AdminSales";
import AdminSalesProductDetail from "./pages/AdminSalesProductDetail";

import PurchaseComplete from "./pages/PurchaseComplete";

// ★ 管理者専用ルートガード
import AdminRoute from "./components/AdminRoute";

// ▼ PayPay
import PayPaySim from "./pages/PayPaySim";
// ★ 決済完了後に戻ってくるページ（これから作る用）
import PayPayReturn from "./pages/PayPayReturn";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      // ===== 一般ユーザー =====
      { index: true, element: <Home /> },
      { path: "products", element: <ProductList /> },
      { path: "product/:id", element: <ProductDetail /> },
      { path: "cart", element: <CartPage /> },

      // 購入フロー
      { path: "checkout", element: <Checkout /> },

      // ★ PayPay決済テスト画面
      { path: "paypay-sim", element: <PayPaySim /> },

      // ★ PayPay 決済完了後の戻り先
      { path: "paypay-return", element: <PayPayReturn /> },

      // 使い方・問い合わせ
      { path: "how-to", element: <HowTo /> },
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
      { path: "auth/callback", element: <AuthCallback /> },

      // ===== 管理者 =====
      // ログイン画面だけはガードなし
      { path: "admin-login", element: <AdminLogin /> },

      {
        path: "admin-menu",
        element: (
          <AdminRoute>
            <AdminMenu />
          </AdminRoute>
        ),
      },
      {
        path: "admin-page",
        element: (
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        ),
      },
      {
        path: "admin-add",
        element: (
          <AdminRoute>
            <AdminAdd />
          </AdminRoute>
        ),
      },
      {
        path: "admin-detail/:id",
        element: (
          <AdminRoute>
            <AdminDetail />
          </AdminRoute>
        ),
      },
      {
        path: "admin-edit/:id",
        element: (
          <AdminRoute>
            <AdminEdit />
          </AdminRoute>
        ),
      },

      // 管理者：ユーザー管理
      {
        path: "admin-users",
        element: (
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        ),
      },
      {
        path: "admin-user-detail/:id",
        element: (
          <AdminRoute>
            <AdminUserDetail />
          </AdminRoute>
        ),
      },
      {
        path: "admin-user-orders/:id",
        element: (
          <AdminRoute>
            <AdminUserOrders />
          </AdminRoute>
        ),
      },

      // 管理者：売上
      {
        path: "admin-sales",
        element: (
          <AdminRoute>
            <AdminSales />
          </AdminRoute>
        ),
      },
      {
        path: "admin-sales-product/:name",
        element: (
          <AdminRoute>
            <AdminSalesProductDetail />
          </AdminRoute>
        ),
      },

      // 購入完了
      { path: "purchase-complete/:id", element: <PurchaseComplete /> },

      // 404
      { path: "*", element: <p>ページが見つかりません</p> },
    ],
  },
]);

export default router;