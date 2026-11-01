import type { Route } from "@pinto/shared";
import { describe, expect, it } from "vitest";
import { assertRouteIntegrity } from "./route-invariants";

const route: Route = {
  id: "route-1",
  wallId: "wall-1",
  name: "Test",
  holdIds: ["hold-a", "hold-b"],
  startHoldIds: ["hold-a"],
  finishHoldIds: ["hold-b"],
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("route integrity", () => {
  it("accepts ordered holds and endpoint roles that belong to a wall", () => {
    expect(() => assertRouteIntegrity(route, new Set(["hold-a", "hold-b"]))).not.toThrow();
  });

  it("rejects duplicate, missing and out-of-route hold references", () => {
    expect(() =>
      assertRouteIntegrity({ ...route, holdIds: ["hold-a", "hold-a"] }, new Set(["hold-a"])),
    ).toThrow(/duplicates/);
    expect(() => assertRouteIntegrity(route, new Set(["hold-a"]))).toThrow(/belong/);
    expect(() =>
      assertRouteIntegrity(
        { ...route, finishHoldIds: ["hold-c"] },
        new Set(["hold-a", "hold-b", "hold-c"]),
      ),
    ).toThrow(/included/);
  });
});
