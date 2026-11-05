import { supabase } from "@/integrations/supabase/client";
import { readBargainPolicy, type BargainPolicy } from "./catalog-bargain";
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
export const ownerBargainRpc = supabase.rpc.bind(supabase) as unknown as Rpc;
export async function saveBargainPolicy(productId: string, policy: BargainPolicy) {
  const checked = readBargainPolicy(policy);
  const { data, error } = await ownerBargainRpc("save_catalog_bargain_policy", {
    _product_id: productId,
    _policy: checked,
    _expected_revision: checked.revision,
  });
  if (error) throw Error(error.message);
  return readBargainPolicy(data);
}
