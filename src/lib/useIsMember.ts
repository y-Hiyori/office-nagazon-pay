import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ログイン中（会員）かどうかを判定するフック（ゲストは false）
export function useIsMember() {
  const [isMember, setIsMember] = useState(false);
  useEffect(() => {
    let on = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (on) setIsMember(!!data?.user);
      })
      .catch(() => {
        if (on) setIsMember(false);
      });
    return () => {
      on = false;
    };
  }, []);
  return isMember;
}
