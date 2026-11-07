import type {
  Route as ClimbingRoute,
  DiscordSettings,
  Hold,
  ImageAsset,
  Wall,
} from "@pinto/shared";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

const DATABASE_NAME = "pinto-local";
export const DATABASE_VERSION = 2;

type SettingRecord = { key: string; value: unknown };

type PintoDatabase = DBSchema & {
  walls: { key: string; value: Wall; indexes: { "by-updated": string } };
  holds: {
    key: string;
    value: Hold;
    indexes: { "by-wall": string };
  };
  routes: {
    key: string;
    value: ClimbingRoute;
    indexes: { "by-wall": string; "by-updated": string };
  };
  images: { key: string; value: ImageAsset };
  settings: { key: string; value: SettingRecord };
  meta: { key: string; value: number };
};

let databasePromise: Promise<IDBPDatabase<PintoDatabase>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<PintoDatabase>> {
  databasePromise ??= openDB<PintoDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const walls = database.createObjectStore("walls", { keyPath: "id" });
        walls.createIndex("by-updated", "updatedAt");

        const holds = database.createObjectStore("holds", { keyPath: "id" });
        holds.createIndex("by-wall", "wallId");

        const routes = database.createObjectStore("routes", { keyPath: "id" });
        routes.createIndex("by-wall", "wallId");
        routes.createIndex("by-updated", "updatedAt");

        database.createObjectStore("images", { keyPath: "id" });
        database.createObjectStore("settings", { keyPath: "key" });
        const meta = database.createObjectStore("meta");
        void transaction.objectStore("meta").put(DATABASE_VERSION, "schemaVersion");
        void meta;
      }
      if (oldVersion < 2) {
        const routes = transaction.objectStore("routes");
        routes.clear();
        routes.deleteIndex("by-wall");
        routes.createIndex("by-wall", "wallId", { unique: true });
      }
    },
  });
  return databasePromise;
}

export async function listWalls(): Promise<Wall[]> {
  const database = await getDatabase();
  return (await database.getAllFromIndex("walls", "by-updated")).reverse();
}

export async function getWall(id: string): Promise<Wall | undefined> {
  return (await getDatabase()).get("walls", id);
}

export async function saveWall(wall: Wall): Promise<void> {
  const database = await getDatabase();
  await database.put("walls", wall);
}

export async function deleteWall(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(
    ["walls", "holds", "routes", "images", "settings"],
    "readwrite",
  );
  const holds = await transaction.objectStore("holds").index("by-wall").getAllKeys(id);
  const routes = await transaction.objectStore("routes").index("by-wall").getAllKeys(id);
  const wall = await transaction.objectStore("walls").get(id);
  await Promise.all([
    ...holds.map((holdId) => transaction.objectStore("holds").delete(holdId)),
    ...routes.map((routeId) => transaction.objectStore("routes").delete(routeId)),
    transaction.objectStore("walls").delete(id),
    transaction.objectStore("settings").delete(wallPngKey(id)),
    ...(wall ? [transaction.objectStore("images").delete(wall.imageId)] : []),
  ]);
  await transaction.done;
}

export async function listHolds(wallId: string): Promise<Hold[]> {
  return (await getDatabase()).getAllFromIndex("holds", "by-wall", wallId);
}

export async function saveHold(hold: Hold): Promise<void> {
  const database = await getDatabase();
  await database.put("holds", hold);
}

export async function deleteHold(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["holds", "routes"], "readwrite");
  const hold = await transaction.objectStore("holds").get(id);
  if (!hold) {
    await transaction.done;
    return;
  }
  await transaction.objectStore("holds").delete(id);
  const routes = await transaction.objectStore("routes").index("by-wall").getAll(hold.wallId);
  await Promise.all(
    routes.map((route) => {
      if (!route.holdIds.includes(id)) return Promise.resolve();
      return transaction.objectStore("routes").put({
        ...route,
        holdIds: route.holdIds.filter((holdId) => holdId !== id),
        startHoldIds: route.startHoldIds.filter((holdId) => holdId !== id),
        finishHoldIds: route.finishHoldIds.filter((holdId) => holdId !== id),
        updatedAt: new Date().toISOString(),
      });
    }),
  );
  await transaction.done;
}

export async function listRoutes(wallId: string): Promise<ClimbingRoute[]> {
  return (await getDatabase()).getAllFromIndex("routes", "by-wall", wallId);
}

export async function saveRoute(route: ClimbingRoute): Promise<void> {
  const database = await getDatabase();
  const holdIds = new Set(
    (await database.getAllFromIndex("holds", "by-wall", route.wallId)).map((hold) => hold.id),
  );
  const missingHold = route.holdIds.find((holdId) => !holdIds.has(holdId));
  if (missingHold) throw new Error("Route refers to a hold that does not belong to its wall.");
  if (
    [...route.startHoldIds, ...route.finishHoldIds].some(
      (holdId) => !route.holdIds.includes(holdId),
    )
  ) {
    throw new Error("Start and finish holds must be included in the route.");
  }
  const transaction = database.transaction("routes", "readwrite");
  const routes = transaction.store;
  const existingRouteIds = await routes.index("by-wall").getAllKeys(route.wallId);
  await Promise.all([
    ...existingRouteIds
      .filter((id) => id !== route.id)
      .map((id) => routes.delete(id)),
    routes.put(route),
  ]);
  await transaction.done;
}

export async function deleteRoute(id: string): Promise<void> {
  await (await getDatabase()).delete("routes", id);
}

export async function saveImage(image: ImageAsset): Promise<void> {
  await (await getDatabase()).put("images", image);
}

export async function getImage(id: string): Promise<ImageAsset | undefined> {
  return (await getDatabase()).get("images", id);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await getDatabase())
    .get("settings", key)
    .then((record) => record?.value as T | undefined);
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await (await getDatabase()).put("settings", { key, value });
}

function wallPngKey(wallId: string) {
  return `wall-png:${wallId}`;
}

export async function getWallPng(wallId: string): Promise<Blob | undefined> {
  return getSetting<Blob>(wallPngKey(wallId));
}

export async function saveWallPng(wallId: string, png: Blob): Promise<void> {
  await saveSetting(wallPngKey(wallId), png);
}

export async function getDiscordSettings(): Promise<DiscordSettings | undefined> {
  return getSetting<DiscordSettings>("discord");
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return;
  (await databasePromise).close();
  databasePromise = undefined;
}
