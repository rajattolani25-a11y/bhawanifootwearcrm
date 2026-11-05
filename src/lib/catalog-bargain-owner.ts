import { supabase } from "@/integrations/supabase/client";
import type { BargainPolicy } from "./catalog-bargain";
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
export const ownerBargainRpc = supabase.rpc.bind(supabase) as unknown as Rpc;
export async function saveBargainPolicy(productId: string, policy: BargainPolicy) {
  const { data, error } = await ownerBargainRpc("save_catalog_bargain_policy", {
    _product_id: productId,
    _policy: policy,
    _expected_revision: policy.revision,
  });
  if (error) throw Error(error.message);
  return data as BargainPolicy;
}
