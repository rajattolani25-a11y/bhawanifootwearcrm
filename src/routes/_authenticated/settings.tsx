import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { LanguageSelect } from "@/lib/i18n";
import { StorageMeter } from "@/components/StorageMeter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SoleStack POS" },
      { name: "description", content: "Store details, team and data controls." },
      { property: "og:title", content: "Settings — SoleStack POS" },
      { property: "og:description", content: "Store, appearance and protected data controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isOwner, loading, user } = useAuth();
  const qc = useQueryClient();
  const [section, setSection] = useState("store");
  const [f, setF] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    enabled: !loading && isOwner,
    queryFn: async () =>
      (await supabase.from("store_settings").select("*").eq("id", 1).single()).data,
  });
  const { data: team = [] } = useQuery({
    queryKey: ["team"],
    enabled: isOwner,
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return (profiles ?? [])
        .map((p) => ({
          user_id: p.id,
          name: p.full_name ?? "",
          role:
            (
              roles?.find((r) => r.user_id === p.id && r.role === "owner") ??
              roles?.find((r) => r.user_id === p.id)
            )?.role ?? null,
        }))
        .sort((a, b) => Number(!!a.role) - Number(!!b.role));
    },
  });

  useEffect(() => {
    if (settings)
      setF({
        business_name: settings.business_name ?? "",
        business_phone: settings.business_phone ?? "",
        business_address: settings.business_address ?? "",
        gstin: settings.gstin ?? "",
        bill_footer: settings.bill_footer ?? "",
        daily_target: String(settings.daily_target ?? ""),
        bill_design: settings.bill_design ?? "Thermal",
        thermal_width: settings.thermal_width ?? "80",
      });
  }, [settings]);

  if (loading)
    return (
      <p role="status" className="text-muted-foreground">
        Checking owner access…
      </p>
    );
  if (!isOwner) return <p className="text-muted-foreground">Only the Owner can open Settings.</p>;

  async function changeRole(userId: string, role: "owner" | "staff") {
    if (
      !window.confirm(`Change this team member to ${role}? Their access will change immediately.`)
    )
      return;
    setChangingRole(userId);
    try {
      const { error } = await supabase.rpc("set_team_role", { _user_id: userId, _role: role });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["team"] });
      toast.success(`Role changed to ${role}`);
      if (userId === user?.id) window.location.reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingRole(null);
    }
  }

  async function removeAccess(userId: string) {
    if (!window.confirm("Remove this person's access? They will not be able to open the shop app."))
      return;
    setChangingRole(userId);
    try {
      const { error } = await supabase.rpc("remove_team_access", { _user_id: userId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Access removed");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingRole(null);
    }
  }

  async function save() {
    const { error } = await supabase
      .from("store_settings")
      .update({ ...f, daily_target: Number(f["daily_target"]) || 0 })
      .eq("id", 1);
    qc.invalidateQueries({ queryKey: ["shop-identity"] });
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
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
    setBackupDone(false);
    setBusy(true);
    try {
      const data = await exportAll();
      const a = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      a.href = url;
      a.download = `solestack-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setBackupDone(true);
      toast.success("Full backup downloaded");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetData() {
    if (!backupDone || confirm.trim().toUpperCase() !== "RESET") return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("reset_store_data", { _confirmation: confirm });
      if (error) throw error;
      setConfirm("");
      setBackupDone(false);
      toast.success("Store data reset completed");
      window.location.reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fields: [string, string][] = [
    ["business_name", "Shop name"],
    ["business_phone", "Phone"],
    ["business_address", "Address"],
    ["gstin", "GSTIN"],
    ["bill_footer", "Bill footer"],
    ["daily_target", "Daily target (₹)"],
  ];

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Manage your catalog, store and team."
        actions={
          <Button asChild>
            <Link to="/catalog-studio">Catalog Studio</Link>
          </Button>
        }
      />
      <Tabs value={section} onValueChange={setSection}>
        <TabsList
          aria-label="Settings sections"
          className="mb-4 grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6"
        >
          {(
            [
              ["catalog", "Catalog"],
              ["store", "Store"],
              ["billing", "Billing"],
              ["appearance", "Appearance"],
              ["team", "Team"],
              ["data", "Data & backup"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 whitespace-normal px-2 py-3 text-xs"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="catalog" forceMount className="space-y-5 data-[state=inactive]:hidden">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Catalog Studio</h2>
            <p className="my-3 text-sm text-muted-foreground">
              Banner, themes, products, offers and delivery controls are together in Catalog Studio.
            </p>
            <Button asChild>
              <Link to="/catalog-studio">Open Catalog Studio</Link>
            </Button>
          </section>
        </TabsContent>
        <TabsContent value="store" forceMount className="space-y-5 data-[state=inactive]:hidden">
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
            <Button disabled={!settings} onClick={save} className="mt-4">
              Save
            </Button>
          </section>
        </TabsContent>
        <TabsContent value="billing" forceMount className="space-y-5 data-[state=inactive]:hidden">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 font-semibold">Bill printing</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Billing aur reprint mein yahi size pehle se chuna rahega. Billing screen par ek bill
              ke liye badal bhi sakte ho.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Default bill size</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Thermal", "Roll printer"],
                      ["A4", "Full page"],
                      ["Premium", "Framed A4"],
                    ] as const
                  ).map(([d, hint]) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setF({ ...f, bill_design: d })}
                      className={`rounded-lg border p-3 text-left text-sm ${f["bill_design"] === d ? "border-primary bg-primary/10" : ""}`}
                    >
                      <b className="block">{d}</b>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Thermal roll width</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["58", "58 mm · 2 inch"],
                      ["80", "80 mm · 3 inch"],
                    ] as const
                  ).map(([w, l]) => (
                    <button
                      key={w}
                      type="button"
                      disabled={f["bill_design"] !== "Thermal"}
                      onClick={() => setF({ ...f, thermal_width: w })}
                      className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${f["thermal_width"] === w ? "border-primary bg-primary/10" : ""}`}
                    >
                      <b className="block">{w} mm</b>
                      <span className="text-xs text-muted-foreground">{l}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button disabled={!settings} onClick={save} className="mt-4">
              Save print settings
            </Button>
          </section>
        </TabsContent>
        <TabsContent
          value="appearance"
          forceMount
          className="space-y-5 data-[state=inactive]:hidden"
        >
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 font-semibold">Appearance</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Choose the workspace appearance on this device.
            </p>
            <ThemeControl />
            <h2 className="mb-1 mt-5 font-semibold">Language / भाषा</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Menu aur screen titles is bhasha me dikhenge (is device par).
            </p>
            <LanguageSelect />
          </section>
        </TabsContent>
        <TabsContent value="team" forceMount className="space-y-5 data-[state=inactive]:hidden">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Team</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              New accounts wait for your approval and cannot open anything until you make them Staff
              or Owner. Staff cannot see purchase cost, profit or settings.
            </p>
            <ul className="divide-y text-sm">
              {team.map((t) => (
                <li
                  key={t.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    {t.name || t.user_id.slice(0, 8)} {t.user_id === user?.id ? "(you)" : ""}{" "}
                    {!t.role && (
                      <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
                        Waiting for approval
                      </span>
                    )}
                  </span>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label={`Role for ${t.name || t.user_id}`}
                  >
                    {(["owner", "staff"] as const).map((role) => (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant={t.role === role ? "default" : "outline"}
                        disabled={!!changingRole || t.role === role}
                        onClick={() => changeRole(t.user_id, role)}
                        aria-label={`Make ${t.name || t.user_id} ${role}`}
                      >
                        {role === "owner" ? "Owner" : t.role ? "Staff" : "Approve as Staff"}
                      </Button>
                    ))}
                    {t.role && t.user_id !== user?.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={!!changingRole}
                        onClick={() => removeAccess(t.user_id)}
                      >
                        Remove access
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
        <TabsContent value="data" forceMount className="space-y-5 data-[state=inactive]:hidden">
          <StorageMeter />
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Data</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Import your old backup file (solestack-db.json). Running it again won't create
              duplicates.
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                {busy ? "Importing…" : "Import old JSON"}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={onFile}
                  disabled={busy}
                />
              </label>
              <Button variant="outline" onClick={download}>
                Download full backup
              </Button>
            </div>
            {log.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-success">
                {log.map((l) => (
                  <li key={l}>✓ {l}</li>
                ))}
              </ul>
            )}
          </section>
          <details className="rounded-xl border border-destructive/30 p-4">
            <summary className="cursor-pointer font-semibold text-destructive">
              Advanced: reset store data
            </summary>
            <section className="rounded-xl border border-destructive/40 bg-card p-5">
              <h2 className="font-semibold text-destructive">Reset store data</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bills, stock, products, customers, purchases and accounting entries will be
                permanently removed. Your account, team and store settings remain.
              </p>
              <ol className="my-3 list-inside list-decimal space-y-1 text-sm">
                <li>Download a fresh full backup.</li>
                <li>Type the exact confirmation shown below.</li>
              </ol>
              <Button variant="outline" disabled={busy} onClick={download}>
                {busy
                  ? "Preparing backup…"
                  : backupDone
                    ? "Backup downloaded"
                    : "1. Download required backup"}
              </Button>
              <Label className="mt-4 block">
                Type: <b>RESET</b>
              </Label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 max-w-md"
                autoComplete="off"
              />
              <Button
                variant="destructive"
                className="mt-3"
                disabled={!backupDone || confirm.trim().toUpperCase() !== "RESET" || busy}
                onClick={resetData}
              >
                Permanently reset store data
              </Button>
            </section>
          </details>
        </TabsContent>
      </Tabs>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        SoleStack · Built for footwear retailers · Rajat Tolani
      </footer>
    </div>
  );
}
