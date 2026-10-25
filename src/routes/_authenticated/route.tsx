import { InterfaceMotion } from "@/components/motion/provider";
import premium from "@/components/premium.module.css";
import { useShop } from "@/hooks/use-shop";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { ThemeControl } from "@/components/ThemeControl";
import { GuidedTour } from "@/components/GuidedTour";
import { MessageLanguage } from "@/components/MessageLanguage";
import { LanguageProvider, useLang } from "@/lib/i18n";
import styles from "./workspace.module.css";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => (
    <AuthProvider>
      <InterfaceMotion><LanguageProvider><AppShell /></LanguageProvider></InterfaceMotion>
    </AuthProvider>
  ),
});

function AppShell() {
  const shopName = useShop().name;
  const { user, role, isOwner, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useLang();
  const items = MODULES.filter((m) => !m.ownerOnly || isOwner);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (!loading && user && !role) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-3 rounded-xl border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold">{t("Waiting for owner approval")}</h1>
          <p className="text-sm text-muted-foreground">{t("Your account is created. The shop owner must approve it in Settings before you can open the app.")}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"><LogOut className="h-4 w-4" /> {t("Sign out")}</button>
        </div>
      </div>
    );
  }

  const nav = (
    <nav className={`${styles["navigation"]} flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2`}>
      {items.map((m) => (
        <Link
          key={m.to}
          to={m.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
        >
          <m.icon className="h-4 w-4" />
          {t(m.label)}
        </Link>
      ))}
    </nav>
  );

  const footer = (
      <div className="border-t border-sidebar-border p-2.5">
        <div className="flex items-start gap-1 px-2 pb-2">
          <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-sidebar-accent-foreground">{user?.email}</p>
        <p className="text-xs uppercase tracking-wide text-sidebar-primary">{role ?? "…"}</p>
          </div>
          <ThemeControl compact />
      </div>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <LogOut className="h-4 w-4" /> {t("Sign out")}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-5 py-4">
          <p className="font-display text-base font-bold text-sidebar-accent-foreground">SoleStack<span className="text-sidebar-primary">.</span></p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{shopName}</p>
        </div>
        {nav}
        {footer}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-dvh w-64 max-w-[calc(100vw-32px)] flex-col bg-sidebar pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-6 py-5">
              <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">SoleStack</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-11 w-11 place-items-center text-sidebar-foreground"><X className="h-5 w-5" /></button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`${styles["mobileHeader"]} sticky top-0 z-30 flex items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:hidden`}>
          <button onClick={() => setOpen(true)} aria-label="Menu" className="grid h-11 min-w-11 place-items-center"><Menu className="h-6 w-6" /></button>
          <span className="font-display font-semibold">SoleStack POS</span>
        </header>
        <main className={cn(styles["content"], premium["workspace"], "min-h-0 flex-1 p-3 md:p-5")}>
          <Outlet />
        </main>
        <GuidedTour />
        <MessageLanguage />
      </div>
    </div>
  );
}
