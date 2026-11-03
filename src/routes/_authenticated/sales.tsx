import type { Database } from "@/integrations/supabase/types";
import { requireRetailIntegrity, integrityError } from "@/lib/retail-integrity";
import { money, refundsBySale } from "@/lib/sales-returns";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { fetchAll } from "@/lib/fetch-all";
import { useShop } from "@/hooks/use-shop";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  head: () => ({
    meta: [
      { title: "Sales History — SoleStack POS" },
      { name: "description", content: "All bills with re-print, sharing, dues and returns." },
      { property: "og:title", content: "Sales History — SoleStack POS" },
      { property: "og:description", content: "Bills, returns and customer payment collections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sales,
});

type SaleRow = {
  id: string;
  bill_no: string;
  sale_date: string;
  customer_name: string | null;
  payment_mode: string;
  total: number;
  due_amount: number;
  customers: { mobile: string } | null;
  sale_items: { id: string; product_name: string; size: string; qty: number; price: number }[];
};

function Sales() {
  const shop = useShop();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  useEffect(() => {
    if (q.trim() === search) return;
    const timer = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, search]);
  const [ret, setRet] = useState<SaleRow | null>(null);
  const [collect, setCollect] = useState<SaleRow | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const { data, error, isPending } = useQuery({
    queryKey: ["sales", search, page],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select(
          "id,bill_no,sale_date,customer_name,payment_mode,total,due_amount,customers(mobile),customer_match:customers(),sale_items(id,product_name,size,qty,price)",
          { count: "exact" },
        );
      if (search) {
        // Empty embedding lets the mobile match join the OR without filtering
        // out bills that match by bill number/name but have no customer.
        const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
        const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
        query = query
          .ilike("customer_match.mobile", pattern)
          .or(`bill_no.ilike.${quoted},customer_name.ilike.${quoted},customer_match.not.is.null`);
      }
      const { data, error, count } = await query
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return { rows: data as unknown as SaleRow[], count: count ?? 0 };
    },
  });
  const {
    data: returns = [],
    error: returnsError,
    isPending: returnsPending,
  } = useQuery({
    queryKey: ["returns"],
    queryFn: async () =>
      fetchAll((a, b) =>
        supabase
          .from("sale_returns")
          .select("sale_id,sale_item_id,qty,refund,kind,replacement_variant_id")
          .order("id")
          .range(a, b),
      ),
  });
  const refunded = refundsBySale(returns);
  const returned = (id: string) =>
    returns.filter((r) => r.sale_item_id === id && (r.kind !== "exchange" || !r.replacement_variant_id)).reduce((a, r) => a + r.qty, 0);
  const list = data?.rows ?? [];
  const reprint = (b: string, d: PrintDesign) =>
    printBill(b, d).catch((e) => toast.error(e.message));
  async function collectPayment() {
    if (!collect) return;
    const { data: result, error } = await supabase.rpc("collect_credit_payment", {
      _sale_id: collect.id,
      _amount: Number(amount),
      _mode: mode,
      _note: "Collected from Sales History",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = result as { collected?: number; due?: number } | null;
    toast.success(`${inr(Number(r?.collected ?? 0))} collected · ${inr(Number(r?.due ?? 0))} due`);
    setCollect(null);
    setAmount("");
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div>
      <PageHeader
        title="Sales History"
        subtitle="Re-print bill, WhatsApp bill, return or exchange."
        actions={
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Bill no, name or mobile"
            className="h-10 w-64"
          />
        }
      />
      {returnsError && (
        <p role="alert" className="mb-3 text-destructive">
          Return history could not be loaded. Please retry.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-destructive">
          Unable to load sales: {error.message}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Bill</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Mode</th>
              <th className="p-3 text-right">Net after returns</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-3 font-mono text-xs">{x.bill_no}</td>
                <td className="p-3 whitespace-nowrap">
                  {new Date(x.sale_date).toLocaleString("en-IN")}
                </td>
                <td className="p-3">{x.customer_name}</td>
                <td className="p-3">
                  {x.sale_items
                    .map(
                      (i) =>
                        `${i.product_name} (${i.size}) ×${i.qty}${returned(i.id) ? ` [${returned(i.id)} returned]` : ""}`,
                    )
                    .join(", ")}
                </td>
                <td className="p-3">
                  {x.payment_mode}
                  {x.due_amount > 0 && (
                    <span className="block text-xs text-destructive">Due {inr(x.due_amount)}</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <b>
                    {returnsPending || returnsError
                      ? "—"
                      : inr(money(Number(x.total) - (refunded.get(x.id) ?? 0)))}
                  </b>
                  {(refunded.get(x.id) ?? 0) > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <p>
                        <span>Bill amount</span>: {inr(x.total)}
                      </p>
                      <p>
                        <span>Returned amount</span>: −{inr(refunded.get(x.id) ?? 0)}
                      </p>
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reprint(x.bill_no, "Thermal")}
                      title="Re-print thermal"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reprint(x.bill_no, "A4")}>
                      A4
                    </Button>
                    {x.customers?.mobile && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={returnsPending || !!returnsError}
                        asChild
                      >
                        <a
                          aria-disabled={returnsPending || !!returnsError}
                          onClick={(event) => {
                            if (returnsPending || returnsError) event.preventDefault();
                          }}
                          target="_blank"
                          rel="noreferrer"
                          href={waLink(
                            x.customers.mobile,
                            x.due_amount > 0
                              ? dueMessage(
                                  shop.name,
                                  x.customer_name ?? "",
                                  x.bill_no,
                                  x.due_amount,
                                )
                              : billMessage({
                                  shop: shop.name,
                                  name: x.customer_name ?? "",
                                  billNo: x.bill_no,
                                  total: x.total,
                                  returned: refunded.get(x.id) ?? 0,
                                }),
                          )}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {x.due_amount > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setCollect(x);
                          setAmount(String(x.due_amount));
                        }}
                        title="Collect due"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={returnsPending || !!returnsError}
                      onClick={() => setRet(x)}
                      title="Return / exchange"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {isPending
                    ? "Loading bills…"
                    : error
                      ? "Bills could not be loaded."
                      : "No bills."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <span className="text-sm text-muted-foreground">
          Page {page + 1} · {data?.count ?? 0} bills
        </span>
        <Button
          variant="outline"
          disabled={page === 0 || isPending}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={!data || (page + 1) * pageSize >= data.count || isPending}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      <ReturnDialog
        sale={ret}
        onClose={() => setRet(null)}
        returned={returned}
        onDone={() => refreshOperationalData(qc)}
      />
      <Dialog open={!!collect} onOpenChange={(o) => !o && setCollect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collect payment · {collect?.bill_no}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Current balance: {inr(collect?.due_amount ?? 0)}
          </p>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Amount received"
          />
          <div className="grid grid-cols-4 gap-2">
            {["Cash", "UPI", "Card", "Bank"].map((m) => (
              <Button
                key={m}
                variant={mode === m ? "default" : "outline"}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <Button onClick={collectPayment} disabled={!Number(amount)}>
            Save collection
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ReturnArgs = Database["public"]["Functions"]["process_sale_return"]["Args"];
function ReturnDialog({ sale, onClose, onDone }: { sale: SaleRow | null; onClose: () => void; returned: (id: string) => number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("Cash");
  const [confirmed, setConfirmed] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const pending = useRef<ReturnArgs | null>(null);
  const [recover, setRecover] = useState(false);
  const inFlight = useRef(false);
  const returnStorageKey = "solestack-pending-return-v1";
  const days = sale ? (Date.now() - new Date(sale.sale_date).getTime()) / 864e5 : 0;
  const positions = useQuery({
    queryKey: ["return-positions", sale?.id], enabled: !!sale,
    queryFn: async () => {
      await requireRetailIntegrity();
      const entries = await Promise.all(sale!.sale_items.map(async (i) => {
        const { data, error } = await supabase.rpc("sale_return_positions", { _item: i.id });
        if (error) throw integrityError(error);
        return { item: i, positions: data ?? [] };
      }));
      const ids = entries.flatMap((e) => e.positions.map((p) => p.variant_id).filter((id): id is string => !!id));
      const base = ids.length ? await supabase.from("product_variants").select("id,product_id").in("id", ids) : { data: [], error: null };
      if (base.error) throw base.error;
      const productIds = [...new Set((base.data ?? []).map((v) => v.product_id))];
      const sizes = productIds.length ? await supabase.from("product_variants").select("id,product_id,size,stock").in("product_id", productIds).gt("stock", 0).order("size") : { data: [], error: null };
      if (sizes.error) throw sizes.error;
      return { entries, sizes: sizes.data ?? [], base: base.data ?? [] };
    },
  });
  useEffect(() => {
    setChosen({}); setConfirmed(false); setRecover(false); pending.current = null;
    if (!sale?.id) return;
    try {
      const saved=JSON.parse(sessionStorage.getItem(returnStorageKey) ?? "null");
      if(saved?._operation_id && saved?._sale_item_id) { pending.current=saved; setRecover(true); }
    } catch { toast.error("Could not read pending return recovery. Check the return history before retrying."); }
  }, [sale?.id]);
  async function execute(args: ReturnArgs) {
    if (inFlight.current) return;
    inFlight.current=true; setBusy(true);
    try { sessionStorage.setItem(returnStorageKey,JSON.stringify(args)); } catch { inFlight.current=false; setBusy(false); toast.error("Recovery storage is unavailable. No return submitted."); return; }
    pending.current = args;
    try {
      const { data, error } = await supabase.rpc("process_sale_return", args);
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code ?? "") && !error.code.startsWith("PGRST")) { pending.current = null; sessionStorage.removeItem(returnStorageKey); setRecover(false); }
        else setRecover(true);
        throw integrityError(error);
      }
      pending.current = null; sessionStorage.removeItem(returnStorageKey); setRecover(false); setConfirmed(false);
      const result = data as { refund: number; payout: number; loyalty_review?: boolean; replacement_size?: string };
      toast.success(args._kind === "exchange" ? `Size exchanged to ${result.replacement_size}. Original bill retained; no extra payment or sale.` : `Return saved. ${inr(result.refund)} reversed · ${inr(result.payout)} refunded.`);
      if (result.loyalty_review) toast.warning("A reward from this purchase has already been used. Owner review is required; no automatic charge was made.");
      onDone(); await positions.refetch();
    } catch (error) {
      if (pending.current) setRecover(true);
      toast.error((error as Error).message);
    } finally { inFlight.current=false; setBusy(false); }
  }
  const go = (item: string, variant: string | null, kind: string) => {
    const replacement = chosen[`${item}:${variant}`];
    void execute({ _sale_item_id: item, _variant_id: variant, _qty: 1, _damaged: kind === "defect", _kind: kind, _note: `${kind} from ${sale?.bill_no}`, _refund_mode: kind === "exchange" ? null : mode, _replacement_variant_id: kind === "exchange" ? replacement ?? null : null, _operation_id: crypto.randomUUID() });
  };
  return <Dialog open={!!sale} onOpenChange={(o) => !o && !busy && !recover && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={(e) => { if (busy || recover) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy || recover) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>Return / Exchange · {sale?.bill_no}</DialogTitle></DialogHeader>
      {days > 7 && <p className="rounded-lg bg-warning/20 p-2 text-sm">Bill is {Math.floor(days)} days old (policy is 7 days).</p>}
      <p className="text-sm text-muted-foreground">Size exchange swaps one pair within the same article. Keep the original bill; do not make another sale.</p>
      {positions.isPending && <p role="status">Loading returnable sizes…</p>}
      {positions.error && <div role="alert"><p>{positions.error.message}</p><Button variant="outline" onClick={() => void positions.refetch()}>Retry</Button></div>}
      {recover && <div role="alert" className="rounded-lg border p-3"><p>The connection interrupted this operation. Recover the same request before starting another return.</p><Button disabled={busy} onClick={() => pending.current && void execute(pending.current)}>Retry / recover return</Button></div>}
      <fieldset disabled={busy || recover} className="space-y-3">
        <label className="block text-sm">Actual refund method<select className="ml-2 rounded-md border bg-background p-2" value={mode} onChange={(e) => { setMode(e.target.value); setConfirmed(false); }}>{["Cash","UPI","Card","Bank"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm the refund payout uses this method. Any unpaid bill balance is adjusted first.</label>
        {positions.data?.entries.map(({ item, positions: current }) => <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <p className="font-semibold">{item.product_name} · {inr(item.price)} / pair</p>
          {!current.length && <p>No pairs remain returnable.</p>}
          {current.map((p) => {
            const key = `${item.id}:${p.variant_id}`;
            const product = positions.data.base.find((v) => v.id === p.variant_id)?.product_id;
            const alternatives = positions.data.sizes.filter((v) => v.product_id === product && v.id !== p.variant_id);
            return <div key={key} className="space-y-2 border-t pt-2">
              <p>Current size {p.size} · {p.qty} returnable (one pair per action)</p>
              <div className="flex flex-wrap gap-2"><select aria-label={`Replacement size for ${item.product_name} size ${p.size}`} className="min-w-0 rounded-md border bg-background p-2" value={chosen[key] ?? ""} onChange={(e) => setChosen((c) => ({ ...c, [key]: e.target.value }))}><option value="">Choose replacement size</option>{alternatives.map((v) => <option key={v.id} value={v.id}>Size {v.size} · {v.stock} in stock</option>)}</select><Button size="sm" disabled={!chosen[key]} onClick={() => go(item.id, p.variant_id, "exchange")}>Exchange size</Button></div>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!confirmed} onClick={() => go(item.id,p.variant_id,"return")}>Return (good)</Button><Button size="sm" variant="outline" disabled={!confirmed} onClick={() => go(item.id,p.variant_id,"defect")}>Defect → damaged</Button></div>
            </div>;
          })}
        </div>)}
      </fieldset>
    </DialogContent>
  </Dialog>;
}
