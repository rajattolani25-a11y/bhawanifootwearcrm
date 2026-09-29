import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Plus, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { waLink } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/coupons")({
  head: () => ({ meta: [{ title: "Rewards & Coupons — SoleStack POS" }, { name: "description", content: "Create shop coupons, customer-only codes and track loyalty rewards." }, { property: "og:title", content: "Rewards & Coupons — SoleStack POS" }, { property: "og:description", content: "Custom coupon codes and loyalty rewards for BHAWANI FOOTWEAR." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Coupons,
});

type Coupon = { id: string; code: string; title: string; kind: string; value: number; max_discount: number | null; min_bill: number; starts_at: string | null; expires_at: string | null; usage_limit: number | null; used_count: number; customer_id: string | null; active: boolean; created_at: string; customers: { name: string; mobile: string } | null };

const randomCode = () => "BF" + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
const describe = (c: Pick<Coupon, "kind" | "value" | "max_discount" | "min_bill">) =>
  `${c.kind === "percent" ? `${c.value}% off${c.max_discount ? ` (max ${inr(c.max_discount)})` : ""}` : `${inr(c.value)} off`}${Number(c.min_bill) > 0 ? ` on bills above ${inr(c.min_bill)}` : ""}`;

function Coupons() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"coupons" | "rewards">("coupons");
  const { data: shop } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("store_settings").select("*").eq("id", 1).single()).data });
  const { data: coupons = [] } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => { const { data, error } = await supabase.from("coupons").select("*,customers(name,mobile)").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data as unknown as Coupon[]; },
  });
  const { data: rewards = [] } = useQuery({
    queryKey: ["loyalty-rewards-all"], enabled: tab === "rewards",
    queryFn: async () => { const { data, error } = await supabase.from("loyalty_rewards").select("id,card,milestone,amount,status,expires_at,unlocked_at,customers(name,mobile)").order("unlocked_at", { ascending: false }).limit(300); if (error) throw error; return data as unknown as { id: string; card: string; milestone: number; amount: number; status: string; expires_at: string; customers: { name: string; mobile: string } | null }[]; },
  });

  const now = Date.now();
  const status = (c: Coupon) => !c.active ? "Paused" : c.expires_at && new Date(c.expires_at).getTime() < now ? "Expired" : c.usage_limit !== null && c.used_count >= c.usage_limit ? "Used up" : c.starts_at && new Date(c.starts_at).getTime() > now ? "Scheduled" : "Live";
  const shopName = shop?.business_name || "BHAWANI FOOTWEAR";
  const message = (c: Coupon) => [`Dear ${c.customers?.name || "Customer"},`, "", `Here is your ${shopName} coupon: *${c.code}*`, `${describe(c)}.`, c.expires_at ? `Valid till ${new Date(c.expires_at).toLocaleDateString("en-IN")}.` : "", "Show this code at billing.", "", "See you at the store!"].filter((x) => x !== "").join("\n");

  async function toggle(c: Coupon) {
    const { error } = await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["coupons"] });
  }

  return (
    <div>
      <PageHeader title="Rewards & Coupons" subtitle="Apne coupons banao — sab ke liye ya ek customer ke liye. Billing par code daalte hi discount lag jayega." actions={isOwner && <Button className="h-11" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New coupon</Button>} />
      <div className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {(["coupons", "rewards"] as const).map((t) => <Button key={t} size="sm" variant={tab === t ? "default" : "ghost"} onClick={() => setTab(t)}>{t === "coupons" ? `Coupons (${coupons.length})` : "Loyalty rewards"}</Button>)}
      </div>

      {tab === "coupons" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coupons.map((c) => {
            const st = status(c);
            return (
              <div key={c.id} className="relative overflow-hidden rounded-xl border bg-card">
                <div className="flex items-stretch">
                  <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed bg-primary px-2 py-4 text-primary-foreground">
                    <Ticket className="h-5 w-5" />
                    <p className="mt-1 font-display text-xl font-bold leading-none">{c.kind === "percent" ? `${c.value}%` : inr(c.value)}</p>
                    <p className="text-[10px] uppercase tracking-widest">off</p>
                  </div>
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <button className="font-mono text-base font-bold tracking-wider" onClick={() => { void navigator.clipboard?.writeText(c.code); toast.success("Code copied"); }}>{c.code} <Copy className="inline h-3 w-3 text-muted-foreground" /></button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st === "Live" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{st}</span>
                    </div>
                    {c.title && <p className="truncate text-sm font-medium">{c.title}</p>}
                    <p className="text-xs text-muted-foreground">{describe(c)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.customers ? `Only for ${c.customers.name} (${c.customers.mobile})` : "Any customer"} · Used {c.used_count}{c.usage_limit !== null ? `/${c.usage_limit}` : " · no limit"}
                      {c.expires_at ? ` · till ${new Date(c.expires_at).toLocaleDateString("en-IN")}` : " · no expiry"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {c.customers && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={waLink(c.customers.mobile, message(c))} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Send</a></Button>}
                      {isOwner && <label className="ml-auto flex items-center gap-1.5 text-xs">Active <Switch checked={c.active} onCheckedChange={() => toggle(c)} /></label>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!coupons.length && <p className="text-sm text-muted-foreground">Abhi koi coupon nahi. {isOwner ? '"New coupon" se pehla code banao.' : "Owner coupons bana sakte hain."}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Customer</th><th className="p-2">Card</th><th className="p-2">Milestone</th><th className="p-2">Status</th><th className="p-2">Valid till</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody>{rewards.map((r) => <tr key={r.id} className="border-t"><td className="p-2">{r.customers?.name} <span className="text-xs text-muted-foreground">{r.customers?.mobile}</span></td><td className="p-2 capitalize">{r.card}</td><td className="p-2">{r.milestone} stamps</td><td className="p-2 capitalize">{r.status === "active" && new Date(r.expires_at).getTime() < now ? "expired" : r.status}</td><td className="p-2">{new Date(r.expires_at).toLocaleDateString("en-IN")}</td><td className="p-2 text-right font-semibold">{inr(r.amount)}</td></tr>)}</tbody>
          </table>
          {!rewards.length && <p className="p-4 text-sm text-muted-foreground">Stamp milestones (5/10/20) par rewards yahan dikhenge.</p>}
        </div>
      )}
      {isOwner && <NewCoupon open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewCoupon({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: randomCode(), title: "", kind: "flat", value: "", max_discount: "", min_bill: "", expires: "", usage_limit: "", mobile: "" });
  const [cust, setCust] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function findCustomer(m: string) {
    const clean = m.replace(/\D/g, "");
    setCust(null);
    if (clean.length !== 10) return;
    const { data } = await supabase.from("customers").select("id,name").eq("mobile", clean).maybeSingle();
    if (data) setCust(data); else toast.error("Is mobile ka customer nahi mila");
  }

  async function save() {
    const code = f.code.trim().toUpperCase().replace(/\s+/g, "");
    const value = Number(f.value);
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) { toast.error("Code 3–20 letters/numbers ka rakho"); return; }
    if (!(value > 0) || (f.kind === "percent" && value > 100)) { toast.error("Sahi discount value do"); return; }
    if (f.mobile.trim() && !cust) { toast.error("Customer mobile check karo"); return; }
    setBusy(true);
    const { error } = await supabase.from("coupons").insert({
      code, title: f.title.trim(), kind: f.kind, value,
      max_discount: f.kind === "percent" && Number(f.max_discount) > 0 ? Number(f.max_discount) : null,
      min_bill: Math.max(0, Number(f.min_bill) || 0),
      expires_at: f.expires ? new Date(`${f.expires}T23:59:59+05:30`).toISOString() : null,
      usage_limit: Number(f.usage_limit) > 0 ? Math.floor(Number(f.usage_limit)) : null,
      customer_id: cust?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message.includes("duplicate") ? "Ye code pehle se hai" : error.message); return; }
    toast.success(`Coupon ${code} ready`);
    qc.invalidateQueries({ queryKey: ["coupons"] });
    setF({ code: randomCode(), title: "", kind: "flat", value: "", max_discount: "", min_bill: "", expires: "", usage_limit: "", mobile: "" });
    setCust(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New coupon</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Code</Label><div className="flex gap-2"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono uppercase" /><Button variant="outline" onClick={() => setF({ ...f, code: randomCode() })}>New</Button></div></div>
          <div className="col-span-2 space-y-1"><Label>Title (optional)</Label><Input value={f.title} onChange={set("title")} placeholder="Diwali offer, Birthday gift…" /></div>
          <div className="space-y-1"><Label>Type</Label><select value={f.kind} onChange={set("kind")} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="flat">Flat ₹ off</option><option value="percent">% off</option></select></div>
          <div className="space-y-1"><Label>{f.kind === "percent" ? "Percent %" : "Amount ₹"}</Label><Input value={f.value} onChange={set("value")} inputMode="decimal" /></div>
          {f.kind === "percent" && <div className="space-y-1"><Label>Max discount ₹</Label><Input value={f.max_discount} onChange={set("max_discount")} inputMode="decimal" placeholder="No cap" /></div>}
          <div className="space-y-1"><Label>Minimum bill ₹</Label><Input value={f.min_bill} onChange={set("min_bill")} inputMode="decimal" placeholder="No minimum" /></div>
          <div className="space-y-1"><Label>Valid till</Label><Input type="date" value={f.expires} onChange={set("expires")} /></div>
          <div className="space-y-1"><Label>Use limit</Label><Input value={f.usage_limit} onChange={set("usage_limit")} inputMode="numeric" placeholder="Unlimited" /></div>
          <div className="col-span-2 space-y-1"><Label>Only for customer (mobile, optional)</Label><Input value={f.mobile} maxLength={10} inputMode="numeric" onChange={(e) => { setF({ ...f, mobile: e.target.value }); void findCustomer(e.target.value); }} placeholder="Blank = any customer" />{cust && <p className="text-xs text-success">Coupon sirf {cust.name} ke liye chalega</p>}</div>
        </div>
        <p className="text-xs text-muted-foreground">Khaali chhodo to koi limit nahi — na expiry, na minimum, na use limit.</p>
        <Button onClick={save} disabled={busy} className="h-11">{busy ? "Saving…" : "Create coupon"}</Button>
      </DialogContent>
    </Dialog>
  );
}
