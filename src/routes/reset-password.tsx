import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — SoleStack POS" },
      { name: "description", content: "Set a new password for your SoleStack POS account." },
      { property: "og:title", content: "Reset password — SoleStack POS" },
      { property: "og:description", content: "Set a new password for your SoleStack POS account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    let alive = true;
    async function check() {
      // The reset link carries recovery tokens in the URL address. The auth
      // client reads them when the page loads and turns them into a short
      // session, which is what lets us set a new password below.
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setReady(!!data.session);
      setChecking(false);
    }
    check();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      toast.error("Both passwords must match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Password updated. You are signed in.");
      window.history.replaceState(null, "", window.location.pathname);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <p className="font-display text-xl font-semibold">SoleStack POS</p>
        <div>
          <h1 className="text-4xl font-bold leading-tight text-sidebar-accent-foreground">
            Locked out?
            <br /> No bill lost.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Set a new password and get back to the counter. Your stock, bills and customers stay exactly as they were.
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/50">Footwear Retail OS</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">Set a new password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the reset link from your email, then type the new password twice.
          </p>

          {checking ? (
            <p className="mt-6 text-sm text-muted-foreground">Checking your reset link…</p>
          ) : ready ? (
            <form onSubmit={submit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  minLength={6}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input
                  id="pw2"
                  type="password"
                  minLength={6}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? "Please wait…" : "Save new password"}
              </Button>
            </form>
          ) : (
            <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium text-foreground">This link is not valid any more.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Reset links expire after some time and work only once. Request a fresh link from the sign-in page.
              </p>
              <Link
                to="/auth"
                className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
