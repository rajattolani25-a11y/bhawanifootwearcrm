import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { catalogTheme, type CatalogThemeId } from "@/lib/catalog-themes";
import { CatalogThemePicker } from "./CatalogThemePicker";
import { Button } from "./ui/button";
import { useState } from "react";

/** Owner-only editor. Theme writes stay disabled until shared storage supports them. */
export function CatalogThemeSettings({
  value,
  onChange,
}: {
  value: CatalogThemeId;
  onChange: (value: CatalogThemeId) => void;
}) {
  const { isOwner, loading } = useAuth(),
    { t } = useLang(),
    qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["catalog-theme-settings"],
    enabled: !loading && isOwner,
    retry: false,
    refetchOnWindowFocus: false,
    // All fields here are public-safe presentation values. The old three-flag table still loads.
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_presentation_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (query.data) onChange(catalogTheme(query.data.theme).id);
  }, [query.data, onChange]);
  if (loading || !isOwner) return null;
  const supported = typeof query.data?.theme === "string";
  const dirty = supported && value !== catalogTheme(query.data?.theme).id;
  async function save() {
    if (!supported || !dirty || saving || query.error) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("catalog_presentation_settings")
        .update({ theme: value })
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      if (data.theme !== value) throw new Error(t("Theme save could not be confirmed."));
      qc.setQueryData(["catalog-theme-settings"], data);
      toast.success(t("Catalog theme saved"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <CatalogThemePicker value={value} onChange={onChange} disabled={query.isPending || saving} />
      {query.error ? (
        <div role="alert" className="my-2 text-xs">
          <p>{t("Theme preferences could not be loaded.")}</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      ) : (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          {t(
            query.isPending
              ? "Loading appearance settings…"
              : supported
                ? "Save to apply this banner theme for all customers on their next catalog visit."
                : "Theme selections only affect this preview. Shared theme saving is not enabled yet.",
          )}
        </p>
      )}
      <Button onClick={save} disabled={!dirty || saving || !!query.error}>
        {t(saving ? "Saving…" : "Save catalog theme")}
      </Button>
    </div>
  );
}
