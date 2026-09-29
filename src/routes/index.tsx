import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SoleStack POS — Footwear Retail OS" },
      { name: "description", content: "Billing, size-wise stock, customers and loyalty for footwear shops." },
      { property: "og:title", content: "SoleStack POS — Footwear Retail OS" },
      { property: "og:description", content: "Billing, size-wise stock, customers and loyalty for footwear shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar">
      <p className="font-display text-2xl font-semibold text-sidebar-foreground">SoleStack POS</p>
    </div>
  );
}
