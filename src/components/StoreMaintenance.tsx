import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readBackupFile, type StoreBackup } from "@/lib/store-backup-format";
import {
  cleanupStoreFiles,
  createStoreBackup,
  maintenanceError,
  pendingCleanupCount,
  readResetState,
  rememberReset,
  restoreStoreBackup,
  setMaintenanceBusy,
} from "@/lib/store-maintenance";

export function StoreMaintenance() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [issue, setIssue] = useState("");
  const [downloadChecksum, setDownloadChecksum] = useState("");
  const [verified, setVerified] = useState<StoreBackup | null>(null);
  const [restore, setRestore] = useState<StoreBackup | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const [keepIdentity, setKeepIdentity] = useState(true);
  const [keepDesign, setKeepDesign] = useState(true);
  const [keepOperations, setKeepOperations] = useState(true);
  const [restartNumbers, setRestartNumbers] = useState(false);
  const support = useQuery({
    queryKey: ["store-maintenance"],
    retry: false,
    queryFn: async () => ({ state: await readResetState(), pending: await pendingCleanupCount() }),
  });
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMaintenanceBusy(true);
    setIssue("");
    try {
      await action();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Maintenance failed. Please retry.";
      setStatus("");
      setIssue(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setMaintenanceBusy(false);
      void support.refetch();
    }
  }
  async function download() {
    setVerified(null);
    setDownloadChecksum("");
    const backup = await createStoreBackup(setStatus);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `solestack-business-backup-v2-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setDownloadChecksum(backup.checksum);
    setStatus(
      "Backup prepared. Select the saved file below to verify the download before resetting.",
    );
  }
  async function selectFile(file: File, purpose: "verify" | "restore") {
    if (purpose === "verify") setVerified(null);
    else setRestore(null);
    const backup = await readBackupFile(file);
    if (backup.snapshot.state.installation_id !== support.data?.state.installation_id)
      throw new Error("This backup belongs to a different backend.");
    if (purpose === "verify") {
      if (!downloadChecksum || backup.checksum !== downloadChecksum)
        throw new Error("Select the exact backup just downloaded in this session.");
      setVerified(backup);
      setStatus("Saved backup verified, including table manifest and photo checksums.");
    } else {
      setRestore(backup);
      setStatus(
        "Restore file verified. Existing store must be empty; team access will not be restored.",
      );
    }
  }
  async function reset() {
    if (!verified || confirmation !== "RESET") return;
    setStatus("Resetting business data in one database transaction…");
    const { error } = await supabase.rpc("reset_store_data_v2", {
      _confirmation: confirmation,
      _fingerprint: verified.snapshot.fingerprint,
      _preserve_identity: keepIdentity,
      _preserve_design: keepDesign,
      _restart_numbers: restartNumbers,
      _preserve_operations: keepOperations,
    });
    if (error) throw maintenanceError(error);
    setVerified(null);
    setDownloadChecksum("");
    setConfirmation("");
    setRestore(null);
    // Mark the committed reset before cleanup; a failed Storage call must never repeat the reset.
    const deviceCleared = rememberReset(await readResetState());
    await qc.invalidateQueries();
    setStatus("Business data reset. Completing old photo cleanup…");
    await cleanupStoreFiles(setStatus);
    setStatus(
      deviceCleared
        ? "Reset and photo cleanup completed. Your owner login is preserved. Reload to continue."
        : "Database and photos reset. Device storage is blocked: close other app tabs and clear this site's saved drafts before billing again.",
    );
    if (deviceCleared) toast.success("Reset and photo cleanup completed");
    else toast.warning("Database/photos reset; device drafts need manual cleanup");
  }
  const disabled = busy || !support.data || support.isError;
  function fileInput(purpose: "verify" | "restore") {
    return (
      <Input
        aria-label={purpose === "verify" ? "Verify downloaded backup" : "Select backup to restore"}
        type="file"
        accept="application/json,.json"
        disabled={disabled || (purpose === "verify" && !downloadChecksum)}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(() => selectFile(f, purpose));
        }}
      />
    );
  }
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5"
      aria-label="Safe store maintenance"
    >
      <div>
        <h2 className="font-semibold">Backup & reset</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save your business records and photos. Reset keeps your owner account and store setup by
          default.
        </p>
      </div>
      {support.isPending && <p role="status">Checking safe maintenance support…</p>}
      {support.error && (
        <div role="alert" className="text-sm text-destructive">
          <p>{support.error.message}</p>
          <Button variant="outline" className="mt-2" onClick={() => void support.refetch()}>
            Retry support check
          </Button>
        </div>
      )}
      {!!support.data?.pending && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
          <p>
            {support.data.pending} old or staged photo files await cleanup. Maintenance is not fully
            complete.
          </p>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              void run(async () => {
                await cleanupStoreFiles(setStatus);
                setStatus("Pending photo cleanup completed.");
              })
            }
          >
            Retry photo cleanup
          </Button>
        </div>
      )}
      <Button variant="outline" disabled={disabled} onClick={() => void run(download)}>
        Download backup
      </Button>
      {!!downloadChecksum && (
        <div className="space-y-2">
          <Label>Select the saved backup to verify it</Label>
          {fileInput("verify")}
          {verified && <p className="text-sm text-success">Saved backup verified ✓</p>}
        </div>
      )}
      {status && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {busy ? "Working… " : ""}
          {status}
        </p>
      )}
      {issue && (
        <p role="alert" className="text-sm text-destructive">
          {issue}
        </p>
      )}
      <details className="rounded-lg border border-destructive/30 p-4">
        <summary className="cursor-pointer font-semibold text-destructive">
          Reset business data
        </summary>
        <div className="mt-4 space-y-4 text-sm">
          <p>
            Bills, stock, customers, khata balances, orders, coupons, loyalty and product photos
            will be removed. Held bills and poster drafts clear when each device detects the reset.
            Other users lose app access; their login accounts remain.
          </p>
          <p className="rounded-lg bg-muted p-3">
            <b>Preserved:</b> owner login{keepIdentity ? ", shop details/GSTIN/UPI" : ""}
            {keepOperations ? ", billing and catalog delivery preferences" : ""}
            {keepDesign ? ", hero and theme" : ""}, device language and display mode.{" "}
            {restartNumbers ? "Bill numbering restarts at 1." : "Bill numbering continues."}
          </p>
          <p className="text-muted-foreground">
            Pause other billing/editing sessions. Download and verify a fresh backup above before
            resetting. Festival offer settings reset with coupons.
          </p>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-muted-foreground">
              Advanced: change what stays
            </summary>
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={keepIdentity}
                  disabled={busy}
                  onChange={(e) => setKeepIdentity(e.target.checked)}
                />
                <span>Keep shop name, address, phone, GSTIN and UPI ID.</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={keepOperations}
                  disabled={busy}
                  onChange={(e) => setKeepOperations(e.target.checked)}
                />
                <span>
                  Keep billing/print settings, daily target and catalog ordering/delivery
                  preferences.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={keepDesign}
                  disabled={busy}
                  onChange={(e) => setKeepDesign(e.target.checked)}
                />
                <span>
                  Keep current catalog hero, its image, theme and appearance. Links to deleted
                  products clear.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={restartNumbers}
                  disabled={busy}
                  onChange={(e) => setRestartNumbers(e.target.checked)}
                />
                <span>Restart bill counter at 1 (may reuse numbers from old printed bills).</span>
              </label>
            </div>
          </details>
          <div className="space-y-2">
            <Label htmlFor="reset-confirmation">Type RESET (uppercase)</Label>
            <Input
              id="reset-confirmation"
              autoComplete="off"
              value={confirmation}
              disabled={busy}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <Button
            variant="destructive"
            disabled={disabled || !verified || confirmation !== "RESET" || !!support.data?.pending}
            onClick={() => void run(reset)}
          >
            Permanently reset this store
          </Button>
        </div>
      </details>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">Restore backup</summary>
        <div className="mt-4 space-y-3 text-sm">
          <p>
            Restore records, settings and photos to this same empty store. Login accounts and team
            access are not restored. Complete pending photo cleanup first. Use a version 2 backup
            (maximum 100 MB file / 50 MB photos).
          </p>
          {fileInput("restore")}
          <Label htmlFor="restore-confirmation">Type RESTORE</Label>
          <Input
            id="restore-confirmation"
            value={restoreText}
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setRestoreText(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={disabled || !restore || restoreText !== "RESTORE" || !!support.data?.pending}
            onClick={() =>
              void run(async () => {
                if (!restore) return;
                const deviceCleared = await restoreStoreBackup(restore, setStatus);
                setRestore(null);
                setRestoreText("");
                setVerified(null);
                setDownloadChecksum("");
                await qc.invalidateQueries();
                setStatus(
                  deviceCleared
                    ? "Backup restored. Team access remains unchanged. Reload to continue."
                    : "Backup restored. Device storage is blocked: clear this site’s saved drafts before billing again.",
                );
                toast.success("Business backup restored");
              })
            }
          >
            Restore verified backup
          </Button>
        </div>
      </details>
      {!!status && (
        <Button variant="ghost" disabled={busy} onClick={() => window.location.reload()}>
          Reload app
        </Button>
      )}
    </section>
  );
}
