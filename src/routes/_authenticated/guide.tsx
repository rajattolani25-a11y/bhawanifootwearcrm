import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/guide")({
  beforeLoad: () => { throw redirect({ to: "/dashboard", replace: true }); },
});
