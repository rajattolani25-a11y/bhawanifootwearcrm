import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers — SoleStack POS" }, { name: "description", content: "Customers in SoleStack POS." }] }),
  component: () => <ComingSoon title="Customers" phase="Phase 3" points={['One mobile = one profile', 'Spend, history, size & brand preference', 'Stamp card and rewards']} />,
});
