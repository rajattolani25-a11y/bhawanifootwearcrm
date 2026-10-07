import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SoleStack POS" },
      { name: "description", content: "Owner and staff sign in to SoleStack POS." },
      { property: "og:title", content: "Sign in — SoleStack POS" },
      { property: "og:description", content: "Owner and staff sign in to SoleStack POS." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset link sent. Check your email, and the spam folder if it is not in the inbox.");
        setMode("in");
        setPassword("");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else toast.success("Check your email to confirm the account, then sign in.");
      }
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
            Every pair, every size,
            <br /> every counter — in sync.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Owner laptop and staff phones see the same stock and bills instantly.
          </p>
        </div>
        <p className="text-sm text-sidebar-foreground/50">Footwear Retail OS</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-bold">
              {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Forgot password"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "in"
                ? "Owner or staff login."
                : mode === "up"
                  ? "New accounts can open the shop app only after the Owner approves them."
                  : "Enter your email and we will send a link to set a new password."}
            </p>
          </div>
          {mode === "up" && (
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="h-11" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
          </div>
          {mode !== "reset" && (
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
            </div>
          )}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "in"
                ? "Sign in"
                : mode === "up"
                  ? "Create account"
                  : "Send reset link"}
          </Button>
          {mode === "in" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </button>
          )}
          {mode === "reset" && (
            <button
              type="button"
              onClick={() => setMode("in")}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Remembered it? Back to sign in
            </button>
          )}
          {mode !== "reset" && (
            <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-sm text-muted-foreground hover:text-foreground">
              {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
