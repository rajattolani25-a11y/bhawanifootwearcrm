import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Crown, MessageCircle, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/modules";
import { waLink } from "@/lib/pos";
import { useShop } from "@/hooks/use-shop";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — SoleStack POS" }, { name: "description", content: "Customer profiles, dues, history and loyalty stamp cards." }, { property: "og:title", content: "Customers — SoleStack POS" }, { property: "og:description", content: "Customer purchase history, balances and loyalty cards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Customers,
});

function Customers() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const [{ data: cs, error }, { data: sales }] = await Promise.all([
        supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(5000),
        supabase.from("sales").select("customer_id,total,due_amount,sale_date").not("customer_id", "is", null).limit(50000),
      ]);
      if (error) throw error;
       const agg = new Map<string, { spend: number; due: number; last: string }>();
      for (const s of sales ?? []) {
         const a = agg.get(s.customer_id!) ?? { spend: 0, due: 0, last: "" };
        a.spend += Number(s.total);
         a.due += Number(s.due_amount);
        if (s.sale_date > a.last) a.last = s.sale_date;
        agg.set(s.customer_id!, a);
      }
       return (cs ?? []).map((c) => ({ ...c, spend: agg.get(c.id)?.spend ?? 0, due: (agg.get(c.id)?.due ?? 0) + Number(c.opening_balance ?? 0), last: agg.get(c.id)?.last ?? "" }));
    },
  });

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return s ? data.filter((c) => c.mobile.includes(s) || c.name.toLowerCase().includes(s)) : data;
  }, [data, q]);

  return (
    <div>
      <PageHeader title="Customers" subtitle="One mobile number = one profile." actions={<Button className="h-11" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add customer</Button>} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mobile or name" className="h-11 pl-9" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
             <tr><th className="p-3">Name</th><th className="p-3">Mobile</th><th className="p-3">Stamps</th><th className="p-3">Last visit</th><th className="p-3 text-right">Due</th><th className="p-3 text-right">Total spend</th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-t hover:bg-muted/50">
                <td className="p-3 font-medium"><span className="flex items-center gap-1.5">{c.name || "—"} {c.is_premium && <Crown className="h-3.5 w-3.5 text-warning" />}</span></td>
                <td className="p-3">{c.mobile}</td>
                <td className="p-3">R {c.regular_stamps} · P {c.premium_stamps}</td>
                <td className="p-3">{c.last ? new Date(c.last).toLocaleDateString("en-IN") : "—"}</td>
                 <td className="p-3 text-right font-semibold text-destructive">{c.due ? inr(c.due) : "—"}</td>
                <td className="p-3 text-right font-semibold">{inr(c.spend)}</td>
              </tr>
            ))}
             {!list.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {openId && <Profile id={openId} onClose={() => setOpenId(null)} />}
      {adding && <AddCustomer onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddCustomer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const [f, setF] = useState({ mobile: "", name: "", shoe_size: "", brand_preference: "" });
  const [opening, setOpening] = useState("");
  async function save() {
    const mobile = f.mobile.replace(/\D/g, "");
    if (mobile.length !== 10) return void toast.error("Enter a 10-digit mobile");
    const { error } = await supabase.from("customers").insert({ ...f, mobile, opening_balance: isOwner ? Math.max(0, Number(opening) || 0) : 0 });
    if (error) return void toast.error(error.message.includes("duplicate") ? "This mobile already has a profile" : error.message);
    toast.success("Customer added");
    qc.invalidateQueries({ queryKey: ["customers"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add customer</DialogTitle></DialogHeader>
        {([["mobile", "Mobile"], ["name", "Name"], ["shoe_size", "Shoe size"], ["brand_preference", "Brand preference"]] as const).map(([k, l]) => (
          <div key={k} className="space-y-1"><Label>{l}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={k === "mobile" ? "numeric" : undefined} /></div>
        ))}
        {isOwner && <div className="space-y-1"><Label>Opening balance due (₹)</Label><Input type="number" min="0" inputMode="decimal" placeholder="Purana udhar, agar hai" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>}
        <Button className="h-11" onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const shop = useShop();
  const [ob, setOb] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [c, sales, rewards, events] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).single(),
         supabase.from("sales").select("id,bill_no,sale_date,total,due_amount,stamp_regular,stamp_premium,reward_amount,sale_items(product_name,size,qty)").eq("customer_id", id).order("sale_date", { ascending: false }),
        supabase.from("loyalty_rewards").select("*").eq("customer_id", id).order("unlocked_at", { ascending: false }),
        supabase.from("loyalty_events").select("id,action,note,created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      return { c: c.data, sales: sales.data ?? [], rewards: rewards.data ?? [], events: events.data ?? [] };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  async function togglePremium(v: boolean) {
    const { error } = await supabase.from("customers").update({ is_premium: v }).eq("id", id);
    error ? toast.error(error.message) : refresh();
  }
  async function rewardAction(rid: string, action: "extend" | "cancel" | "restore") {
    const patch =
      action === "extend" ? { expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), status: "active" }
      : action === "cancel" ? { status: "cancelled" }
      : { status: "active", expires_at: new Date(Date.now() + 30 * 86400000).toISOString() };
    const { error } = await supabase.from("loyalty_rewards").update(patch).eq("id", rid);
    if (error) return void toast.error(error.message);
    const { data: u } = await supabase.auth.getSession();
    await supabase.from("loyalty_events").insert({ reward_id: rid, customer_id: id, action: `owner_${action}`, user_id: u.session!.user.id });
    refresh();
  }

  const c = data?.c;
  const now = Date.now();
  const spend = (data?.sales ?? []).reduce((a, s) => a + Number(s.total), 0);
  const opening = Number(data?.c?.opening_balance ?? 0);
  const due = (data?.sales ?? []).reduce((a, s) => a + Number(s.due_amount), 0) + opening;
  async function saveOpening() {
    const v = Math.max(0, Number(ob) || 0);
    const { error } = await supabase.from("customers").update({ opening_balance: v }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Opening balance saved"); setOb(null); refresh();
  }
  const active = (data?.rewards ?? []).filter((r) => r.status === "active" && new Date(r.expires_at).getTime() > now);
  const past = (data?.rewards ?? []).filter((r) => !active.includes(r));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle className="flex items-center gap-2">{c?.name || "Customer"} {c?.is_premium && <span className="flex items-center gap-1 rounded-full bg-warning/25 px-2 py-0.5 text-xs text-warning-foreground"><Crown className="h-3 w-3" /> Premium member</span>}</SheetTitle></SheetHeader>
        {c && (
          <div className="mt-4 space-y-5 px-1 pb-6">
             <div className="grid grid-cols-3 gap-2 text-center">
              <Stat k="Total spend" v={inr(spend)} />
               <Stat k="Balance due" v={inr(due)} />
              <Stat k="Bills" v={String(data!.sales.length)} />
              <Stat k="Last visit" v={data!.sales[0] ? new Date(data!.sales[0].sale_date).toLocaleDateString("en-IN") : "—"} />
              <Stat k="Regular visits" v={String(c.regular_visits)} />
              <Stat k="Premium visits" v={String(c.premium_visits)} />
               <Stat k="Size / Brand" v={`${c.shoe_size || "—"} / ${c.brand_preference || "—"}`} />
            </div>

            {(opening > 0 || isOwner) && <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span>Opening balance: <b>{inr(opening)}</b></span>
              {isOwner && (ob === null ? <Button size="sm" variant="outline" onClick={() => setOb(String(opening))}>Edit</Button> : <><Input className="h-8 w-28" type="number" min="0" value={ob} onChange={(e) => setOb(e.target.value)} /><Button size="sm" onClick={saveOpening}>Save</Button><Button size="sm" variant="ghost" onClick={() => setOb(null)}>Cancel</Button></>)}
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-success text-success-foreground hover:bg-success/90">
                <a href={waLink(c.mobile, due > 0 ? `Dear ${c.name || "Customer"},\n\nThis is a gentle reminder from ${shop.name}. Your outstanding balance is ${inr(due)}.\nPlease ignore this message if already paid. Thank you.${shop.phone ? `\nCall: ${shop.phone}` : ""}` : `Hello ${c.name || "there"}, greetings from ${shop.name}.${shop.phone ? ` Call / WhatsApp: ${shop.phone}` : ""}`)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp {c.mobile}</a>
              </Button>
              {isOwner && (
                <label className="flex items-center gap-2 rounded-md border px-3 text-sm">Premium membership <Switch checked={c.is_premium} onCheckedChange={togglePremium} /></label>
              )}
            </div>

            <StampCard kind="regular" count={c.regular_stamps} />
            <StampCard kind="premium" count={c.premium_stamps} />

            <div>
              <h3 className="mb-2 font-semibold">Rewards</h3>
              {!active.length && <p className="text-sm text-muted-foreground">No active reward.</p>}
              {active.map((r) => (
                <div key={r.id} className="mb-2 flex items-center justify-between rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                  <span><b>{inr(r.amount)} off</b> · {r.card} {r.milestone} stamps · expires {new Date(r.expires_at).toLocaleDateString("en-IN")}</span>
                  {isOwner && <span className="flex gap-2 text-xs underline"><button onClick={() => rewardAction(r.id, "extend")}>Extend</button><button onClick={() => rewardAction(r.id, "cancel")}>Cancel</button></span>}
                </div>
              ))}
              {isOwner && past.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Past rewards ({past.length})</summary>
                  {past.map((r) => (
                    <div key={r.id} className="mt-1 flex justify-between rounded border p-2">
                      <span>{inr(r.amount)} · {r.card} · {r.status === "active" ? "expired" : r.status}</span>
                      {r.status !== "used" && <button className="text-xs underline" onClick={() => rewardAction(r.id, "restore")}>Restore</button>}
                    </div>
                  ))}
                </details>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Purchase history</h3>
              <ul className="space-y-2 text-sm">
                {data!.sales.map((s) => (
                  <li key={s.id} className="rounded-lg border p-2.5">
                     <div className="flex justify-between"><span className="font-mono text-xs">{s.bill_no}</span><span><b>{inr(s.total)}</b>{Number(s.due_amount) > 0 && <b className="ml-2 text-destructive">Due {inr(s.due_amount)}</b>}</span></div>
                    <p className="text-xs text-muted-foreground">{new Date(s.sale_date).toLocaleDateString("en-IN")} · {s.sale_items.map((i) => `${i.product_name} (${i.size})×${i.qty}`).join(", ")}{s.stamp_regular ? " · stamp" : ""}{Number(s.reward_amount) ? ` · reward −${inr(s.reward_amount)}` : ""}</p>
                  </li>
                ))}
                {!data!.sales.length && <li className="text-muted-foreground">No bills yet.</li>}
              </ul>
            </div>

            {data!.events.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold">Reward log</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data!.events.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString("en-IN")} · {e.action.replace(/_/g, " ")}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-muted p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className="truncate font-semibold">{v}</p>
    </div>
  );
}

// Apple-Wallet style stamp card: Sapphire Blue (Regular), Matte Black & Gold (Premium)
function StampCard({ kind, count }: { kind: "regular" | "premium"; count: number }) {
  const premium = kind === "premium";
  const next = [5, 10, 20].find((m) => m > count) ?? 20;
  const amounts = premium ? { 5: 200, 10: 500, 20: 1200 } : { 5: 100, 10: 250, 20: 600 };
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-lg"
      style={{
        background: premium ? "linear-gradient(135deg, oklch(0.2 0.005 260), oklch(0.12 0 0))" : "linear-gradient(135deg, oklch(0.45 0.17 262), oklch(0.3 0.14 265))",
        color: premium ? "oklch(0.82 0.12 85)" : "oklch(0.97 0.01 260)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em]">{premium ? "Premium" : "Regular"} Card</p>
        <p className="text-xs opacity-80">{count}/20</p>
      </div>
      <div className="mt-4 grid grid-cols-10 gap-1.5">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="aspect-square rounded-full border" style={{ borderColor: "currentColor", background: i < count ? "currentColor" : "transparent", opacity: i < count ? 1 : 0.35, outline: [4, 9, 19].includes(i) ? "2px solid currentColor" : undefined, outlineOffset: 1 }} />
        ))}
      </div>
      <p className="mt-3 text-xs opacity-85">Next: {next} stamps → {inr(amounts[next as 5 | 10 | 20])} off</p>
    </div>
  );
}
