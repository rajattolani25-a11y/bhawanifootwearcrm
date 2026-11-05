import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ownerBargainRpc, saveBargainPolicy } from "@/lib/catalog-bargain-owner";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { inr } from "@/lib/modules";
import {
  DEFAULT_BARGAIN_POLICY,
  OWNER_BARGAIN_RULES,
  policyError,
  policyFloor,
  type BargainPolicy,
} from "@/lib/catalog-bargain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export function BargainPolicyFields({
  value,
  onChange,
  price,
  disabled = false,
}: {
  value: BargainPolicy;
  onChange: (p: BargainPolicy) => void;
  price: number;
  disabled?: boolean;
}) {
  const { isOwner } = useAuth();
  const { t } = useLang();
  const [rules, setRules] = useState(false);
  if (!isOwner) return null;
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label={t("Bargaining settings")}>
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <Switch
            checked={value.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          />
          {t("Allow bargaining")}
        </label>
        <button
          type="button"
          onClick={() => setRules(true)}
          className="min-h-11 text-[11px] text-muted-foreground underline underline-offset-4"
        >
          {t("Bargaining rules")}
        </button>
      </div>
      {value.enabled && (
        <fieldset disabled={disabled} className="grid gap-3">
          <label className="grid gap-1 text-xs">
            {t("Discount type")}
            <select
              aria-label={t("Discount type")}
              value={value.kind}
              onChange={(e) =>
                onChange({
                  ...value,
                  kind: e.target.value as "amount" | "percent",
                  min_discount: 0,
                  max_discount: 0,
                })
              }
              className="h-11 rounded-md border bg-background px-2"
            >
              <option value="amount">₹</option>
              <option value="percent">%</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["min_discount", "max_discount"] as const).map((key, i) => (
              <label key={key} className="grid gap-1 text-xs">
                {t(i ? "Maximum discount" : "Minimum discount (optional)")}
                <Input
                  aria-label={t(i ? "Maximum discount" : "Minimum discount (optional)")}
                  type="number"
                  min="0"
                  step="0.01"
                  value={value[key] || ""}
                  placeholder="0"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [key]: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-xs">
            {t("Round counter prices to")}
            <select
              aria-label={t("Round counter prices to")}
              className="h-11 rounded-md border bg-background px-2"
              value={value.rounding}
              onChange={(e) => onChange({ ...value, rounding: Number(e.target.value) as 5 | 10 })}
            >
              <option value="5">₹5</option>
              <option value="10">₹10</option>
            </select>
          </label>
          {policyError(price, value) ? (
            <p className="text-xs text-destructive">{t(policyError(price, value)!)}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("Minimum allowed price")}: <strong>{inr(policyFloor(price, value))}</strong> ·{" "}
              {t("Private owner limit")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Two bids · Three-minute price validity · No additional offers")}
          </p>
        </fieldset>
      )}
      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("Bargaining rules")}</DialogTitle>
          </DialogHeader>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {OWNER_BARGAIN_RULES.map((rule) => (
              <li key={rule}>{t(rule)}</li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function BargainPolicyEditor({ productId, price }: { productId: string; price: number }) {
  const { isOwner } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BargainPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ["product-bargain-policy", productId];
  const query = useQuery({
    queryKey: key,
    enabled: isOwner,
    retry: false,
    queryFn: async () => {
      const { data, error } = await ownerBargainRpc("owner_catalog_bargain_policy", {
        _product_id: productId,
      });
      if (error) throw Error(error.message);
      return data as BargainPolicy;
    },
  });
  if (!isOwner) return null;
  const value = draft ?? query.data ?? DEFAULT_BARGAIN_POLICY;
  return (
    <div className="space-y-2">
      <BargainPolicyFields
        value={value}
        onChange={setDraft}
        price={price}
        disabled={!query.isSuccess || busy}
      />
      {query.error && (
        <p className="text-xs text-muted-foreground">
          {t("Bargaining support is not installed. Existing product editing still works.")}
        </p>
      )}
      {draft && (
        <Button
          variant="outline"
          disabled={busy || !query.isSuccess || !!policyError(price, value)}
          onClick={async () => {
            setBusy(true);
            try {
              const saved = await saveBargainPolicy(productId, value);
              qc.setQueryData(key, saved);
              setDraft(null);
              toast.success(t("Bargaining settings saved"));
            } catch (e) {
              toast.error(t((e as Error).message));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t(busy ? "Saving…" : "Save bargaining settings")}
        </Button>
      )}
    </div>
  );
}
