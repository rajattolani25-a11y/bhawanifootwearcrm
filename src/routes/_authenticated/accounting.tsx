import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/accounting")({
  head: () => ({ meta: [{ title: "Accounting — SoleStack POS" }, { name: "description", content: "Accounting in SoleStack POS." }] }),
  component: () => <ComingSoon title="Accounting" phase="Phase 5" points={['Daily tally, expenses, CSV export']} />,
});
