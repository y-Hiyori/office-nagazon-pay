// src/components/AdminRoute.tsx
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AdminRouteProps = {
  children: ReactNode;
};

function AdminRoute({ children }: AdminRouteProps) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      // ① ログインしているか
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("ログインしてください");
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
        alert("このページは管理者専用です");
        navigate("/"); // 一般トップへ
        return;
      }

      setAllowed(true);
      setChecking(false);
    };

    checkAdmin();
  }, [navigate]);

  if (checking && !allowed) {
    return <p style={{ padding: 20 }}>確認中…</p>;
  }

  return <>{children}</>;
}

export default AdminRoute;