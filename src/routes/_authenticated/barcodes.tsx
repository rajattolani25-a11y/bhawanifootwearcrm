import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/barcodes")({
  head: () => ({ meta: [{ title: "Barcodes — SoleStack POS" }, { name: "description", content: "Barcodes in SoleStack POS." }] }),
  component: () => <ComingSoon title="Barcodes" phase="Phase 4" points={['Barcode labels for new stock']} />,
});
