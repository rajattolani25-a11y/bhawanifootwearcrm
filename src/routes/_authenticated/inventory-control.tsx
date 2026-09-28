import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/inventory-control")({
  head: () => ({ meta: [{ title: "Inventory Control — SoleStack POS" }, { name: "description", content: "Inventory Control in SoleStack POS." }] }),
  component: () => <ComingSoon title="Inventory Control" phase="Phase 4" points={['Stock adjustments and damaged/hold stock', 'Returns and exchanges']} />,
});
