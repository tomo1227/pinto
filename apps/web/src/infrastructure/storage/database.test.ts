import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import type { Hold, ImageAsset, Route, Wall } from "@pinto/shared";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  deleteWall,
  getDiscordSettings,
  getWallPng,
  listHolds,
  listRoutes,
  saveHold,
  saveImage,
  saveRoute,
  saveWall,
  saveWallPng,
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
  it("persists the latest generated PNG separately for each wall", async () => {
    expect(await getWallPng(wall.id)).toBeUndefined();
    const png = new NodeBlob(["png"], { type: "image/png" });
    await saveWallPng(wall.id, png);
    await closeDatabase();
    const stored = await getWallPng(wall.id);
    expect(stored?.type).toBe("image/png");
    expect(await stored?.arrayBuffer()).toEqual(await png.arrayBuffer());
    expect(await getWallPng("other-wall")).toBeUndefined();
  });

  it("stores walls, image blobs, holds and routes independently", async () => {
    await saveImage(image);
    await saveWall(wall);
    await saveHold(hold);
    await saveRoute(route);
    expect(await listHolds(wall.id)).toEqual([hold]);
    expect(await listRoutes(wall.id)).toEqual([route]);
    expect(await getDiscordSettings()).toBeUndefined();
  });

  it("replaces a wall's existing route when saving another route", async () => {
    const replacement = { ...route, id: "route-2", name: "Replacement" };
    await saveHold(hold);
    await saveRoute(route);
    await saveRoute(replacement);

    expect(await listRoutes(wall.id)).toEqual([replacement]);
  });

  it("deletes existing routes when upgrading the local database", async () => {
    const legacyDatabase = await openDB("pinto-local", 1, {
      upgrade(database) {
        const routes = database.createObjectStore("routes", { keyPath: "id" });
        routes.createIndex("by-wall", "wallId");
        routes.createIndex("by-updated", "updatedAt");
      },
    });
    await legacyDatabase.put("routes", route);
    await legacyDatabase.put("routes", { ...route, id: "route-2" });
    legacyDatabase.close();

    expect(await listRoutes(wall.id)).toEqual([]);
  });

  it("cascades wall deletion to its holds and routes", async () => {
    await saveImage(image);
    await saveWall(wall);
    await saveHold(hold);
    await saveRoute(route);
    await saveWallPng(wall.id, image.blob);
    await deleteWall(wall.id);
    expect(await listHolds(wall.id)).toEqual([]);
    expect(await listRoutes(wall.id)).toEqual([]);
    expect(await getWallPng(wall.id)).toBeUndefined();
  });
});
