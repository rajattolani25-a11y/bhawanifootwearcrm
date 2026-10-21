import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Frontend navigation guard; database permissions remain authoritative. */
export async function requireOwnerRoute({ context }: { context: { user: { id: string } } }) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (error || !data) throw redirect({ to: "/pos", replace: true });
}
