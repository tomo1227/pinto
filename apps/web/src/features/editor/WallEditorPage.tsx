import {
  type Route as ClimbingRoute,
  type Hold,
  JAPANESE_CLIMBING_LEVELS,
  type RouteText,
  V_CLIMBING_LEVELS,
  WALL_POST_TAG_CATEGORIES,
  WALL_POST_TAG_LABELS,
  WALL_POST_TAGS,
  type Wall,
  type WallPostTags,
} from "@pinto/shared";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  MapPin,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Route as RouteIcon,
  Save,
  Settings2,
  Share2,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { shareRoutePng } from "../../infrastructure/api/discord";
import { exportRoutePng } from "../../infrastructure/export/route-png";
import { getDiscordSettings, getImage, getWall } from "../../infrastructure/storage/database";
import { useWorkspaceStore } from "../workspace/store";
import { WallCanvas } from "./WallCanvas";

type Tool = "hold" | "route" | "pan" | "eraser" | "text";
type RouteDraft = {
  description: string;
  author: string;
};
const blankDraft: RouteDraft = {
  description: "",
  author: "",
};
type WallSettingsDraft = {
  name: string;
  japaneseGrade: string;
  vGrade: string;
  gymName: string;
  tags: WallPostTags;
};
const emptyWallTags: WallPostTags = { hold: [], move: [], type: [] };
const editorColors = [
  { name: "黒", value: "#202522" },
  { name: "白", value: "#FFFEFA" },
  { name: "赤", value: "#E55050" },
  { name: "オレンジ", value: "#EF8C31" },
  { name: "黄", value: "#F2D13D" },
  { name: "緑", value: "#2F7A68" },
  { name: "青", value: "#2589C7" },
  { name: "紫", value: "#7654A6" },
] as const;

function ColorPalette({
  value,
  label,
  compact = false,
  onChange,
}: {
  value: string;
  label: string;
  compact?: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className={`color-palette${compact ? " color-palette--compact" : ""}`}>
      <legend className="sr-only">{label}</legend>
      {editorColors.map((color) => (
        <button
          key={color.value}
          className="color-swatch"
          type="button"
          title={color.name}
          aria-label={color.name}
          aria-pressed={value.toLowerCase() === color.value.toLowerCase()}
          style={{ backgroundColor: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
    </fieldset>
  );
}

function roleFor(route: ClimbingRoute, holdId: string): "start" | "normal" | "finish" {
  if (route.startHoldIds.includes(holdId)) return "start";
  if (route.finishHoldIds.includes(holdId)) return "finish";
  return "normal";
}

function routePngFileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]/g, "-").trim() || "route"}.png`;
}

function canSharePng(file: File) {
  if (typeof navigator.share !== "function") return false;
  try {
    return typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function downloadPng(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function isNamedError(reason: unknown, name: string) {
  return reason instanceof Error && reason.name === name;
}

export function WallEditorPage({ wallId }: { wallId: string }) {
  const holds = useWorkspaceStore((state) => state.holds);
  const routes = useWorkspaceStore((state) => state.routes);
  const selectedRouteId = useWorkspaceStore((state) => state.selectedRouteId);
  const past = useWorkspaceStore((state) => state.past);
  const future = useWorkspaceStore((state) => state.future);
  const loadWalls = useWorkspaceStore((state) => state.loadWalls);
  const loadWall = useWorkspaceStore((state) => state.loadWall);
  const renameWall = useWorkspaceStore((state) => state.renameWall);
  const addHold = useWorkspaceStore((state) => state.addHold);
  const moveHold = useWorkspaceStore((state) => state.moveHold);
  const updateHold = useWorkspaceStore((state) => state.updateHold);
  const removeHold = useWorkspaceStore((state) => state.removeHold);
  const clearHolds = useWorkspaceStore((state) => state.clearHolds);
  const updateWall = useWorkspaceStore((state) => state.updateWall);
  const updateRoute = useWorkspaceStore((state) => state.updateRoute);
  const appendHold = useWorkspaceStore((state) => state.appendHold);
  const removeRouteHold = useWorkspaceStore((state) => state.removeRouteHold);
  const moveRouteHold = useWorkspaceStore((state) => state.moveRouteHold);
  const setRouteRole = useWorkspaceStore((state) => state.setRouteRole);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const notify = useWorkspaceStore((state) => state.notify);
  const [wall, setWall] = useState<Wall | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [wallName, setWallName] = useState("");
  const [tool, setTool] = useState<Tool>("hold");
  const [selectedItemColor, setSelectedItemColor] = useState("#202522");
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(true);
  const [autoDetectHolds, setAutoDetectHolds] = useState(true);
  const [allowEllipses, setAllowEllipses] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<RouteDraft>(blankDraft);
  const [wallSettingsDraft, setWallSettingsDraft] = useState<WallSettingsDraft>({
    name: "",
    japaneseGrade: "",
    vGrade: "",
    gymName: "",
    tags: emptyWallTags,
  });
  const [wallSettingsOpen, setWallSettingsOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"holds" | "route" | null>(null);

  const route = routes.find((item) => item.id === selectedRouteId);
  const selectedHold = holds.find((hold) => hold.id === selectedHoldId);
  const selectedText = route?.textAnnotations?.find(({ id }) => id === selectedTextId);

  useEffect(() => {
    const color = selectedText?.color ?? selectedHold?.color;
    if (color) setSelectedItemColor(color);
  }, [selectedHold?.color, selectedText?.color]);

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.isContentEditable ||
        target?.closest(
          'textarea, select, input:not([type="range"]):not([type="color"]):not([type="checkbox"])',
        )
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const deleteFocusedControl = target?.closest("input, textarea, select");
      const selectedTextRoute = routes.find((item) => item.id === selectedRouteId);
      if (
        selectedTextId &&
        selectedTextRoute &&
        !deleteFocusedControl &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (key === "delete" || key === "backspace")
      ) {
        event.preventDefault();
        setSelectedTextId(null);
        void updateRoute(selectedTextRoute.id, {
          textAnnotations: (selectedTextRoute.textAnnotations ?? []).filter(
            ({ id }) => id !== selectedTextId,
          ),
        });
        return;
      }
      if (
        selectedHoldId &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !deleteFocusedControl &&
        (key === "delete" || key === "backspace")
      ) {
        event.preventDefault();
        const holdId = selectedHoldId;
        setSelectedHoldId(null);
        void removeHold(holdId).catch((reason: unknown) =>
          notify(reason instanceof Error ? reason.message : "ホールドを削除できませんでした。"),
        );
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const shouldUndo = key === "z" && !event.shiftKey;
      const shouldRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!shouldUndo && !shouldRedo) return;
      event.preventDefault();
      if (shouldRedo) {
        if (future.length > 0) void redo();
      } else if (past.length > 0) {
        void undo();
      }
    }

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [
    future.length,
    past.length,
    redo,
    removeHold,
    selectedHoldId,
    selectedRouteId,
    selectedTextId,
    routes,
    updateRoute,
    notify,
    undo,
  ]);

  useEffect(() => {
    let imageObjectUrl: string | null = null;
    let active = true;
    void Promise.all([getWall(wallId), loadWall(wallId), loadWalls()]).then(async ([record]) => {
      if (!active || !record) return;
      const legacyRoute = useWorkspaceStore.getState().routes[0];
      const legacyGrade = legacyRoute?.grade;
      setWall(record);
      setWallName(record.name);
      setWallSettingsDraft({
        name: record.name,
        japaneseGrade:
          record.japaneseGrade ??
          legacyRoute?.japaneseGrade ??
          (JAPANESE_CLIMBING_LEVELS.includes(
            legacyGrade as (typeof JAPANESE_CLIMBING_LEVELS)[number],
          )
            ? (legacyGrade ?? "")
            : ""),
        vGrade:
          record.vGrade ??
          legacyRoute?.vGrade ??
          (V_CLIMBING_LEVELS.includes(legacyGrade as (typeof V_CLIMBING_LEVELS)[number])
            ? (legacyGrade ?? "")
            : ""),
        gymName: record.gymName ?? legacyRoute?.gymName ?? "",
        tags: record.tags ?? emptyWallTags,
      });
      const image = await getImage(record.imageId);
      if (active && image) {
        imageObjectUrl = URL.createObjectURL(image.blob);
        setImageUrl(imageObjectUrl);
      }
    });
    return () => {
      active = false;
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    };
  }, [wallId, loadWall, loadWalls]);

  useEffect(() => {
    const selected = routes.find((item) => item.id === selectedRouteId);
    if (!selected) {
      setDraft(blankDraft);
      return;
    }
    setDraft({
      description: selected.description ?? "",
      author: selected.author ?? "",
    });
  }, [selectedRouteId, routes]);

  async function saveRouteDetails() {
    if (!route) return;
    const { description, author } = draft;
    await updateRoute(route.id, {
      description: description.trim() || undefined,
      author: author.trim() || undefined,
    });
    notify("ルートを保存しました");
  }

  async function saveWallSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updated = await updateWall(wallId, {
      name: wallSettingsDraft.name.trim() || "名前のない壁",
      japaneseGrade: wallSettingsDraft.japaneseGrade || undefined,
      vGrade: wallSettingsDraft.vGrade || undefined,
      gymName: wallSettingsDraft.gymName.trim() || undefined,
      tags: wallSettingsDraft.tags,
    });
    setWall(updated);
    setWallName(updated.name);
    setWallSettingsOpen(false);
    notify("壁の設定を保存しました");
  }

  async function saveWallName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = wallName.trim();
    if (!name) {
      notify("壁の名前を入力してください。");
      return;
    }
    await renameWall(wallId, name);
    setWall((current) => (current ? { ...current, name } : current));
    setWallName(name);
    setWallSettingsDraft((current) => ({ ...current, name }));
    setRenaming(false);
  }

  function addRouteText(position: Hold["position"], text: string) {
    if (!route || !text.trim()) return;
    const annotation: RouteText = {
      id: crypto.randomUUID(),
      text: text.trim(),
      position,
      color: selectedItemColor,
    };
    setSelectedHoldId(null);
    setSelectedTextId(annotation.id);
    void updateRoute(route.id, {
      textAnnotations: [...(route.textAnnotations ?? []), annotation],
    });
  }

  function removeRouteText(annotationId: string) {
    if (!route) return;
    if (selectedTextId === annotationId) setSelectedTextId(null);
    void updateRoute(route.id, {
      textAnnotations: (route.textAnnotations ?? []).filter(({ id }) => id !== annotationId),
    });
  }

  function editRouteText(annotationId: string, text: string) {
    if (!route) return;
    void updateRoute(route.id, {
      textAnnotations: (route.textAnnotations ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, text } : annotation,
      ),
    });
  }

  function moveRouteText(annotationId: string, position: Hold["position"]) {
    if (!route) return;
    void updateRoute(route.id, {
      textAnnotations: (route.textAnnotations ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, position } : annotation,
      ),
    });
  }

  function resizeRouteText(annotationId: string, fontScale: number) {
    if (!route) return;
    void updateRoute(route.id, {
      textAnnotations: (route.textAnnotations ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, fontScale } : annotation,
      ),
    });
  }

  function updateSelectedColor(color: string) {
    setSelectedItemColor(color);
    if (selectedHold) {
      void updateHold(selectedHold.id, { color });
      return;
    }
    if (!route || !selectedText) return;
    void updateRoute(route.id, {
      textAnnotations: (route.textAnnotations ?? []).map((annotation) =>
        annotation.id === selectedText.id ? { ...annotation, color } : annotation,
      ),
    });
  }

  async function createRouteFile(routeToExport: ClimbingRoute) {
    if (!wall) throw new Error("壁が見つかりません。");
    const image = await getImage(wall.imageId);
    if (!image) throw new Error("壁画像が見つかりません。");
    const png = await exportRoutePng(image.blob, wall.width, wall.height, holds, routeToExport);
    return new File([png], routePngFileName(wall.name), { type: "image/png" });
  }

  async function exportPng(routeToExport: ClimbingRoute) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const file = await createRouteFile(routeToExport);
      downloadPng(file);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "PNGを作成できませんでした。");
    } finally {
      setActionBusy(false);
    }
  }

  async function shareRoute(routeToShare: ClimbingRoute) {
    if (actionBusy) return;
    setActionBusy(true);
    let file: File | null = null;
    try {
      file = await createRouteFile(routeToShare);
      if (!canSharePng(file)) {
        downloadPng(file);
        notify("この端末は共有メニューに対応していないため、PNGをダウンロードしました。");
        return;
      }
      await navigator.share({
        files: [file],
        title: wall?.name ?? "壁",
        text: `${wall?.name ?? "壁"}${wallGrade ? ` (${wallGrade})` : ""}`,
      });
    } catch (reason) {
      if (isNamedError(reason, "AbortError")) return;
      if (file && isNamedError(reason, "NotAllowedError")) {
        downloadPng(file);
        notify("共有メニューを開けなかったため、PNGをダウンロードしました。");
        return;
      }
      notify(reason instanceof Error ? reason.message : "共有できませんでした。");
    } finally {
      setActionBusy(false);
    }
  }

  async function shareRouteToDiscord(routeToShare: ClimbingRoute) {
    if (!wall || actionBusy) return;
    setActionBusy(true);
    try {
      const image = await getImage(wall.imageId);
      const webhook = await getDiscordSettings();
      if (!image || !webhook?.webhookUrl)
        throw new Error("SettingsでDiscord Webhookを設定してください。");
      const png = await exportRoutePng(image.blob, wall.width, wall.height, holds, routeToShare);
      const message = await shareRoutePng(
        webhook.webhookUrl,
        {
          name: wall.name,
          grade: wallGrade,
          holdCount: routeToShare.holdIds.length,
          author: routeToShare.author,
          gymName: wall.gymName,
        },
        png,
      );
      notify(message);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Discordへの共有に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  }

  const wallGrade = [wall?.japaneseGrade, wall?.vGrade].filter(Boolean).join(" · ");

  async function shareWallLink() {
    if (!wall) return;
    const url = new URL(`/walls/${encodeURIComponent(wallId)}`, window.location.origin).toString();
    const shareText = `${wallName || wall.name}（壁データは同じ端末に保存されています）`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: wallName || wall.name, text: shareText, url });
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error("リンクをコピーできませんでした。");
      await navigator.clipboard.writeText(url);
      notify("壁のリンクをコピーしました。同じ端末の壁データが必要です。");
    } catch (reason) {
      if (isNamedError(reason, "AbortError")) return;
      notify(reason instanceof Error ? reason.message : "リンクを共有できませんでした。");
    }
  }

  if (!wall || !imageUrl)
    return (
      <main className="page-shell editor-loading">
        {wall ? "壁画像を読み込んでいます..." : "壁を読み込んでいます..."}
      </main>
    );

  return (
    <main className="editor-page">
      <header className="editor-header">
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          <span>Walls</span>
        </Link>
        <span className="header-divider" />
        {renaming ? (
          <form className="wall-rename-form" onSubmit={(event) => void saveWallName(event)}>
            <input value={wallName} onChange={(event) => setWallName(event.currentTarget.value)} />
            <button className="icon-button" type="submit" title="名前を保存">
              <Check size={16} />
            </button>
          </form>
        ) : (
          <button
            className="wall-title-button"
            type="button"
            title="壁名を変更"
            onClick={() => setRenaming(true)}
          >
            <strong>{wall.name}</strong>
            <Pencil size={13} />
          </button>
        )}
        <button
          className="icon-button"
          type="button"
          title="壁の設定"
          aria-label="壁の設定"
          onClick={() => setWallSettingsOpen(true)}
        >
          <Settings2 size={16} />
        </button>
        <button
          className="icon-button wall-link-share"
          type="button"
          title="壁のリンクを共有"
          aria-label="壁のリンクを共有"
          onClick={() => void shareWallLink()}
        >
          <Upload size={15} /> <span>リンク共有</span>
        </button>
        {route && (
          <div className="editor-route-actions">
            <button
              className="icon-button route-card__tool"
              type="button"
              title={`${wall.name}のPNGを保存`}
              aria-label={`${wall.name}のPNGを保存`}
              disabled={actionBusy}
              onClick={() => void exportPng(route)}
            >
              <Download size={14} />
            </button>
            <button
              className="icon-button route-card__tool route-card__tool--share"
              type="button"
              title={`${wall.name}を共有`}
              aria-label={`${wall.name}を共有`}
              disabled={actionBusy}
              onClick={() => void shareRoute(route)}
            >
              <Share2 size={14} />
            </button>
            <button
              className="icon-button route-card__tool"
              type="button"
              title={`${wall.name}をDiscordに共有`}
              aria-label={`${wall.name}をDiscordに共有`}
              disabled={actionBusy}
              onClick={() => void shareRouteToDiscord(route)}
            >
              <MessageCircle size={14} />
            </button>
          </div>
        )}
        <span className="header-spacer" />
        <button
          className="button button--outline button--small editor-history-button"
          type="button"
          title="元に戻す"
          aria-label="元に戻す"
          aria-keyshortcuts="Control+Z Meta+Z"
          disabled={past.length === 0}
          onClick={() => void undo()}
        >
          <Undo2 size={15} /> <span>戻す</span>
        </button>
        <button
          className="button button--outline button--small editor-history-button"
          type="button"
          title="やり直す"
          aria-label="やり直す"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y"
          disabled={future.length === 0}
          onClick={() => void redo()}
        >
          <Redo2 size={15} /> <span>進む</span>
        </button>
        <button
          className="button button--primary editor-save"
          type="button"
          disabled={!route}
          onClick={() => void saveRouteDetails()}
        >
          <Save size={15} /> 保存
        </button>
      </header>

      <div className="editor-layout">
        <section className="canvas-column">
          <div className="editor-toolbar">
            <fieldset className="tool-segment">
              <legend className="sr-only">キャンバスツール</legend>
              <button
                className={tool === "pan" ? "is-active" : ""}
                type="button"
                title="画像を移動"
                aria-label="画像を移動"
                onClick={() => setTool("pan")}
              >
                <Hand size={17} />
              </button>
              <button
                className={tool === "hold" ? "is-active" : ""}
                type="button"
                title="ホールド追加・移動"
                aria-label="ホールド追加・移動"
                onClick={() => setTool("hold")}
              >
                <MapPin size={17} />
              </button>
              <button
                className={tool === "route" ? "is-active" : ""}
                type="button"
                title="ルートに追加"
                aria-label="ルートに追加"
                onClick={() => setTool("route")}
              >
                <RouteIcon size={17} />
              </button>
              <button
                className={tool === "text" ? "is-active" : ""}
                type="button"
                title="文字を入力して配置"
                aria-label="文字を入力して配置"
                aria-pressed={tool === "text"}
                disabled={!route}
                onClick={() => setTool("text")}
              >
                <Type size={17} />
              </button>
              <button
                className={tool === "eraser" ? "is-active" : ""}
                type="button"
                title="ホールドを消去"
                aria-label="ホールドを消去"
                onClick={() => setTool("eraser")}
              >
                <Eraser size={17} />
              </button>
            </fieldset>
            <div className="editor-settings-wrap">
              <button
                className={`tool-settings-button ${settingsOpen ? "is-active" : ""}`}
                type="button"
                title="ホールド設定"
                aria-label="ホールド設定"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings2 size={17} />
              </button>
              {settingsOpen && (
                <div className="editor-settings-popover" role="dialog" aria-label="ホールド設定">
                  <button
                    className={`auto-detect-control ${autoDetectHolds ? "is-on" : ""}`}
                    type="button"
                    role="switch"
                    aria-label="ホールド輪郭の自動検出"
                    aria-checked={autoDetectHolds}
                    onClick={() => setAutoDetectHolds((enabled) => !enabled)}
                  >
                    <span className="auto-detect-control__label">輪郭検出</span>
                    <span className="auto-detect-control__track" aria-hidden="true">
                      <span />
                    </span>
                    <span className="auto-detect-control__status">
                      {autoDetectHolds ? "ON" : "OFF"}
                    </span>
                  </button>
                  <button
                    className={`auto-detect-control ${allowEllipses ? "is-on" : ""}`}
                    type="button"
                    role="switch"
                    aria-label="楕円を許可"
                    aria-checked={allowEllipses}
                    onClick={() => setAllowEllipses((enabled) => !enabled)}
                  >
                    <span className="auto-detect-control__label">楕円を許可</span>
                    <span className="auto-detect-control__track" aria-hidden="true">
                      <span />
                    </span>
                    <span className="auto-detect-control__status">
                      {allowEllipses ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
              )}
            </div>
            <span className="toolbar-separator" />
            <label className="line-toggle">
              <input
                type="checkbox"
                checked={showLines}
                onChange={(event) => setShowLines(event.currentTarget.checked)}
              />
              <span>
                {showLines ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>線</span>
              </span>
            </label>
            <div
              className="selected-object-color"
              title="選択中の色、または次に配置するホールド・文字の色"
            >
              <ColorPalette
                value={selectedItemColor}
                label="選択中の色、または次に配置するホールド・文字の色"
                onChange={updateSelectedColor}
              />
            </div>
            <button
              className="icon-button danger-text editor-reset"
              type="button"
              title="全リセット"
              aria-label="全リセット"
              disabled={
                holds.length === 0 &&
                !routes.some((item) => (item.textAnnotations?.length ?? 0) > 0)
              }
              onClick={() => {
                if (
                  !window.confirm(
                    "この壁のホールドと配置した文字をすべて削除し、ルートのホールド設定を空にします。ルート自体は残ります。よろしいですか？",
                  )
                )
                  return;
                void clearHolds()
                  .then(() => {
                    setSelectedHoldId(null);
                    setSelectedTextId(null);
                  })
                  .catch((reason: unknown) =>
                    notify(
                      reason instanceof Error
                        ? reason.message
                        : "ホールドをリセットできませんでした。",
                    ),
                  );
              }}
            >
              <RotateCcw size={16} />
            </button>
            <span className="toolbar-spacer" />
          </div>
          <div className="canvas-frame">
            <WallCanvas
              wall={wall}
              imageUrl={imageUrl}
              holds={holds}
              route={route}
              selectedHoldId={selectedHoldId}
              selectedTextId={selectedTextId}
              tool={tool}
              textColor={selectedItemColor}
              showLines={showLines}
              autoDetectHolds={autoDetectHolds}
              allowEllipses={allowEllipses}
              onAddHold={(position, markerRadius, bounds, shape) =>
                void addHold(position, markerRadius, selectedItemColor, bounds, shape)
                  .then((hold) => {
                    setSelectedTextId(null);
                    setSelectedHoldId(hold.id);
                  })
                  .catch((reason: unknown) =>
                    notify(
                      reason instanceof Error ? reason.message : "ホールドを追加できませんでした。",
                    ),
                  )
              }
              onMoveHold={(id, position) => void moveHold(id, position)}
              onResizeHold={(id, patch) => void updateHold(id, patch)}
              onRemoveHold={(id) => {
                void removeHold(id)
                  .then(() => {
                    if (selectedHoldId === id) setSelectedHoldId(null);
                  })
                  .catch((reason: unknown) =>
                    notify(
                      reason instanceof Error ? reason.message : "ホールドを削除できませんでした。",
                    ),
                  );
              }}
              onSelectHold={(id) => {
                setSelectedTextId(null);
                setSelectedHoldId(id);
              }}
              onAppendHold={(id) => void appendHold(id)}
              onAddText={addRouteText}
              onEditText={editRouteText}
              onMoveText={moveRouteText}
              onResizeText={resizeRouteText}
              onSelectText={setSelectedTextId}
              onRemoveText={removeRouteText}
            />
            <div className="canvas-caption">
              <span>
                {wall.width} × {wall.height}px
              </span>
              <span>{holds.length} HOLDS</span>
            </div>
          </div>
        </section>

        <aside
          id="editor-sidebar-panel"
          className={`editor-sidebar${mobilePanel ? " is-open" : ""}`}
        >
          <div className="mobile-editor-panel-heading">
            <strong>{mobilePanel === "route" ? "ルート" : "ホールド"}</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="パネルを閉じる"
              onClick={() => setMobilePanel(null)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="sidebar-content" data-mobile-panel={mobilePanel ?? ""}>
            {!route && <p className="sidebar-empty">ルートを読み込んでいます。</p>}
            {route && (
              <div className="route-sequence editor-mobile-route-panel">
                <div className="panel-section-heading">
                  <span>ORDER</span>
                  <span>{route.holdIds.length} MOVES</span>
                </div>
                {route.holdIds.length === 0 ? (
                  <p className="sidebar-empty">キャンバスからホールドを選択</p>
                ) : (
                  route.holdIds.map((id, index) => {
                    const hold = holds.find((item) => item.id === id);
                    if (!hold) return null;
                    return (
                      <RouteHoldRow
                        key={id}
                        hold={hold}
                        route={route}
                        index={index}
                        count={route.holdIds.length}
                        onRole={(role) => void setRouteRole(id, role)}
                        onMove={(delta) => void moveRouteHold(id, delta)}
                        onRemove={() => void removeRouteHold(id)}
                      />
                    );
                  })
                )}
              </div>
            )}
            <div className="route-list-heading editor-mobile-holds-panel">
              <span>登録済みホールド</span>
              <span className="tool-hint">{tool === "hold" ? "編集" : "選択"}</span>
            </div>
            {holds.length === 0 ? (
              <p className="sidebar-empty editor-mobile-holds-panel">ホールドはまだありません。</p>
            ) : (
              <div className="hold-list editor-mobile-holds-panel">
                {holds.map((hold, index) => (
                  <button
                    key={hold.id}
                    type="button"
                    className={`hold-list-item ${selectedHoldId === hold.id ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelectedTextId(null);
                      setSelectedHoldId(hold.id);
                    }}
                  >
                    <span
                      className="hold-list-marker"
                      style={{ background: hold.color ?? "#f2d13d" }}
                    />
                    <span>Hold {String(index + 1).padStart(2, "0")}</span>
                    <span className="hold-list-coordinate">
                      {Math.round(hold.position.x * 100)}%, {Math.round(hold.position.y * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedHold && (
              <div className="hold-properties editor-mobile-holds-panel">
                <div className="panel-section-heading">
                  <span>HOLD ATTRIBUTES</span>
                  <button
                    className="icon-button danger-text"
                    type="button"
                    aria-label="ホールドを削除"
                    title="ホールドを削除"
                    onClick={() => {
                      if (window.confirm("このホールドを削除しますか？")) {
                        void removeHold(selectedHold.id);
                        setSelectedHoldId(null);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <label className="field-label">
                  種類
                  <input
                    className="text-input text-input--compact"
                    value={selectedHold.type ?? ""}
                    onChange={(event) =>
                      void updateHold(selectedHold.id, {
                        type: event.currentTarget.value || undefined,
                      })
                    }
                    placeholder="例: crimp"
                    maxLength={40}
                  />
                </label>
                <label className="field-label">
                  円の半径（画像px）
                  <span className="hold-range-value hold-range-value--steps">
                    <button
                      className="hold-size-step"
                      type="button"
                      title="円を小さく"
                      aria-label="円を小さく"
                      disabled={(selectedHold.markerRadius ?? 48) <= 4}
                      onClick={() =>
                        void updateHold(selectedHold.id, {
                          markerRadius: Math.max(4, (selectedHold.markerRadius ?? 48) - 4),
                        })
                      }
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      className="hold-range"
                      type="range"
                      min="4"
                      max="300"
                      step="1"
                      value={selectedHold.markerRadius ?? 48}
                      onChange={(event) =>
                        void updateHold(selectedHold.id, {
                          markerRadius: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <output>{Math.round(selectedHold.markerRadius ?? 48)} px</output>
                    <button
                      className="hold-size-step"
                      type="button"
                      title="円を大きく"
                      aria-label="円を大きく"
                      disabled={(selectedHold.markerRadius ?? 48) >= 300}
                      onClick={() =>
                        void updateHold(selectedHold.id, {
                          markerRadius: Math.min(300, (selectedHold.markerRadius ?? 48) + 4),
                        })
                      }
                    >
                      <Plus size={13} />
                    </button>
                  </span>
                </label>
                <label className="field-label">
                  横方向（楕円）
                  <span className="hold-range-value">
                    <input
                      className="hold-range"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={allowEllipses ? (selectedHold.markerScaleX ?? 1) : 1}
                      disabled={!allowEllipses}
                      onChange={(event) =>
                        void updateHold(selectedHold.id, {
                          markerScaleX: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <output>
                      {(allowEllipses ? (selectedHold.markerScaleX ?? 1) : 1).toFixed(2)}×
                    </output>
                  </span>
                </label>
                <label className="field-label">
                  縦方向（楕円）
                  <span className="hold-range-value">
                    <input
                      className="hold-range"
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={allowEllipses ? (selectedHold.markerScaleY ?? 1) : 1}
                      disabled={!allowEllipses}
                      onChange={(event) =>
                        void updateHold(selectedHold.id, {
                          markerScaleY: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <output>
                      {(allowEllipses ? (selectedHold.markerScaleY ?? 1) : 1).toFixed(2)}×
                    </output>
                  </span>
                </label>
                <label className="field-label">
                  線幅（画面px）
                  <span className="hold-range-value">
                    <input
                      className="hold-range"
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={selectedHold.markerWidth ?? 2}
                      onChange={(event) =>
                        void updateHold(selectedHold.id, {
                          markerWidth: Number(event.currentTarget.value),
                        })
                      }
                    />
                    <output>{selectedHold.markerWidth ?? 2} px</output>
                  </span>
                </label>
                <div className="field-label">
                  <span>色</span>
                  <div className="color-input-row">
                    <ColorPalette
                      value={selectedHold.color ?? "#f2d13d"}
                      label="ホールドの色"
                      compact
                      onChange={(color) => void updateHold(selectedHold.id, { color })}
                    />
                    <span>{selectedHold.color ?? "#f2d13d"}</span>
                  </div>
                </div>
              </div>
            )}
            {route && (
              <div className="route-details-form editor-mobile-route-panel">
                <label className="field-label">
                  作成者
                  <input
                    className="text-input text-input--compact"
                    value={draft.author}
                    onChange={(event) => {
                      const author = event.currentTarget.value;
                      setDraft((current) => ({ ...current, author }));
                    }}
                    maxLength={80}
                  />
                </label>
                <label className="field-label">
                  説明
                  <textarea
                    className="text-input text-input--compact textarea-input"
                    value={draft.description}
                    onChange={(event) => {
                      const description = event.currentTarget.value;
                      setDraft((current) => ({ ...current, description }));
                    }}
                    rows={2}
                    maxLength={500}
                  />
                </label>
              </div>
            )}
          </div>
        </aside>
      </div>

      {mobilePanel && (
        <button
          className="mobile-editor-backdrop"
          type="button"
          aria-label="パネルを閉じる"
          onClick={() => setMobilePanel(null)}
        />
      )}
      <nav className="mobile-editor-nav" aria-label="エディタパネル">
        <button
          className={mobilePanel === "holds" ? "is-active" : ""}
          type="button"
          aria-expanded={mobilePanel === "holds"}
          aria-controls="editor-sidebar-panel"
          onClick={() => {
            setTool("hold");
            setMobilePanel((current) => (current === "holds" ? null : "holds"));
          }}
        >
          <MapPin size={18} />
          <span>ホールド</span>
        </button>
        <button
          className={mobilePanel === "route" ? "is-active" : ""}
          type="button"
          aria-expanded={mobilePanel === "route"}
          aria-controls="editor-sidebar-panel"
          onClick={() => {
            setTool("route");
            setMobilePanel((current) => (current === "route" ? null : "route"));
          }}
        >
          <RouteIcon size={18} />
          <span>ルート</span>
        </button>
      </nav>

      {wallSettingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-panel"
            aria-label="壁の設定"
            onSubmit={(event) => void saveWallSettings(event)}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">WALL SETTINGS</p>
                <h2>壁の設定</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={() => setWallSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field-label">
              壁の名前
              <input
                className="text-input"
                value={wallSettingsDraft.name}
                onChange={(event) =>
                  setWallSettingsDraft((current) => ({
                    ...current,
                    name: event.currentTarget.value,
                  }))
                }
                maxLength={80}
                required
              />
            </label>
            <div className="route-grade-fields">
              <label className="field-label">
                日本式グレード
                <select
                  className="text-input text-input--compact"
                  value={wallSettingsDraft.japaneseGrade}
                  onChange={(event) =>
                    setWallSettingsDraft((current) => ({
                      ...current,
                      japaneseGrade: event.currentTarget.value,
                    }))
                  }
                >
                  <option value="">未設定</option>
                  {JAPANESE_CLIMBING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Vグレード
                <select
                  className="text-input text-input--compact"
                  value={wallSettingsDraft.vGrade}
                  onChange={(event) =>
                    setWallSettingsDraft((current) => ({
                      ...current,
                      vGrade: event.currentTarget.value,
                    }))
                  }
                >
                  <option value="">未設定</option>
                  {V_CLIMBING_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              ジム名
              <input
                className="text-input"
                value={wallSettingsDraft.gymName}
                onChange={(event) =>
                  setWallSettingsDraft((current) => ({
                    ...current,
                    gymName: event.currentTarget.value,
                  }))
                }
                maxLength={80}
              />
            </label>
            <div className="field-label wall-tag-field">
              <span>タイプ・タグ</span>
              <div className="wall-tag-groups">
                {WALL_POST_TAG_CATEGORIES.map((category) => (
                  <fieldset className="wall-tag-group" key={category}>
                    <legend>{WALL_POST_TAG_LABELS[category]}</legend>
                    <div className="wall-tag-options">
                      {WALL_POST_TAGS[category].map((tag) => {
                        const selected: readonly string[] = wallSettingsDraft.tags[category];
                        return (
                          <label className="wall-tag-option" key={tag}>
                            <input
                              type="checkbox"
                              checked={selected.includes(tag)}
                              onChange={(event) => {
                                const next = event.currentTarget.checked
                                  ? [...selected, tag]
                                  : selected.filter((item) => item !== tag);
                                setWallSettingsDraft((current) => ({
                                  ...current,
                                  tags: { ...current.tags, [category]: next } as WallPostTags,
                                }));
                              }}
                            />
                            <span>{tag}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
            <div className="field-label">
              <span>ホールド</span>
              <div className="selected-file">
                <span>{holds.length} 個</span>
                <button
                  className="button button--outline button--small"
                  type="button"
                  onClick={() => {
                    setTool("hold");
                    setWallSettingsOpen(false);
                  }}
                >
                  <MapPin size={14} /> 編集
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setWallSettingsOpen(false)}
              >
                キャンセル
              </button>
              <button className="button button--primary" type="submit">
                <Save size={15} /> 設定を保存
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function RouteHoldRow({
  hold,
  route,
  index,
  count,
  onRole,
  onMove,
  onRemove,
}: {
  hold: Hold;
  route: ClimbingRoute;
  index: number;
  count: number;
  onRole: (role: "start" | "normal" | "finish") => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="sequence-row">
      <span className={`sequence-number ${roleFor(route, hold.id)}`}>{index + 1}</span>
      <span className="sequence-name">Hold {index + 1}</span>
      <select
        className="role-select"
        aria-label={`Hold ${index + 1}の役割`}
        value={roleFor(route, hold.id)}
        onChange={(event) => onRole(event.currentTarget.value as "start" | "normal" | "finish")}
      >
        <option value="start">Start</option>
        <option value="normal">Normal</option>
        <option value="finish">Finish</option>
      </select>
      <button
        className="icon-button sequence-move"
        type="button"
        title="上へ"
        aria-label="順序を上げる"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={13} />
      </button>
      <button
        className="icon-button sequence-move"
        type="button"
        title="下へ"
        aria-label="順序を下げる"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={13} />
      </button>
      <button
        className="icon-button sequence-remove"
        type="button"
        title="ルートから外す"
        aria-label="ルートから外す"
        onClick={onRemove}
      >
        <X size={14} />
      </button>
    </div>
  );
}
