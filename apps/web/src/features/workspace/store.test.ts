import "fake-indexeddb/auto";
import { heicTo } from "heic-to";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getImage,
  listHolds,
  listRoutes,
  saveHold,
  saveRoute,
} from "../../infrastructure/storage/database";
import { useWorkspaceStore } from "./store";

vi.mock("heic-to", () => ({
  heicTo: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));

afterEach(async () => {
  useWorkspaceStore.setState({
    walls: [],
    holds: [],
    routes: [],
    selectedWallId: null,
    selectedRouteId: null,
    past: [],
    future: [],
  });
  vi.unstubAllGlobals();
  await closeDatabase();
  indexedDB.deleteDatabase("pinto-local");
});

describe("wall image uploads", () => {
  it("converts and stores HEIC files as JPEG images", async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({ width: 640, height: 480, close }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const file = new File(["heic"], "wall.HEIC", { type: "image/heic" });

    const wall = await useWorkspaceStore.getState().createWall(file, "Test wall");
    const image = await getImage(wall.imageId);

    expect(heicTo).toHaveBeenCalledWith({ blob: file, type: "image/jpeg", quality: 0.92 });
    expect(image).toBeDefined();
    expect(image?.mimeType).toBe("image/jpeg");
    expect(createImageBitmap).toHaveBeenCalledWith(expect.objectContaining({ type: "image/jpeg" }));
    expect(wall.width).toBe(640);
    expect(wall.height).toBe(480);
    expect(close).toHaveBeenCalledOnce();
  });

  it("starts a new route empty and does not auto-connect subsequently added holds", async () => {
    await saveHold({
      id: "hold-1",
      wallId: "wall-1",
      position: { x: 0.2, y: 0.3 },
      detectionSource: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await saveHold({
      id: "hold-2",
      wallId: "wall-1",
      position: { x: 0.8, y: 0.7 },
      detectionSource: "manual",
      createdAt: "2026-01-01T00:00:01.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    });
    useWorkspaceStore.setState({
      selectedWallId: "wall-1",
      holds: [
        {
          id: "hold-1",
          wallId: "wall-1",
          position: { x: 0.2, y: 0.3 },
          detectionSource: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "hold-2",
          wallId: "wall-1",
          position: { x: 0.8, y: 0.7 },
          detectionSource: "manual",
          createdAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    const route = await useWorkspaceStore.getState().createRoute({ name: "Test route" });
    const addedHold = await useWorkspaceStore.getState().addHold({ x: 0.5, y: 0.5 }, 32, "#22aa55");

    expect(route.holdIds).toEqual([]);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([]);
    expect(addedHold.markerRadius).toBe(32);
    expect(addedHold.color).toBe("#22aa55");
    await useWorkspaceStore.getState().appendHold(addedHold.id);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([addedHold.id]);

    await useWorkspaceStore.getState().setRouteRole(addedHold.id, "finish");
    await useWorkspaceStore.getState().appendHold(addedHold.id);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([]);
    expect(useWorkspaceStore.getState().routes[0].finishHoldIds).toEqual([]);
  });

  it("creates the first route when a hold is added while there are no routes", async () => {
    const hold = {
      id: "hold-first",
      wallId: "wall-1",
      position: { x: 0.4, y: 0.6 },
      detectionSource: "manual" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await saveHold(hold);
    useWorkspaceStore.setState({ selectedWallId: "wall-1", holds: [hold] });

    await useWorkspaceStore.getState().appendHold(hold.id);

    const state = useWorkspaceStore.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.selectedRouteId).toBe(state.routes[0].id);
    expect(state.routes[0].holdIds).toEqual([]);

    await useWorkspaceStore.getState().appendHold(hold.id);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([hold.id]);
  });

  it("clears all wall holds and route references in one undoable action", async () => {
    const hold = {
      id: "hold-reset",
      wallId: "wall-reset",
      position: { x: 0.4, y: 0.6 },
      detectionSource: "manual" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const route = {
      id: "route-reset",
      wallId: "wall-reset",
      name: "Test route",
      holdIds: [hold.id],
      startHoldIds: [hold.id],
      finishHoldIds: [],
      source: "manual" as const,
      createdAt: hold.createdAt,
      updatedAt: hold.updatedAt,
    };
    await saveHold(hold);
    await saveRoute(route);
    useWorkspaceStore.setState({
      selectedWallId: hold.wallId,
      holds: [hold],
      routes: [route],
      selectedRouteId: route.id,
    });

    await useWorkspaceStore.getState().clearHolds();

    expect(useWorkspaceStore.getState().holds).toEqual([]);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([]);
    expect(useWorkspaceStore.getState().routes[0].startHoldIds).toEqual([]);
    expect(await listHolds(hold.wallId)).toEqual([]);
    expect((await listRoutes(hold.wallId))[0].holdIds).toEqual([]);

    await useWorkspaceStore.getState().undo();

    expect(useWorkspaceStore.getState().holds).toEqual([hold]);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([hold.id]);
    expect(await listHolds(hold.wallId)).toEqual([hold]);
  });
});
