import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PRESENTATION_DEFAULTS,
  catalogPresentation,
  type CatalogPresentation,
} from "@/lib/catalog-presentation";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
const fields = [
  [
    "gallery_enabled",
    "Show spotlight gallery",
    "Feature products from the customer's current filters.",
  ],
  [
    "category_accents",
    "Category colour accents",
    "Use coordinated colours when customers change category or type.",
  ],
  [
    "motion_enabled",
    "Catalog animations",
    "Allow gallery transitions, hero motion and category colour transitions. Reduced-motion preferences still take priority.",
  ],
] as const;
/** Owner UI only. Database RLS separately enforces owner-only updates. */
export function CatalogPresentationSettings() {
  const { isOwner, loading } = useAuth(),
    { t } = useLang(),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ["catalog-presentation-settings"],
    enabled: !loading && isOwner,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_presentation_settings")
        .select("id,gallery_enabled,category_accents,motion_enabled")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return catalogPresentation(data);
    },
  });
  const [draft, setDraft] = useState<CatalogPresentation>({ ...PRESENTATION_DEFAULTS });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  if (loading || !isOwner) return null;
  const missingStorage = ["42P01", "PGRST205"].includes(
    (query.error as { code?: string } | null)?.code ?? "",
  );
  const saved = query.data;
  const dirty = !!saved && fields.some(([key]) => draft[key] !== saved[key]);
  const save = async () => {
    if (!query.data || query.error || saving || !dirty) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("catalog_presentation_settings")
        .update(draft)
        .eq("id", 1)
        .select("gallery_enabled,category_accents,motion_enabled")
        .single();
      if (error) throw error;
      qc.setQueryData(["catalog-presentation-settings"], catalogPresentation(data));
      toast.success(t("Catalog appearance saved"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section id="catalog-appearance-controls" className="mt-6 scroll-mt-20 border-t pt-5">
      <h3 className="font-semibold">{t("Catalog appearance")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Saved for all customers on their next catalog load. No product, price or stock changes.",
        )}
      </p>
      {query.isPending && (
        <p role="status" className="mt-3 text-sm">
          {t("Loading appearance settings…")}
        </p>
      )}
      {query.error && (
        <div role="alert" className="mt-3 rounded-lg border p-3 text-sm">
          <p>
            {t(
              missingStorage
                ? "Appearance settings storage is unavailable. Apply migration 0021 in Lovable, then retry. The catalog still works."
                : "Appearance settings could not be loaded. Retry or check database permissions.",
            )}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}
      {!query.error && query.data && (
        <>
          <div className="mt-3 divide-y">
            {fields.map(([key, title, hint]) => (
              <label key={key} className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="block text-sm font-medium">{t(title)}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {t(hint)}
                  </span>
                </span>
                <Switch
                  checked={draft[key]}
                  disabled={saving}
                  onCheckedChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || !dirty}>
              {t(saving ? "Saving…" : "Save appearance")}
            </Button>
            <Button
              variant="outline"
              disabled={saving || !dirty}
              onClick={() => setDraft(query.data!)}
            >
              {t("Discard changes")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
