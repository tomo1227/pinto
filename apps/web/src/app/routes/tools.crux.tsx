import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/tools/crux")({
  component: lazyRouteComponent(() => import("../../features/crux/CruxPage"), "CruxPage"),
});
