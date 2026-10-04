import { useShop } from "@/hooks/use-shop";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Printer, MessageCircle, Undo2, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/modules";
import { printBill, type PrintDesign } from "@/lib/print";
import { waLink } from "@/lib/pos";
import { billMessage, dueMessage } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [{ title: "Sales History — SoleStack POS" }, { name: "description", content: "All bills with re-print, sharing, dues and returns." }, { property: "og:title", content: "Sales History — SoleStack POS" }, { property: "og:description", content: "Bills, returns and customer payment collections." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Sales,
});

type SaleRow = {
  id: string; bill_no: string; sale_date: string; customer_name: string | null; payment_mode: string; total: number; due_amount: number;
  customers: { mobile: string } | null;
  sale_items: { id: string; product_name: string; size: string; qty: number; price: number }[];
};

function Sales() {
  const shop = useShop();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [ret, setRet] = useState<SaleRow | null>(null);
  const [collect, setCollect] = useState<SaleRow | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const { data = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,bill_no,sale_date,customer_name,payment_mode,total,due_amount,customers(mobile),sale_items(id,product_name,size,qty,price)")
        .order("sale_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as unknown as SaleRow[];
    },
  });
  const { data: returns = [] } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => (await supabase.from("sale_returns").select("sale_item_id,qty")).data ?? [],
  });
  const returned = (id: string) => returns.filter((r) => r.sale_item_id === id).reduce((a, r) => a + r.qty, 0);
  const s = q.toLowerCase();
  const list = data.filter((x) => !s || x.bill_no.toLowerCase().includes(s) || (x.customer_name ?? "").toLowerCase().includes(s) || x.customers?.mobile.includes(s));
  const reprint = (b: string, d: PrintDesign) => printBill(b, d).catch((e) => toast.error(e.message));
  async function collectPayment() {
    if (!collect) return;
    const { data: result, error } = await supabase.rpc("collect_credit_payment", { _sale_id: collect.id, _amount: Number(amount), _mode: mode, _note: "Collected from Sales History" });
    if (error) { toast.error(error.message); return; }
    const r = result as { collected?: number; due?: number } | null;
    toast.success(`${inr(Number(r?.collected ?? 0))} collected · ${inr(Number(r?.due ?? 0))} due`);
    setCollect(null); setAmount(""); qc.invalidateQueries({ queryKey: ["sales"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div>
      <PageHeader title="Sales History" subtitle="Re-print bill, WhatsApp bill, return or exchange." actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no, name or mobile" className="h-10 w-64" />} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Bill</th><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-3 font-mono text-xs">{x.bill_no}</td>
                <td className="p-3 whitespace-nowrap">{new Date(x.sale_date).toLocaleString("en-IN")}</td>
                <td className="p-3">{x.customer_name}</td>
                <td className="p-3">{x.sale_items.map((i) => `${i.product_name} (${i.size}) ×${i.qty}${returned(i.id) ? ` [${returned(i.id)} returned]` : ""}`).join(", ")}</td>
                <td className="p-3">{x.payment_mode}{x.due_amount > 0 && <span className="block text-xs text-destructive">Due {inr(x.due_amount)}</span>}</td>
                <td className="p-3 text-right font-semibold">{inr(x.total)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => reprint(x.bill_no, "Thermal")} title="Re-print thermal"><Printer className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => reprint(x.bill_no, "A4")}>A4</Button>
                    {x.customers?.mobile && (
                       <Button size="sm" variant="outline" asChild><a target="_blank" rel="noreferrer" href={waLink(x.customers.mobile, x.due_amount > 0 ? dueMessage(shop.name, x.customer_name ?? "", x.bill_no, x.due_amount) : billMessage({ shop: shop.name, name: x.customer_name ?? "", billNo: x.bill_no, total: x.total }))}><MessageCircle className="h-3.5 w-3.5" /></a></Button>
                    )}
                     {x.due_amount > 0 && <Button size="sm" onClick={() => { setCollect(x); setAmount(String(x.due_amount)); }} title="Collect due"><IndianRupee className="h-3.5 w-3.5" /></Button>}
                    <Button size="sm" variant="outline" onClick={() => setRet(x)} title="Return / exchange"><Undo2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No bills.</td></tr>}
          </tbody>
        </table>
      </div>
      <ReturnDialog sale={ret} onClose={() => setRet(null)} returned={returned} onDone={() => qc.invalidateQueries()} />
      <Dialog open={!!collect} onOpenChange={(o) => !o && setCollect(null)}>
        <DialogContent><DialogHeader><DialogTitle>Collect payment · {collect?.bill_no}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Current balance: {inr(collect?.due_amount ?? 0)}</p>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount received" />
          <div className="grid grid-cols-4 gap-2">{["Cash", "UPI", "Card", "Bank"].map((m) => <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{m}</Button>)}</div>
          <Button onClick={collectPayment} disabled={!Number(amount)}>Save collection</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReturnDialog({ sale, onClose, returned, onDone }: { sale: SaleRow | null; onClose: () => void; returned: (id: string) => number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const days = sale ? (Date.now() - new Date(sale.sale_date).getTime()) / 864e5 : 0;
  async function go(itemId: string, damaged: boolean, kind: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc("process_return", { _sale_item_id: itemId, _qty: 1, _damaged: damaged, _kind: kind, _note: `${kind} from ${sale?.bill_no}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(kind === "exchange" ? "Pair back in stock — now bill the new size in POS (₹0 difference if same price)" : `Returned. Refund ${inr(Number(data))}`);
    onDone();
  }
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Return / Exchange · {sale?.bill_no}</DialogTitle></DialogHeader>
        {days > 7 && <p className="rounded-lg bg-warning/20 p-2 text-sm">⚠ Bill is {Math.floor(days)} days old (policy is 7 days).</p>}
        <div className="space-y-2">
          {sale?.sale_items.map((i) => {
            const left = i.qty - returned(i.id);
            return (
              <div key={i.id} className="rounded-lg border p-2 text-sm">
                <p className="font-semibold">{i.product_name} · Size {i.size} · {inr(i.price)}</p>
                <p className="text-xs text-muted-foreground">{left} of {i.qty} returnable (1 pair per tap)</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={!left || busy} onClick={() => go(i.id, false, "exchange")}>Size exchange</Button>
                  <Button size="sm" variant="outline" disabled={!left || busy} onClick={() => go(i.id, false, "return")}>Return (good)</Button>
                  <Button size="sm" variant="outline" disabled={!left || busy} onClick={() => go(i.id, true, "defect")}>Defect → damaged</Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
