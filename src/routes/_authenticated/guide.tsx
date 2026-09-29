import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceGuide } from "@/components/WorkspaceGuide";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({ meta: [{ title: "Guide — SoleStack POS" }, { name: "description", content: "Optional guide to SoleStack POS in Hinglish, English and Hindi." }, { property: "og:title", content: "Guide — SoleStack POS" }, { property: "og:description", content: "Learn the shop tools in Hinglish, English and Hindi whenever you like." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <div className="mx-auto max-w-3xl"><PageHeader title="Guide" /><WorkspaceGuide /></div>,
});