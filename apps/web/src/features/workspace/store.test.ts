import "fake-indexeddb/auto";
import { heicTo } from "heic-to";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getImage,
  getWall,
  listHolds,
  listRoutes,
  saveHold,
  saveImage,
  saveRoute,
  saveWall,
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

  it("persists wall-level grade, gym and tags and updates them", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 640, height: 480, close: vi.fn() }));
    const wall = await useWorkspaceStore
      .getState()
      .createWall(new File(["image"], "wall.png", { type: "image/png" }), "Test wall", undefined, {
        japaneseGrade: "5級",
        gymName: "Test Gym",
        tags: { hold: ["カチ"], move: [], type: ["ルーフ"] },
      });

    const updated = await useWorkspaceStore.getState().updateWall(wall.id, { vGrade: "V2" });

    expect(updated).toMatchObject({ japaneseGrade: "5級", vGrade: "V2", gymName: "Test Gym" });
    expect(updated.tags).toEqual({ hold: ["カチ"], move: [], type: ["ルーフ"] });
    expect(await getWall(wall.id)).toEqual(updated);
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

    const uncoloredHold = await useWorkspaceStore.getState().addHold({ x: 0.3, y: 0.3 });
    expect(uncoloredHold.color).toBeUndefined();
  });

  it("creates a route with the wall and uses it when holds are added", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 640, height: 480, close: vi.fn() }));
    const wall = await useWorkspaceStore
      .getState()
      .createWall(new File(["image"], "wall.png", { type: "image/png" }), "Test wall");
    const hold = {
      id: "hold-first",
      wallId: wall.id,
      position: { x: 0.4, y: 0.6 },
      detectionSource: "manual" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const nextHold = {
      ...hold,
      id: "hold-next",
      position: { x: 0.6, y: 0.4 },
    };
    await saveHold(hold);
    await saveHold(nextHold);
    await useWorkspaceStore.getState().loadWall(wall.id);
    expect(await listRoutes(wall.id)).toHaveLength(1);

    await useWorkspaceStore.getState().appendHold(hold.id);

    const state = useWorkspaceStore.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.selectedRouteId).toBe(state.routes[0].id);
    expect(state.routes[0].holdIds).toEqual([hold.id]);

    await useWorkspaceStore.getState().appendHold(nextHold.id);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([hold.id, nextHold.id]);
  });

  it("creates a default route when loading an existing wall without one", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    await saveImage({
      id: "image-legacy",
      blob: new Blob(["image"]),
      mimeType: "image/png",
      width: 640,
      height: 480,
      size: 5,
      createdAt: now,
    });
    await saveWall({
      id: "wall-legacy",
      name: "Legacy wall",
      imageId: "image-legacy",
      width: 640,
      height: 480,
      createdAt: now,
      updatedAt: now,
    });

    await useWorkspaceStore.getState().loadWall("wall-legacy");

    expect(useWorkspaceStore.getState().routes).toMatchObject([
      { wallId: "wall-legacy", name: "Legacy wall", holdIds: [] },
    ]);
  });

  it("does not create another route for a wall that already has one", async () => {
    useWorkspaceStore.setState({
      selectedWallId: "wall-1",
      routes: [
        {
          id: "route-1",
          wallId: "wall-1",
          name: "Existing route",
          holdIds: [],
          startHoldIds: [],
          finishHoldIds: [],
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await expect(useWorkspaceStore.getState().createRoute({ name: "Another route" })).rejects.toThrow(
      /already has|すでにルートがあります/,
    );
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
      textAnnotations: [
        { id: "text-reset", text: "Reset me", position: { x: 0.5, y: 0.5 }, color: "#ff0000" },
      ],
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
    expect(useWorkspaceStore.getState().routes[0].textAnnotations).toEqual([]);
    expect(await listHolds(hold.wallId)).toEqual([]);
    expect((await listRoutes(hold.wallId))[0].holdIds).toEqual([]);

    await useWorkspaceStore.getState().undo();

    expect(useWorkspaceStore.getState().holds).toEqual([hold]);
    expect(useWorkspaceStore.getState().routes[0].holdIds).toEqual([hold.id]);
    expect(useWorkspaceStore.getState().routes[0].textAnnotations).toHaveLength(1);
    expect(await listHolds(hold.wallId)).toEqual([hold]);
  });
});
