import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "staff" | null;
type AuthState = { user: User | null; role: Role; isOwner: boolean; loading: boolean };

const AuthCtx = createContext<AuthState>({ user: null, role: null, isOwner: false, loading: true });

// Role is cached per user so the app opens instantly on repeat visits.
const ROLE_KEY = "solestack-role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, isOwner: false, loading: true });

  useEffect(() => {
    let active = true;
    async function load(u: User | null) {
      if (!u) {
        setState({ user: null, role: null, isOwner: false, loading: false });
        return;
      }
      const cached = localStorage.getItem(`${ROLE_KEY}:${u.id}`) as Role;
      if (cached) setState({ user: u, role: cached, isOwner: cached === "owner", loading: false });
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
      if (!active) return;
      const roles = (data ?? []).map((r) => r.role);
      const role: Role = roles.includes("owner") ? "owner" : roles.includes("staff") ? "staff" : null;
      if (role) localStorage.setItem(`${ROLE_KEY}:${u.id}`, role);
      setState({ user: u, role, isOwner: role === "owner", loading: false });
    }
    supabase.auth.getSession().then(({ data }) => load(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => load(session?.user ?? null), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
