import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { exportAll, importLegacy } from "@/lib/legacy-import";
import { ThemeControl } from "@/components/ThemeControl";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — SoleStack POS" }, { name: "description", content: "Store details, team and data controls." }, { property: "og:title", content: "Settings — SoleStack POS" }, { property: "og:description", content: "Store, appearance and protected data controls." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isOwner, loading } = useAuth();
  const [f, setF] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [confirm, setConfirm] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("store_settings").select("*").eq("id", 1).single()).data,
  });
  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    enabled: isOwner,
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return (roles ?? []).map((r) => ({ ...r, name: profiles?.find((p) => p.id === r.user_id)?.full_name ?? "" }));
    },
  });

  useEffect(() => {
    if (settings)
      setF({
        business_name: settings.business_name ?? "", business_phone: settings.business_phone ?? "",
        business_address: settings.business_address ?? "", gstin: settings.gstin ?? "",
        bill_footer: settings.bill_footer ?? "", daily_target: String(settings.daily_target ?? ""),
        bill_design: settings.bill_design ?? "Thermal", thermal_width: settings.thermal_width ?? "80",
      });
  }, [settings]);

  if (!loading && !isOwner) return <p className="text-muted-foreground">Only the Owner can open Settings.</p>;

  async function save() {
    const { error } = await supabase.from("store_settings").update({ ...f, daily_target: Number(f["daily_target"]) || 0 }).eq("id", 1);
    error ? toast.error(error.message) : toast.success("Settings saved");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLog([]);
    try {
      const db = JSON.parse(await file.text());
      await importLegacy(db, (m) => setLog((l) => [...l, m]));
      toast.success("Old data imported");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function download() {
    const data = await exportAll();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `solestack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBackupDone(true);
    toast.success("Full backup downloaded");
  }

  async function resetData() {
    if (!backupDone || confirm !== "RESET BHAWANI FOOTWEAR") return;
    setBusy(true);
    const { error } = await supabase.rpc("reset_store_data", { _confirmation: confirm });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setConfirm(""); setBackupDone(false);
    toast.success("Store data reset completed");
  }

  const fields: [string, string][] = [
    ["business_name", "Shop name"], ["business_phone", "Phone"], ["business_address", "Address"],
    ["gstin", "GSTIN"], ["bill_footer", "Bill footer"], ["daily_target", "Daily target (₹)"],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Store details, team and data." />

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 font-semibold">Appearance</h2>
        <p className="mb-3 text-sm text-muted-foreground">Choose the workspace appearance on this device.</p>
        <ThemeControl />
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 font-semibold">Store details</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map(([k, l]) => (
            <div key={k} className="space-y-1">
              <Label>{l}</Label>
              <Input value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={save} className="mt-4">Save</Button>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 font-semibold">Bill printing</h2>
        <p className="mb-4 text-sm text-muted-foreground">Billing aur reprint mein yahi size pehle se chuna rahega. Billing screen par ek bill ke liye badal bhi sakte ho.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Default bill size</Label>
            <div className="grid grid-cols-3 gap-2">
              {([["Thermal", "Roll printer"], ["A4", "Full page"], ["Premium", "Framed A4"]] as const).map(([d, hint]) => (
                <button key={d} type="button" onClick={() => setF({ ...f, bill_design: d })} className={`rounded-lg border p-3 text-left text-sm ${f["bill_design"] === d ? "border-primary bg-primary/10" : ""}`}><b className="block">{d}</b><span className="text-xs text-muted-foreground">{hint}</span></button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Thermal roll width</Label>
            <div className="grid grid-cols-2 gap-2">
              {([["58", "58 mm · 2 inch"], ["80", "80 mm · 3 inch"]] as const).map(([w, l]) => (
                <button key={w} type="button" disabled={f["bill_design"] !== "Thermal"} onClick={() => setF({ ...f, thermal_width: w })} className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${f["thermal_width"] === w ? "border-primary bg-primary/10" : ""}`}><b className="block">{w} mm</b><span className="text-xs text-muted-foreground">{l}</span></button>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={save} className="mt-4">Save print settings</Button>
      </section>

      <section className="rounded-xl border border-destructive/40 bg-card p-5">
        <h2 className="font-semibold text-destructive">Reset store data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Bills, stock, products, customers, purchases and accounting entries will be permanently removed. Your account, team and store settings remain.</p>
        <ol className="my-3 list-inside list-decimal space-y-1 text-sm"><li>Download a fresh full backup.</li><li>Type the exact confirmation shown below.</li></ol>
        <Button variant="outline" onClick={download}>{backupDone ? "Backup downloaded" : "1. Download required backup"}</Button>
        <Label className="mt-4 block">Type: <b>RESET BHAWANI FOOTWEAR</b></Label>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 max-w-md" autoComplete="off" />
        <Button variant="destructive" className="mt-3" disabled={!backupDone || confirm !== "RESET BHAWANI FOOTWEAR" || busy} onClick={resetData}>Permanently reset store data</Button>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Team</h2>
        <p className="mb-3 text-sm text-muted-foreground">Staff create their own account on the sign-in page and join as Staff automatically. Staff cannot see purchase cost, profit or settings.</p>
        <ul className="divide-y text-sm">
          {team.map((t) => (
            <li key={t.user_id + t.role} className="flex justify-between py-2">
              <span>{t.name || t.user_id.slice(0, 8)}</span>
              <span className="text-xs uppercase tracking-wide text-primary">{t.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Data</h2>
        <p className="mb-3 text-sm text-muted-foreground">Import your old backup file (solestack-db.json). Running it again won't create duplicates.</p>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {busy ? "Importing…" : "Import old JSON"}
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} disabled={busy} />
          </label>
          <Button variant="outline" onClick={download}>Download full backup</Button>
        </div>
        {log.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-success">{log.map((l) => <li key={l}>✓ {l}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
