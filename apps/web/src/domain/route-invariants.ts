import type { Route as ClimbingRoute } from "@pinto/shared";

export function assertRouteIntegrity(
  route: ClimbingRoute,
  availableHoldIds: ReadonlySet<string>,
): void {
  const routeHoldIds = new Set(route.holdIds);
  if (routeHoldIds.size !== route.holdIds.length)
    throw new Error("Route hold order cannot contain duplicates.");
  if (route.holdIds.some((holdId) => !availableHoldIds.has(holdId))) {
    throw new Error("Every route hold must belong to the route wall.");
  }
  if ([...route.startHoldIds, ...route.finishHoldIds].some((holdId) => !routeHoldIds.has(holdId))) {
    throw new Error("Start and finish holds must be included in the route.");
  }
}
