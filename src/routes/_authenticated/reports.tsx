import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — SoleStack POS" }, { name: "description", content: "Reports in SoleStack POS." }] }),
  component: () => <ComingSoon title="Reports" phase="Phase 5" points={['Sales, profit, brand and staff reports']} />,
});
