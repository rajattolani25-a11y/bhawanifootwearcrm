import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS Billing — SoleStack POS" }, { name: "description", content: "POS Billing in SoleStack POS." }] }),
  component: () => <ComingSoon title="POS Billing" phase="Phase 3" points={['Barcode scanner + phone camera scan', 'Size chips: green in stock, red out of stock', 'Customer lookup by mobile, walk-in bills', 'Cash / UPI / Card / Split, hold bills', 'Loyalty stamps applied automatically']} />,
});
