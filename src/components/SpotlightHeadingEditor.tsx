import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import {
  spotlightLabel,
  spotlightStyle,
  SPOTLIGHT_LABEL_LIMIT,
} from "@/lib/catalog-spotlight-style";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** Owner-only, isolated from price/stock edits; missing SQL disables only this field. */
export function SpotlightHeadingEditor({ productId }: { productId: string }) {
  const { isOwner, loading } = useAuth();
  const { lang } = useLang();
  const copy = COPY[lang];
  const qc = useQueryClient();
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryKey = ["product-spotlight-heading", productId];
  const query = useQuery({
    queryKey,
    enabled: !loading && isOwner,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,category,catalog_spotlight_label")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const saved = query.data?.catalog_spotlight_label ?? "";
  const value = draft ?? saved;
  const normalized = spotlightLabel(value);
  const invalid = !!value.trim() && !normalized;
  const dirty = draft !== null && value !== saved;
  const missing = ["42703", "PGRST204"].includes(
    (query.error as { code?: string } | null)?.code ?? "",
  );
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  async function save() {
    if (!isOwner || saving || !query.data || !dirty || invalid) return;
    setSaving(true);
    try {
      const update = supabase
        .from("products")
        .update({ catalog_spotlight_label: normalized || null })
        .eq("id", productId);
      const guarded =
        query.data.catalog_spotlight_label === null
          ? update.is("catalog_spotlight_label", null)
          : update.eq("catalog_spotlight_label", query.data.catalog_spotlight_label);
      const { data, error } = await guarded.select("id,category,catalog_spotlight_label").single();
      if (error) throw error;
      if (data.id !== productId || (data.catalog_spotlight_label ?? "") !== normalized)
        throw Error("Unconfirmed save");
      qc.setQueryData(queryKey, data);
      setDraft(null);
      toast.success(copy.saved);
    } catch {
      toast.error(copy.failed);
    } finally {
      setSaving(false);
    }
  }
  if (loading || !isOwner) return null;
  return (
    <section className="space-y-2 border-t pt-4" aria-label={copy.title} data-no-translate>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {copy.title}
        </label>
        <span className="text-xs text-muted-foreground">{copy.optional}</span>
      </div>
      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        {copy.help}
      </p>
      {query.isPending && (
        <p role="status" className="text-sm">
          {copy.loading}
        </p>
      )}
      {query.error && (
        <div role="alert" className="text-sm text-destructive">
          <p>{missing ? copy.sql : copy.loadFailed}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {copy.retry}
          </Button>
        </div>
      )}
      <Input
        id={inputId}
        value={value}
        maxLength={SPOTLIGHT_LABEL_LIMIT}
        placeholder="COMFORT"
        disabled={saving || !query.isSuccess}
        aria-invalid={invalid}
        aria-describedby={`${inputId}-help`}
        autoCapitalize="characters"
        onChange={(event) => setDraft(event.target.value.toUpperCase())}
      />
      {invalid && (
        <p role="alert" className="text-xs text-destructive">
          {copy.invalid}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {copy.preview}: <strong>{normalized || spotlightStyle(query.data?.category).word}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving || !query.isSuccess || !dirty || invalid}
          onClick={() => void save()}
        >
          {saving ? copy.saving : copy.save}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving || !query.isSuccess || !value}
          onClick={() => setDraft("")}
        >
          {copy.automatic}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving || !dirty}
          onClick={() => setDraft(null)}
        >
          {copy.discard}
        </Button>
      </div>
    </section>
  );
}

const COPY = {
  english: {
    title: "Spotlight heading",
    optional: "Optional",
    help: "One word, up to 12 English letters/numbers or a hyphen; start with a letter. Blank uses the category heading. Category and colours stay unchanged.",
    loading: "Loading heading…",
    sql: "Apply the Spotlight heading SQL update, then retry.",
    loadFailed: "Could not load the heading. Retry before editing.",
    retry: "Retry",
    invalid: "Use one word of 1–12 letters/numbers or a hyphen, starting with a letter.",
    preview: "Heading preview",
    save: "Save Spotlight heading",
    saving: "Saving…",
    automatic: "Use automatic heading",
    discard: "Discard changes",
    saved: "Spotlight heading saved",
    failed:
      "Could not save. Your changes are still here. Reload if another owner edited this heading.",
  },
  hindi: {
    title: "स्पॉटलाइट शीर्षक",
    optional: "वैकल्पिक",
    help: "एक शब्द, अधिकतम 12 अंग्रेज़ी अक्षर/अंक या हाइफ़न; शुरुआत अक्षर से करें। खाली रखने पर कैटेगरी का शीर्षक आएगा। कैटेगरी और रंग नहीं बदलेंगे।",
    loading: "शीर्षक लोड हो रहा है…",
    sql: "पहले Spotlight heading का SQL अपडेट चलाएँ, फिर दोबारा कोशिश करें।",
    loadFailed: "शीर्षक लोड नहीं हुआ। संपादन से पहले दोबारा कोशिश करें।",
    retry: "फिर कोशिश करें",
    invalid: "अक्षर से शुरू होने वाला 1–12 अक्षर/अंक या हाइफ़न का एक शब्द लिखें।",
    preview: "शीर्षक प्रीव्यू",
    save: "स्पॉटलाइट शीर्षक सहेजें",
    saving: "सहेज रहे हैं…",
    automatic: "स्वचालित शीर्षक रखें",
    discard: "बदलाव हटाएँ",
    saved: "स्पॉटलाइट शीर्षक सहेजा गया",
    failed: "सहेजा नहीं जा सका। बदलाव सुरक्षित हैं। दूसरे मालिक ने संपादन किया हो तो रीलोड करें।",
  },
  hinglish: {
    title: "Spotlight heading",
    optional: "Optional",
    help: "Ek word, maximum 12 English letters/numbers ya hyphen; letter se shuru karein. Blank par category heading aayegi. Category aur colours nahi badlenge.",
    loading: "Heading load ho rahi hai…",
    sql: "Pehle Spotlight heading SQL update run karein, phir Retry karein.",
    loadFailed: "Heading load nahi hui. Edit se pehle Retry karein.",
    retry: "Retry",
    invalid: "Letter se shuru hone wala 1–12 letters/numbers ya hyphen ka ek word likhein.",
    preview: "Heading preview",
    save: "Spotlight heading save karein",
    saving: "Save ho raha hai…",
    automatic: "Automatic heading rakhein",
    discard: "Changes hata dein",
    saved: "Spotlight heading save ho gayi",
    failed:
      "Save nahi hua. Changes abhi bhi yahin hain. Kisi aur owner ne edit kiya ho toh reload karein.",
  },
};
