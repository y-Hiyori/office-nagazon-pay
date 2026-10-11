// src/components/UserRoute.tsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { ReactNode } from "react";
import Loading from "./Loading";

type Props = {
  children: ReactNode;
};

export default function UserRoute({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setIsAuthed(!!data.user);
      } catch {
        if (!alive) return;
        setIsAuthed(false);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <Loading variant="full" label="ログイン状態を確認中" />;
  if (!isAuthed) return <Navigate to="/auth" replace />;

  return <>{children}</>;
}