import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { maintenanceError } from "@/lib/store-maintenance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function OwnershipTransfer() {
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  async function transfer() {
    if (busy || confirmation !== "TRANSFER" || !email.trim()) return;
    if (
      !window.confirm(
        `Transfer your owner access to ${email.trim()}? Your access will be removed immediately. Open counters will reload and clear held drafts. Other team access stays unchanged.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("transfer_store_ownership", {
        _email: email.trim(),
        _confirmation: confirmation,
      });
      if (error) throw maintenanceError(error);
      // Transfer is already committed even if sign-out/network subsequently fails.
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/auth");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ownership transfer failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border bg-card p-5">
      <summary className="cursor-pointer font-semibold">New owner / hand over this store</summary>
      <div className="mt-4 space-y-3 text-sm">
        <p>
          <b>After reset:</b> your owner account still works. A new signup waits for your approval;
          it never automatically replaces you.
        </p>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            New owner signs up at this app’s login page using their own email and verifies it.
          </li>
          <li>Enter their exact email below and type TRANSFER.</li>
          <li>
            After transfer, they sign in or reload. Their account becomes Owner; your app access is
            removed.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Other team permissions remain unchanged. Review the Team list first. To keep your access
          too, use Make Owner above instead of transferring.
        </p>
        <p className="text-muted-foreground">
          For a separate backend, its initial owner must be verified and provisioned through trusted
          backend administration. Do not reset the original shop just to remix it.
        </p>
        <Label htmlFor="new-owner-email">New owner’s verified email</Label>
        <Input
          id="new-owner-email"
          type="email"
          autoComplete="off"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Label htmlFor="ownership-confirmation">Type TRANSFER</Label>
        <Input
          id="ownership-confirmation"
          autoComplete="off"
          value={confirmation}
          disabled={busy}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <Button
          variant="destructive"
          disabled={busy || confirmation !== "TRANSFER" || !email.trim()}
          onClick={() => void transfer()}
        >
          {busy ? "Transferring…" : "Transfer ownership and remove my access"}
        </Button>
      </div>
    </details>
  );
}
