import { Button } from "@/components/ui/button";
export function ListPagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="List pages"
      className="mt-4 flex flex-wrap items-center justify-end gap-3 text-sm"
    >
      <span>
        Page {page + 1} · {total} records
      </span>
      <Button variant="outline" disabled={busy || page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button
        variant="outline"
        disabled={busy || (page + 1) * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
