// src/components/AdminRoute.tsx
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appDialog } from "../lib/appDialog";
import Loading from "./Loading";

type AdminRouteProps = {
  children: ReactNode;
};

function AdminRoute({ children }: AdminRouteProps) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  // ✅ 管理画面共通のスタイル（押しやすさ・余白）を当てるためのクラス
  useEffect(() => {
    document.body.classList.add("is-admin-page");
    return () => document.body.classList.remove("is-admin-page");
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      // ① ログインしているか
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        await appDialog.alert({ message: "ログインしてください" });
        navigate("/auth"); // 認証トップへ
        return;
      }

      // ② 管理者かどうか
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.is_admin) {
        await appDialog.alert({ message: "このページは管理者専用です" });
        navigate("/"); // 一般トップへ
        return;
      }

      setAllowed(true);
      setChecking(false);
    };

    checkAdmin();
  }, [navigate]);

  if (checking && !allowed) {
    return <Loading variant="full" label="管理者権限を確認中" />;
  }

  return <>{children}</>;
}

export default AdminRoute;