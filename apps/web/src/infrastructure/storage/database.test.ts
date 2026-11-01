import "fake-indexeddb/auto";
import type { Hold, ImageAsset, Route, Wall } from "@pinto/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  deleteWall,
  getDiscordSettings,
  listHolds,
  listRoutes,
  saveHold,
  saveImage,
  saveRoute,
  saveWall,
} from "./database";

const now = "2026-01-01T00:00:00.000Z";
const wall: Wall = {
  id: "wall-1",
  name: "Test wall",
  imageId: "image-1",
  width: 100,
  height: 100,
  createdAt: now,
  updatedAt: now,
};
const image: ImageAsset = {
  id: "image-1",
  blob: new Blob(["image"]),
  mimeType: "image/png",
  width: 100,
  height: 100,
  size: 5,
  createdAt: now,
};
const hold: Hold = {
  id: "hold-1",
  wallId: wall.id,
  position: { x: 0.5, y: 0.4 },
  detectionSource: "manual",
  createdAt: now,
  updatedAt: now,
};
const route: Route = {
  id: "route-1",
  wallId: wall.id,
  name: "Test route",
  holdIds: [hold.id],
  startHoldIds: [hold.id],
  finishHoldIds: [],
  source: "manual",
  createdAt: now,
  updatedAt: now,
};

afterEach(async () => {
  await closeDatabase();
  indexedDB.deleteDatabase("pinto-local");
});

describe("IndexedDB repository", () => {
  it("stores walls, image blobs, holds and routes independently", async () => {
    await saveImage(image);
    await saveWall(wall);
    await saveHold(hold);
    await saveRoute(route);
    expect(await listHolds(wall.id)).toEqual([hold]);
    expect(await listRoutes(wall.id)).toEqual([route]);
    expect(await getDiscordSettings()).toBeUndefined();
  });

  it("cascades wall deletion to its holds and routes", async () => {
    await saveImage(image);
    await saveWall(wall);
    await saveHold(hold);
    await saveRoute(route);
    await deleteWall(wall.id);
    expect(await listHolds(wall.id)).toEqual([]);
    expect(await listRoutes(wall.id)).toEqual([]);
  });
});
