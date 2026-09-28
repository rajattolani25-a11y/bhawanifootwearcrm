import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/purchase")({
  head: () => ({ meta: [{ title: "Purchase — SoleStack POS" }, { name: "description", content: "Purchase in SoleStack POS." }] }),
  component: () => <ComingSoon title="Purchase" phase="Phase 4" points={['Supplier invoices with GST', 'Stock added to sizes automatically']} />,
});
