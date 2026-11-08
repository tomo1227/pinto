import {
  type Route as ClimbingRoute,
  formatRouteGrade,
  type Hold,
  type ImageAsset,
  type Wall,
} from "@pinto/shared";
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

const pendingNotifications = new Set<string>();
const holdSaveQueues = new Map<string, Promise<void>>();
const routeSaveQueues = new Map<string, Promise<void>>();
const wallSaveQueues = new Map<string, Promise<void>>();

function saveInOrder<T extends { id: string }>(
  queues: Map<string, Promise<void>>,
  save: (record: T) => Promise<void>,
  record: T,
): Promise<void> {
  const previous = queues.get(record.id) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(() => save(record));
  queues.set(record.id, write);
  const clearQueue = () => {
    if (queues.get(record.id) === write) queues.delete(record.id);
  };
  void write.then(clearQueue, clearQueue);
  return write;
}

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
  createWall: (
    file: File,
    name: string,
    inclination?: number,
    metadata?: Pick<Wall, "japaneseGrade" | "vGrade" | "gymName" | "tags">,
  ) => Promise<Wall>;
  removeWall: (wallId: string) => Promise<void>;
  restoreWallChanges: (wall: Wall, holds: Hold[], routes: ClimbingRoute[]) => Promise<void>;
  renameWall: (wallId: string, name: string) => Promise<void>;
  updateWall: (wallId: string, patch: Partial<Wall>) => Promise<Wall>;
  addHold: (
    position: Hold["position"],
    markerRadius?: number,
    color?: string,
    bounds?: Hold["bounds"],
    shape?: Hold["shape"],
    style?: Pick<Hold, "markerWidth" | "outlineWidth" | "outlineColor">,
  ) => Promise<Hold>;
  moveHold: (holdId: string, position: Hold["position"]) => Promise<void>;
  updateHold: (holdId: string, patch: Partial<Hold>) => Promise<void>;
  removeHold: (holdId: string) => Promise<void>;
  clearHolds: () => Promise<void>;
  createRoute: (draft: RouteDraft, initialHoldId?: string) => Promise<ClimbingRoute>;
  updateRoute: (routeId: string, patch: Partial<ClimbingRoute>) => Promise<void>;
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

function createEmptyRoute(wall: Wall): ClimbingRoute {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    wallId: wall.id,
    name: wall.name,
    holdIds: [],
    startHoldIds: [],
    finishHoldIds: [],
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };
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
        name: wall.name,
        grade:
          [wall.japaneseGrade, wall.vGrade].filter(Boolean).join(" · ") || formatRouteGrade(route),
        author: route.author,
        gymName: wall.gymName ?? route.gymName,
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
      const [holds, storedRoutes, wall] = await Promise.all([
        listHolds(wallId),
        listRoutes(wallId),
        getWall(wallId),
      ]);
      const routes = storedRoutes.length || !wall ? storedRoutes : [createEmptyRoute(wall)];
      if (routes.length && storedRoutes.length === 0) await saveRoute(routes[0]);
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
  async createWall(file, name, inclination, metadata) {
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
      ...metadata,
      ...(inclination === undefined ? {} : { inclination }),
      createdAt: now,
      updatedAt: now,
    };
    const route = createEmptyRoute(wall);
    await saveImage(image);
    await saveWall(wall);
    await saveRoute(route);
    set((state) => ({ walls: [wall, ...state.walls] }));
    return wall;
  },
  async removeWall(wallId) {
    await deleteWall(wallId);
    set((state) => ({ walls: state.walls.filter((wall) => wall.id !== wallId) }));
  },
  async restoreWallChanges(wall, holds, routes) {
    const state = get();
    const currentHolds = state.holds.filter((hold) => hold.wallId === wall.id);
    const currentRoutes = state.routes.filter((route) => route.wallId === wall.id);
    const pendingWrites = [
      wallSaveQueues.get(wall.id),
      ...Array.from(new Set([...currentHolds, ...holds].map((hold) => hold.id)), (id) =>
        holdSaveQueues.get(id),
      ),
      ...Array.from(new Set([...currentRoutes, ...routes].map((route) => route.id)), (id) =>
        routeSaveQueues.get(id),
      ),
    ].filter((write): write is Promise<void> => Boolean(write));
    await Promise.all(pendingWrites.map((write) => write.catch(() => {})));
    await Promise.all([
      saveInOrder(wallSaveQueues, saveWall, wall),
      persistSnapshot(wall.id, {
        holds,
        routes,
        selectedRouteId: state.selectedRouteId,
      }),
    ]);
    set((current) => ({
      walls: current.walls.map((item) => (item.id === wall.id ? wall : item)),
      holds: [...current.holds.filter((hold) => hold.wallId !== wall.id), ...holds],
      routes: [...current.routes.filter((route) => route.wallId !== wall.id), ...routes],
      selectedRouteId: routes.some((route) => route.id === current.selectedRouteId)
        ? current.selectedRouteId
        : (routes[0]?.id ?? null),
      past: [],
      future: [],
    }));
  },
  async renameWall(wallId, name) {
    await get().updateWall(wallId, { name: name.trim() });
  },
  async updateWall(wallId, patch) {
    const wall = get().walls.find((item) => item.id === wallId);
    if (!wall) throw new Error("壁が見つかりません。");
    const updated = { ...wall, ...patch, updatedAt: new Date().toISOString() };
    set((state) => ({
      walls: state.walls.map((item) => (item.id === wallId ? updated : item)),
    }));
    await saveInOrder(wallSaveQueues, saveWall, updated);
    return updated;
  },
  async addHold(position, markerRadius, color, bounds, shape, style) {
    const state = get();
    const wallId = state.selectedWallId;
    if (!wallId) throw new Error("編集する壁を選択してください。");
    const now = new Date().toISOString();
    const hold: Hold = {
      id: crypto.randomUUID(),
      wallId,
      position,
      ...(markerRadius === undefined ? {} : { markerRadius }),
      ...(bounds ? { bounds } : {}),
      ...(shape ? { shape } : {}),
      ...style,
      detectionSource: "manual",
      ...(color === undefined ? {} : { color }),
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
    await Promise.all([
      saveInOrder(holdSaveQueues, saveHold, updated),
      ...updatedRoutes.map((route) => saveInOrder(routeSaveQueues, saveRoute, route)),
    ]);
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
  async clearHolds() {
    const state = get();
    const wallId = state.selectedWallId;
    if (!wallId) return;
    const updatedAt = new Date().toISOString();
    const routes = state.routes.map((route) => {
      if (
        route.holdIds.length === 0 &&
        route.startHoldIds.length === 0 &&
        route.finishHoldIds.length === 0 &&
        (route.textAnnotations?.length ?? 0) === 0
      ) {
        return route;
      }
      return {
        ...route,
        holdIds: [],
        startHoldIds: [],
        finishHoldIds: [],
        textAnnotations: [],
        updatedAt,
      };
    });
    const updatedRoutes = routes.filter((route, index) => route !== state.routes[index]);
    if (state.holds.length === 0 && updatedRoutes.length === 0) return;
    set({
      holds: [],
      routes,
      past: nextHistory(state.past, snapshot(state)),
      future: [],
    });
    await Promise.all([
      ...state.holds.map((hold) => deleteHoldRecord(hold.id)),
      ...updatedRoutes.map(saveRoute),
    ]);
    updatedRoutes.forEach(
      (route) => void notifyDiscord(route, "update", (message) => get().notify(message)),
    );
  },
  async createRoute(draft, initialHoldId) {
    const state = get();
    const wallId = state.selectedWallId;
    if (!wallId) throw new Error("壁を選択してください。");
    if (state.routes.some((route) => route.wallId === wallId)) {
      throw new Error("この壁にはすでにルートがあります。");
    }
    const now = new Date().toISOString();
    const route: ClimbingRoute = {
      ...draft,
      id: crypto.randomUUID(),
      wallId,
      name: draft.name.trim() || "新しいルート",
      holdIds: initialHoldId ? [initialHoldId] : [],
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
    await saveInOrder(routeSaveQueues, saveRoute, updated);
    void notifyDiscord(updated, "update", (message) => get().notify(message));
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
    if (!route) return;
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
