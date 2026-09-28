import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  ),
});

function AppShell() {
  const { user, role, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = MODULES.filter((m) => !m.ownerOnly || isOwner);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {items.map((m) => (
        <Link
          key={m.to}
          to={m.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
        >
          <m.icon className="h-4 w-4" />
          {m.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-sidebar-border p-3">
      <div className="px-3 pb-2">
        <p className="truncate text-sm text-sidebar-accent-foreground">{user?.email}</p>
        <p className="text-xs uppercase tracking-wide text-sidebar-primary">{role ?? "…"}</p>
      </div>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="px-6 py-5 font-display text-lg font-semibold text-sidebar-accent-foreground">SoleStack</div>
        {nav}
        {footer}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar">
            <div className="flex items-center justify-between px-6 py-5">
              <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">SoleStack</span>
              <button onClick={() => setOpen(false)} className="text-sidebar-foreground"><X className="h-5 w-5" /></button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-6 w-6" /></button>
          <span className="font-display font-semibold">SoleStack POS</span>
        </header>
        <main className={cn("flex-1 p-4 md:p-8")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
