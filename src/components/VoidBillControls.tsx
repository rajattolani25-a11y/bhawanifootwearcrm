import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { refreshOperationalData } from "@/lib/refresh-operational-data";
import { inr } from "@/lib/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListPagination } from "./ListPagination";
const failure = (e: { code?: string; message: string }) =>
  e.code === "PGRST202"
    ? "Apply database update 0034_void_incorrect_bills to enable bill cancellation."
    : e.message;
export function VoidSaleButton({
  id,
  billNo,
  total,
}: {
  id: string;
  billNo: string;
  total: number;
}) {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState(""),
    [settled, setSettled] = useState(false),
    [mode, setMode] = useState("Cash"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!isOwner) return null;
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("void_sale", {
        _sale_id: id,
        _confirmation: confirmation,
        _reason: reason.trim(),
        _payment_settled: settled,
        _refund_mode: mode,
      });
      if (r.error) throw new Error(failure(r.error));
      await refreshOperationalData(qc);
      setOpen(false);
      toast.success("Incorrect bill cancelled. Stock and eligible financial effects reversed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        title="Cancel incorrect bill"
        aria-label={`Cancel incorrect bill ${billNo}`}
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancel incorrect bill · {billNo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Original amount: {inr(total)}. Cancelling removes this bill from normal sales, profit,
            dues and reports, restores its stock and reverses eligible loyalty/coupon use. The owner
            cancellation record is retained.
          </p>
          <p className="text-sm text-muted-foreground">
            Use for an incorrect or duplicate bill. For an actual customer return, use Return. Bills
            linked to returns, later payments, online orders or spent rewards require
            reconciliation.
          </p>
          <label className="text-sm">
            Reason
            <Input
              aria-label="Cancellation reason"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <label className="text-sm">
            Type {billNo}
            <Input
              aria-label="Confirm bill number"
              value={confirmation}
              disabled={busy}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Payment reversal / refund method
            <select
              aria-label="Cancellation refund method"
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value)}
              className="ml-2 rounded-md border bg-background p-2"
            >
              {["Cash", "UPI", "Card", "Bank"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={settled}
              disabled={busy}
              onChange={(e) => setSettled(e.target.checked)}
            />
            I confirm this is an incorrect bill and any original payment has been settled.
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={busy || confirmation !== billNo || reason.trim().length < 3 || !settled}
            onClick={() => void cancel()}
          >
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function VoidedBills() {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["voided-bills", page],
    enabled: isOwner && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_void_sales", {
        _offset: page * 50,
        _limit: 50,
      });
      if (error) throw new Error(failure(error));
      return data as {
        rows: {
          id: string;
          bill_no: string;
          total: number;
          voided_at: string;
          void_reason: string;
        }[];
        count: number;
      };
    },
  });
  if (!isOwner) return null;
  return (
    <div className="mb-3 flex justify-end">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancelled bills
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Cancelled bills · owner history</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Audit records only. Amounts below do not contribute to normal sales, dues or profit.
          </p>
          {query.isPending && <p>Loading…</p>}
          {query.error && <p role="alert">{query.error.message}</p>}
          {query.data?.rows.map((r) => (
            <article key={r.id} className="border-b py-2 text-sm">
              <b>{r.bill_no}</b>
              <span className="float-right">Original {inr(r.total)}</span>
              <p>{r.void_reason}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.voided_at).toLocaleString("en-IN")}
              </p>
            </article>
          ))}
          <ListPagination
            page={page}
            pageSize={50}
            total={query.data?.count ?? 0}
            busy={query.isPending}
            onPage={setPage}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
