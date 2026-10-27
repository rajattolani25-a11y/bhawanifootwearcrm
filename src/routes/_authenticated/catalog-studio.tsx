import { createFileRoute } from "@tanstack/react-router";
import { CatalogSettings } from "@/components/CatalogSettings";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { requireOwnerRoute } from "@/lib/owner-route";

export const Route = createFileRoute("/_authenticated/catalog-studio")({
  beforeLoad: requireOwnerRoute,
  head: () => ({ meta: [{ title: "Catalog Studio — SoleStack POS" }] }),
  component: CatalogStudio,
});

function CatalogStudio() {
  const { isOwner, loading } = useAuth();
  if (loading) return <p role="status">Checking owner access…</p>;
  if (!isOwner) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Catalog Studio"
        subtitle="Manage your banner, themes, product photos, visibility, offers and delivery."
        actions={
          <Button variant="outline" asChild>
            <a href="/catalog" target="_blank" rel="noreferrer">
              Open catalog
            </a>
          </Button>
        }
      />
      <CatalogSettings />
    </div>
  );
}
