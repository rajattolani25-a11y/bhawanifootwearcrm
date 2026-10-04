import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Shop name/phone from Settings — used in every WhatsApp/SMS message. */
export function useShop() {
  const { data } = useQuery({
    queryKey: ["shop-identity"],
    staleTime: 60_000,
    queryFn: async () => (await supabase.from("store_settings").select("business_name,business_phone").eq("id", 1).maybeSingle()).data,
  });
  return { name: data?.business_name?.trim() || "Our Store", phone: data?.business_phone ?? "" };
}
