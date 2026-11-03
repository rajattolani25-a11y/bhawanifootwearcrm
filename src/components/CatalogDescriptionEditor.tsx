import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { CATALOG_DESCRIPTION_LIMIT } from "@/lib/catalog-description";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

/** An older database must not break the existing product editor. */
export function CatalogDescriptionEditor({
  productId,
  onPreview,
  onEditing,
}: {
  productId: string;
  onPreview: (id: string, value: string) => void;
  onEditing: (dirty: boolean, saving: boolean) => void;
}) {
  const { isOwner, loading } = useAuth(),
    { t } = useLang(),
    qc = useQueryClient();
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryKey = ["catalog-product-description", productId];
  const query = useQuery({
    queryKey,
    enabled: !loading && isOwner,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,catalog_description")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const saved = query.data?.catalog_description ?? "";
  const value = draft ?? saved;
  const dirty = draft !== null && value !== saved;
  const missing =
    query.error && ["42703", "PGRST204"].includes((query.error as { code?: string }).code ?? "");
  useEffect(() => {
    onPreview(productId, value);
  }, [productId, value, onPreview]);
  useEffect(() => {
    onEditing(dirty, saving);
  }, [dirty, saving, onEditing]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  async function save() {
    if (!isOwner || saving || !query.isSuccess || !dirty) return;
    const description = value.trim();
    if (description.length > CATALOG_DESCRIPTION_LIMIT) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ catalog_description: description || null })
        .eq("id", productId)
        .select("id,catalog_description")
        .single();
      if (error) throw error;
      if (data.id !== productId || (data.catalog_description ?? "") !== description)
        throw Error(t("Description save could not be confirmed."));
      qc.setQueryData(queryKey, data);
      setDraft(null);
      toast.success(t("Product description saved"));
    } catch {
      toast.error(t("Could not save description. Your changes are still here."));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !isOwner) return null;
  return (
    <section className="space-y-2 border-t pt-4" aria-label={t("Product description editor")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-semibold">
          {t("Product description")}
        </label>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t("Optional")}
        </span>
      </div>
      <p id={`${inputId}-help`} className="text-xs leading-relaxed text-muted-foreground">
        {t("Add material, comfort, fit or care details. Leave blank to hide the description.")}
      </p>
      {query.isPending && (
        <p role="status" className="text-sm">
          {t("Loading description…")}
        </p>
      )}
      {query.error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>
            {t(
              missing
                ? "Product descriptions need a database update before they can be saved."
                : "Could not load the description. Retry before editing.",
            )}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}
      <Textarea
        id={inputId}
        value={value}
        rows={5}
        maxLength={CATALOG_DESCRIPTION_LIMIT}
        disabled={saving || !query.isSuccess}
        aria-describedby={`${inputId}-help ${inputId}-count`}
        placeholder={t("Describe this product for your customers…")}
        onChange={(event) => setDraft(event.target.value)}
        className="resize-y break-words"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span role="status">
          {dirty
            ? t("Unsaved description changes")
            : t("Shown in the public catalog after saving.")}
        </span>
        <span id={`${inputId}-count`} data-no-translate>
          {value.length} / {CATALOG_DESCRIPTION_LIMIT}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || !query.isSuccess || !dirty}
        >
          {t(saving ? "Saving…" : "Save description")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDraft(null)}
          disabled={saving || !dirty}
        >
          {t("Discard changes")}
        </Button>
      </div>
    </section>
  );
}
