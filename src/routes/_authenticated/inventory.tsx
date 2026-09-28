import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory Matrix — SoleStack POS" }, { name: "description", content: "Inventory Matrix in SoleStack POS." }] }),
  component: () => <ComingSoon title="Inventory Matrix" phase="Phase 4" points={['Article × size grid with quantities', 'Excel/CSV bulk upload with preview', 'Size Finder with rack location', 'Low (<3) and dead stock alerts']} />,
});
