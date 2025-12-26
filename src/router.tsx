// src/router.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";

// ===== 一般ユーザー画面 =====
import Home from "./pages/Home";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import CartPage from "./pages/CartPage";
import Checkout from "./pages/Checkout";
import Contact from "./pages/Contact";
import HowTo from "./pages/HowTo";
import Tokushoho from "./pages/Tokushoho";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import PurchaseComplete from "./pages/PurchaseComplete";

// ===== アカウント =====
import AccountMenu from "./pages/AccountMenu";
import AccountEdit from "./pages/AccountEdit";
import OrdersList from "./pages/OrdersList";
import OrderDetail from "./pages/OrderDetail";

// ===== 認証 =====
import AuthSelect from "./pages/AuthSelect";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";

// ===== 管理者 =====
import AdminMenu from "./pages/AdminMenu";
import AdminPage from "./pages/AdminPage";
import AdminAdd from "./pages/AdminAdd";
import AdminDetail from "./pages/AdminDetail";
import AdminEdit from "./pages/AdminEdit";
import AdminUsers from "./pages/AdminUsers";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminUserOrders from "./pages/AdminUserOrders";
import AdminOrderDetail from "./pages/AdminOrderDetail";
import AdminSales from "./pages/AdminSales";
import AdminSalesProductDetail from "./pages/AdminSalesProductDetail";
import AdminCoupons from "./pages/AdminCoupons";
import AdminCouponEdit from "./pages/AdminCouponEdit";

// ===== ルートガード =====
import AdminRoute from "./components/AdminRoute";
import UserRoute from "./components/UserRoute";

// ===== PayPay =====
import PayPaySim from "./pages/PayPaySim";
import PayPayReturn from "./pages/PayPayReturn";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      // ---- Public（ログイン不要）
      { index: true, element: <Home /> },
      { path: "products", element: <ProductList /> },
      { path: "products/:id", element: <ProductDetail /> },
      { path: "product/:id", element: <ProductDetail /> }, // 互換
      { path: "cart", element: <CartPage /> },
      { path: "how-to", element: <HowTo /> },
      { path: "contact", element: <Contact /> },
      { path: "tokushoho", element: <Tokushoho /> },
      { path: "privacy", element: <PrivacyPolicy /> },

      // PayPay（戻りはログイン無しでも来る可能性あるのでガード無し推奨）
      { path: "paypay-sim", element: <PayPaySim /> },
      { path: "paypay-return", element: <PayPayReturn /> },

      // ---- Auth（ログイン不要）
      { path: "auth", element: <AuthSelect /> },
      { path: "signup", element: <Signup /> },
      { path: "login", element: <Login /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "reset-password", element: <ResetPassword /> },
      { path: "auth/callback", element: <AuthCallback /> },

      // ---- User protected（ログイン必須）
      {
        path: "checkout",
        element: (
          <UserRoute>
            <Checkout />
          </UserRoute>
        ),
      },
      {
        path: "account",
        element: (
          <UserRoute>
            <AccountMenu />
          </UserRoute>
        ),
      },
      {
        path: "account-edit",
        element: (
          <UserRoute>
            <AccountEdit />
          </UserRoute>
        ),
      },
      {
        path: "orders",
        element: (
          <UserRoute>
            <OrdersList />
          </UserRoute>
        ),
      },
      {
        path: "orders/:id",
        element: (
          <UserRoute>
            <OrderDetail />
          </UserRoute>
        ),
      },
      {
        path: "purchase-complete/:id",
        element: (
          <UserRoute>
            <PurchaseComplete />
          </UserRoute>
        ),
      },

      // ---- Admin protected
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
      {
        path: "admin-order-detail/:id",
        element: (
          <AdminRoute>
            <AdminOrderDetail />
          </AdminRoute>
        ),
      },
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
      {
        path: "admin-coupons",
        element: (
          <AdminRoute>
            <AdminCoupons />
          </AdminRoute>
        ),
      },
      {
        path: "admin-coupon-new",
        element: (
          <AdminRoute>
            <AdminCouponEdit mode="new" />
          </AdminRoute>
        ),
      },
      {
        path: "admin-coupon-edit/:code",
        element: (
          <AdminRoute>
            <AdminCouponEdit mode="edit" />
          </AdminRoute>
        ),
      },

      // 404
      { path: "*", element: <p>ページが見つかりません</p> },
    ],
  },
]);

export default router;