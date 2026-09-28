import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/modules";
import { waLink } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — SoleStack POS" }, { name: "description", content: "Supplier list, dues and WhatsApp rate-list requests." }] }),
  component: Suppliers,
});

function Suppliers() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", phone: "", gstin: "", address: "" });
  const { data = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [] });
  const { data: purchases = [] } = useQuery({ queryKey: ["purchases-sum"], queryFn: async () => (await supabase.from("purchases").select("supplier_id,total,paid_amount")).data ?? [] });
  const sum = (id: string) => purchases.filter((p) => p.supplier_id === id).reduce<[number, number]>((a, p) => [a[0] + Number(p.total), a[1] + Number(p.paid_amount ?? 0)], [0, 0]);

  async function add() {
    if (!f.name.trim()) { toast.error("Name required"); return; }
    const { error } = await supabase.from("suppliers").insert(f);
    if (error) { toast.error(error.message); return; }
    setF({ name: "", phone: "", gstin: "", address: "" });
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  async function del(id: string) {
    if (!confirm("Delete supplier?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) { toast.error("Has purchases — cannot delete"); return; }
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Who you buy from, how much is pending." />
      <div className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-5">
        <Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
        <Input placeholder="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Button onClick={add}>Add supplier</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((s) => {
          const [tot, paid] = sum(s.id);
          return (
            <div key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex justify-between"><p className="font-semibold">{s.name}</p><button onClick={() => del(s.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></button></div>
              <p className="text-xs text-muted-foreground">{s.phone} {s.gstin && `· ${s.gstin}`}</p>
              <p className="mt-2 text-sm">Purchased {inr(tot)} · <span className="text-destructive">Pending {inr(tot - paid)}</span></p>
              {s.phone && (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <a target="_blank" rel="noreferrer" href={waLink(s.phone, `Hello ${s.name}, please share your latest footwear rate list / catalogue and delivery time. Thank you.`)}><MessageCircle className="h-3.5 w-3.5" /> Ask rate list</a>
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
