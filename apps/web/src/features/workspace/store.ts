import type { Route as ClimbingRoute, Hold, ImageAsset, Wall } from "@pinto/shared";
import { create } from "zustand";
import { assertRouteIntegrity } from "../../domain/route-invariants";
import { shareRoutePng } from "../../infrastructure/api/discord";
import { exportRoutePng } from "../../infrastructure/export/route-png";
import {
  deleteHold as deleteHoldRecord,
  deleteRoute as deleteRouteRecord,
  deleteWall,
  getDiscordSettings,
  getImage,
  getSetting,
  getWall,
  listHolds,
  listRoutes,
  listWalls,
  saveHold,
  saveImage,
  saveRoute,
  saveSetting,
  saveWall,
} from "../../infrastructure/storage/database";

const markerColors = ["#e96d4d", "#2f7a68", "#d2a72c", "#5677a8", "#8e5d92"];
const pendingNotifications = new Set<string>();

type EditorSnapshot = {
  holds: Hold[];
  routes: ClimbingRoute[];
  selectedRouteId: string | null;
};

type RouteDraft = Pick<ClimbingRoute, "name"> &
  Partial<
    Omit<
      ClimbingRoute,
      | "id"
      | "wallId"
      | "name"
      | "holdIds"
      | "startHoldIds"
      | "finishHoldIds"
      | "source"
      | "createdAt"
      | "updatedAt"
    >
  >;

type WorkspaceState = {
  walls: Wall[];
  holds: Hold[];
  routes: ClimbingRoute[];
  selectedWallId: string | null;
  selectedRouteId: string | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  isLoading: boolean;
  error: string | null;
  loadWalls: () => Promise<void>;
  loadWall: (wallId: string) => Promise<void>;
  createWall: (file: File, name: string, inclination?: number) => Promise<Wall>;
  removeWall: (wallId: string) => Promise<void>;
  renameWall: (wallId: string, name: string) => Promise<void>;
  addHold: (position: Hold["position"]) => Promise<Hold>;
  moveHold: (holdId: string, position: Hold["position"]) => Promise<void>;
  updateHold: (holdId: string, patch: Partial<Hold>) => Promise<void>;
  removeHold: (holdId: string) => Promise<void>;
  createRoute: (draft: RouteDraft) => Promise<ClimbingRoute>;
  updateRoute: (routeId: string, patch: Partial<ClimbingRoute>) => Promise<void>;
  duplicateRoute: (routeId: string) => Promise<ClimbingRoute>;
  removeRoute: (routeId: string) => Promise<void>;
  selectRoute: (routeId: string | null) => void;
  appendHold: (holdId: string) => Promise<void>;
  removeRouteHold: (holdId: string) => Promise<void>;
  moveRouteHold: (holdId: string, delta: -1 | 1) => Promise<void>;
  setRouteRole: (holdId: string, role: "start" | "normal" | "finish") => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  notify: (message: string | null) => void;
};

function snapshot(
  state: Pick<WorkspaceState, "holds" | "routes" | "selectedRouteId">,
): EditorSnapshot {
  return { holds: state.holds, routes: state.routes, selectedRouteId: state.selectedRouteId };
}

function nextHistory(past: EditorSnapshot[], current: EditorSnapshot): EditorSnapshot[] {
  return [...past.slice(-99), current];
}

function isHeicFile(file: File): boolean {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(
      file.type.toLowerCase(),
    )
  );
}

async function prepareWallImage(file: File): Promise<Blob> {
  if (!isHeicFile(file)) return file;
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  } catch {
    throw new Error("HEIC画像を読み込めませんでした。別の画像を選択してください。");
  }
}

function touchRoutesForHold(routes: ClimbingRoute[], holdId: string): ClimbingRoute[] {
  const updatedAt = new Date().toISOString();
  return routes.map((route) => (route.holdIds.includes(holdId) ? { ...route, updatedAt } : route));
}

async function persistSnapshot(wallId: string, editor: EditorSnapshot): Promise<void> {
  const [storedHolds, storedRoutes] = await Promise.all([listHolds(wallId), listRoutes(wallId)]);
  const holdsById = new Map(editor.holds.map((hold) => [hold.id, hold]));
  const routesById = new Map(editor.routes.map((route) => [route.id, route]));
  await Promise.all([
    ...storedHolds
      .filter((hold) => !holdsById.has(hold.id))
      .map((hold) => deleteHoldRecord(hold.id)),
    ...storedRoutes
      .filter((route) => !routesById.has(route.id))
      .map((route) => deleteRouteRecord(route.id)),
    ...editor.holds.map(saveHold),
    ...editor.routes.map(saveRoute),
  ]);
}

async function notifyDiscord(
  route: ClimbingRoute,
  event: "create" | "update",
  reportError: (message: string) => void,
): Promise<void> {
  const eventKey = `${route.id}:${event}:${route.updatedAt}`;
  if (pendingNotifications.has(eventKey)) return;
  pendingNotifications.add(eventKey);
  try {
    const settings = await getDiscordSettings();
    if (
      !settings?.webhookUrl ||
      (event === "create" && !settings.notifyOnCreate) ||
      (event === "update" && !settings.notifyOnUpdate)
    )
      return;
    const sentEvents = (await getSetting<string[]>("discord.sentEvents")) ?? [];
    if (sentEvents.includes(eventKey)) return;
    const wall = await getWall(route.wallId);
    const image = wall ? await getImage(wall.imageId) : undefined;
    if (!wall || !image) return;
    const png = await exportRoutePng(
      image.blob,
      wall.width,
      wall.height,
      await listHolds(wall.id),
      route,
    );
    await shareRoutePng(
      settings.webhookUrl,
      {
        name: route.name,
        grade: route.grade,
        author: route.author,
        gymName: route.gymName,
        holdCount: route.holdIds.length,
      },
      png,
    );
    await saveSetting("discord.sentEvents", [...sentEvents.slice(-199), eventKey]);
  } catch (reason) {
    reportError(reason instanceof Error ? reason.message : "Discord通知に失敗しました。");
  } finally {
    pendingNotifications.delete(eventKey);
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  walls: [],
  holds: [],
  routes: [],
  selectedWallId: null,
  selectedRouteId: null,
  past: [],
  future: [],
  isLoading: false,
  error: null,
  async loadWalls() {
    set({ isLoading: true, error: null });
    try {
      set({ walls: await listWalls(), isLoading: false });
    } catch {
      set({ error: "ローカルデータを読み込めませんでした。", isLoading: false });
    }
  },
  async loadWall(wallId) {
    set({ isLoading: true, error: null });
    try {
      const [holds, routes] = await Promise.all([listHolds(wallId), listRoutes(wallId)]);
      set({
        selectedWallId: wallId,
        holds,
        routes,
        selectedRouteId: routes[0]?.id ?? null,
        past: [],
        future: [],
        isLoading: false,
      });
    } catch {
      set({ error: "壁の編集データを読み込めませんでした。", isLoading: false });
    }
  },
  async createWall(file, name, inclination) {
    if (!file.type.startsWith("image/") && !isHeicFile(file)) {
      throw new Error("画像ファイルを選択してください。");
    }
    const imageBlob = await prepareWallImage(file);
    const bitmap = await createImageBitmap(imageBlob);
    const now = new Date().toISOString();
    const image: ImageAsset = {
      id: crypto.randomUUID(),
      blob: imageBlob,
      mimeType: imageBlob.type,
      width: bitmap.width,
      height: bitmap.height,
      size: imageBlob.size,
      createdAt: now,
    };
    bitmap.close();
    const wall: Wall = {
      id: crypto.randomUUID(),
      name: name.trim() || "名前のない壁",
      imageId: image.id,
      width: image.width,
      height: image.height,
      ...(inclination === undefined ? {} : { inclination }),
      createdAt: now,
      updatedAt: now,
    };
    await saveImage(image);
    await saveWall(wall);
    set((state) => ({ walls: [wall, ...state.walls] }));
    return wall;
  },
  async removeWall(wallId) {
    await deleteWall(wallId);
    set((state) => ({ walls: state.walls.filter((wall) => wall.id !== wallId) }));
  },
  async renameWall(wallId, name) {
    const state = get();
    const wall = state.walls.find((item) => item.id === wallId);
    if (!wall || !name.trim()) return;
    const updated = { ...wall, name: name.trim(), updatedAt: new Date().toISOString() };
    await saveWall(updated);
    set({ walls: state.walls.map((item) => (item.id === wallId ? updated : item)) });
  },
  async addHold(position) {
    const state = get();
    const wallId = state.selectedWallId;
    if (!wallId) throw new Error("編集する壁を選択してください。");
    const now = new Date().toISOString();
    const hold: Hold = {
      id: crypto.randomUUID(),
      wallId,
      position,
      detectionSource: "manual",
      color: markerColors[get().holds.length % markerColors.length],
      createdAt: now,
      updatedAt: now,
    };
    set({
      holds: [...state.holds, hold],
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await saveHold(hold);
    return hold;
  },
  async moveHold(holdId, position) {
    const state = get();
    const moved = state.holds.map((hold) =>
      hold.id === holdId ? { ...hold, position, updatedAt: new Date().toISOString() } : hold,
    );
    const changed = moved.find((hold) => hold.id === holdId);
    if (!changed) return;
    const updatedRouteIds = new Set(
      state.routes.filter((route) => route.holdIds.includes(holdId)).map((route) => route.id),
    );
    const routes = touchRoutesForHold(state.routes, holdId);
    const updatedRoutes = routes.filter((route) => updatedRouteIds.has(route.id));
    set({ holds: moved, routes, past: nextHistory(state.past, snapshot(state)), future: [] });
    await Promise.all([saveHold(changed), ...updatedRoutes.map(saveRoute)]);
    updatedRoutes.forEach(
      (route) => void notifyDiscord(route, "update", (message) => get().notify(message)),
    );
  },
  async updateHold(holdId, patch) {
    const state = get();
    const holds = state.holds.map((hold) =>
      hold.id === holdId ? { ...hold, ...patch, updatedAt: new Date().toISOString() } : hold,
    );
    const updated = holds.find((hold) => hold.id === holdId);
    if (!updated) return;
    const updatedRouteIds = new Set(
      state.routes.filter((route) => route.holdIds.includes(holdId)).map((route) => route.id),
    );
    const routes = touchRoutesForHold(state.routes, holdId);
    const updatedRoutes = routes.filter((route) => updatedRouteIds.has(route.id));
    set({ holds, routes, past: nextHistory(state.past, snapshot(state)), future: [] });
    await Promise.all([saveHold(updated), ...updatedRoutes.map(saveRoute)]);
    updatedRoutes.forEach(
      (route) => void notifyDiscord(route, "update", (message) => get().notify(message)),
    );
  },
  async removeHold(holdId) {
    const state = get();
    const nextHolds = state.holds.filter((hold) => hold.id !== holdId);
    const updatedRouteIds = new Set(
      state.routes.filter((route) => route.holdIds.includes(holdId)).map((route) => route.id),
    );
    const updatedAt = new Date().toISOString();
    const nextRoutes = state.routes.map((route) =>
      route.holdIds.includes(holdId)
        ? {
            ...route,
            holdIds: route.holdIds.filter((id) => id !== holdId),
            startHoldIds: route.startHoldIds.filter((id) => id !== holdId),
            finishHoldIds: route.finishHoldIds.filter((id) => id !== holdId),
            updatedAt,
          }
        : route,
    );
    const updatedRoutes = nextRoutes.filter((route) => updatedRouteIds.has(route.id));
    set({
      holds: nextHolds,
      routes: nextRoutes,
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await deleteHoldRecord(holdId);
    await Promise.all(updatedRoutes.map(saveRoute));
    updatedRoutes.forEach(
      (route) => void notifyDiscord(route, "update", (message) => get().notify(message)),
    );
  },
  async createRoute(draft) {
    const state = get();
    const wallId = state.selectedWallId;
    if (!wallId) throw new Error("壁を選択してください。");
    const now = new Date().toISOString();
    const route: ClimbingRoute = {
      ...draft,
      id: crypto.randomUUID(),
      wallId,
      name: draft.name.trim() || "新しいルート",
      holdIds: [],
      startHoldIds: [],
      finishHoldIds: [],
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    set({
      routes: [...state.routes, route],
      selectedRouteId: route.id,
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await saveRoute(route);
    void notifyDiscord(route, "create", (message) => get().notify(message));
    return route;
  },
  async updateRoute(routeId, patch) {
    const state = get();
    const routes = state.routes.map((route) =>
      route.id === routeId ? { ...route, ...patch, updatedAt: new Date().toISOString() } : route,
    );
    const updated = routes.find((route) => route.id === routeId);
    if (!updated) return;
    assertRouteIntegrity(updated, new Set(state.holds.map((hold) => hold.id)));
    set({ routes, past: nextHistory(state.past, snapshot(state)), future: [] });
    await saveRoute(updated);
    void notifyDiscord(updated, "update", (message) => get().notify(message));
  },
  async duplicateRoute(routeId) {
    const source = get().routes.find((route) => route.id === routeId);
    if (!source) throw new Error("複製するルートが見つかりません。");
    const now = new Date().toISOString();
    const duplicate: ClimbingRoute = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      createdAt: now,
      updatedAt: now,
    };
    const state = get();
    set({
      routes: [...state.routes, duplicate],
      selectedRouteId: duplicate.id,
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await saveRoute(duplicate);
    void notifyDiscord(duplicate, "create", (message) => get().notify(message));
    return duplicate;
  },
  async removeRoute(routeId) {
    const state = get();
    const routes = state.routes.filter((route) => route.id !== routeId);
    set({
      routes,
      selectedRouteId:
        state.selectedRouteId === routeId ? (routes[0]?.id ?? null) : state.selectedRouteId,
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await deleteRouteRecord(routeId);
  },
  selectRoute(routeId) {
    set({ selectedRouteId: routeId });
  },
  async appendHold(holdId) {
    const state = get();
    const route = state.routes.find((item) => item.id === state.selectedRouteId);
    if (!route) {
      if (state.routes.length > 0 || !state.selectedWallId) return;
      await get().createRoute({ name: "新しいルート" });
      return;
    }
    if (route.holdIds.includes(holdId)) {
      await get().removeRouteHold(holdId);
      return;
    }
    await get().updateRoute(route.id, { holdIds: [...route.holdIds, holdId] });
  },
  async removeRouteHold(holdId) {
    const state = get();
    const route = state.routes.find((item) => item.id === state.selectedRouteId);
    if (!route) return;
    await get().updateRoute(route.id, {
      holdIds: route.holdIds.filter((id) => id !== holdId),
      startHoldIds: route.startHoldIds.filter((id) => id !== holdId),
      finishHoldIds: route.finishHoldIds.filter((id) => id !== holdId),
    });
  },
  async moveRouteHold(holdId, delta) {
    const state = get();
    const route = state.routes.find((item) => item.id === state.selectedRouteId);
    if (!route) return;
    const index = route.holdIds.indexOf(holdId);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= route.holdIds.length) return;
    const holdIds = [...route.holdIds];
    [holdIds[index], holdIds[destination]] = [holdIds[destination], holdIds[index]];
    await get().updateRoute(route.id, { holdIds });
  },
  async setRouteRole(holdId, role) {
    const state = get();
    const route = state.routes.find((item) => item.id === state.selectedRouteId);
    if (!route?.holdIds.includes(holdId)) return;
    const startHoldIds =
      role === "start"
        ? [...route.startHoldIds.filter((id) => id !== holdId), holdId]
        : route.startHoldIds.filter((id) => id !== holdId);
    const finishHoldIds =
      role === "finish"
        ? [...route.finishHoldIds.filter((id) => id !== holdId), holdId]
        : route.finishHoldIds.filter((id) => id !== holdId);
    await get().updateRoute(route.id, { startHoldIds, finishHoldIds });
  },
  async undo() {
    const state = get();
    const previous = state.past.at(-1);
    const wallId = state.selectedWallId;
    if (!previous || !wallId) return;
    set({
      holds: previous.holds,
      routes: previous.routes,
      selectedRouteId: previous.selectedRouteId,
      past: state.past.slice(0, -1),
      future: [snapshot(state), ...state.future],
    });
    await persistSnapshot(wallId, previous);
  },
  async redo() {
    const state = get();
    const next = state.future[0];
    const wallId = state.selectedWallId;
    if (!next || !wallId) return;
    set({
      holds: next.holds,
      routes: next.routes,
      selectedRouteId: next.selectedRouteId,
      past: nextHistory(state.past, snapshot(state)),
      future: state.future.slice(1),
    });
    await persistSnapshot(wallId, next);
  },
  notify(message) {
    set({ error: message });
  },
}));
