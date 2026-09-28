import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — SoleStack POS" }, { name: "description", content: "Suppliers in SoleStack POS." }] }),
  component: () => <ComingSoon title="Suppliers" phase="Phase 4" points={['Supplier list, credit days, brands']} />,
});
