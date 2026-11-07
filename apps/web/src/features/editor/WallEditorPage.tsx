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
  type WallEditorStyleDefaults,
  type WallPostTags,
} from "@pinto/shared";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  MapPin,
  MessageCircle,
  Redo2,
  RotateCcw,
  Route as RouteIcon,
  Save,
  Settings2,
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
type WallSettingsDraft = {
  name: string;
  japaneseGrade: string;
  vGrade: string;
  gymName: string;
  tags: WallPostTags;
  author: string;
  description: string;
  autoDetectHolds: boolean;
  allowEllipses: boolean;
};
const emptyWallTags: WallPostTags = { hold: [], move: [], type: [] };
const defaultEditorStyleDefaults: Required<WallEditorStyleDefaults> = {
  markerWidth: 3,
  holdOutlineWidth: 0,
  holdOutlineColor: "#FFFEFA",
  textFontWeight: 600,
  textFontFamily: "sans-serif",
  textOutlineWidth: 0,
  textOutlineColor: "#FFFEFA",
};
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
  onChange,
}: {
  value: string;
  label: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="color-palette">
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

function routePngFileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]/g, "-").trim() || "route"}.png`;
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
  const addHold = useWorkspaceStore((state) => state.addHold);
  const moveHold = useWorkspaceStore((state) => state.moveHold);
  const updateHold = useWorkspaceStore((state) => state.updateHold);
  const removeHold = useWorkspaceStore((state) => state.removeHold);
  const clearHolds = useWorkspaceStore((state) => state.clearHolds);
  const updateWall = useWorkspaceStore((state) => state.updateWall);
  const updateRoute = useWorkspaceStore((state) => state.updateRoute);
  const appendHold = useWorkspaceStore((state) => state.appendHold);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const notify = useWorkspaceStore((state) => state.notify);
  const [wall, setWall] = useState<Wall | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("hold");
  const [selectedItemColor, setSelectedItemColor] = useState("#202522");
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(true);
  const [wallSettingsDraft, setWallSettingsDraft] = useState<WallSettingsDraft>({
    name: "",
    japaneseGrade: "",
    vGrade: "",
    gymName: "",
    tags: emptyWallTags,
    author: "",
    description: "",
    autoDetectHolds: true,
    allowEllipses: true,
  });
  const [wallSettingsOpen, setWallSettingsOpen] = useState(false);
  const [wallSettingsSaving, setWallSettingsSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const route = routes.find((item) => item.id === selectedRouteId);
  const autoDetectHolds = wall?.autoDetectHolds ?? true;
  const allowEllipses = wall?.allowEllipses ?? true;
  const selectedHold = holds.find((hold) => hold.id === selectedHoldId);
  const selectedText = route?.textAnnotations?.find(({ id }) => id === selectedTextId);
  const editingLine = tool === "route";
  const activeText = tool === "text" ? selectedText : undefined;
  const activeHold = tool === "hold" ? selectedHold : undefined;
  const editorStyleDefaults = {
    ...defaultEditorStyleDefaults,
    ...wall?.editorStyleDefaults,
  };
  const canEditStyle = editingLine ? Boolean(route) : tool === "text" || tool === "hold";
  const styleWidth = editingLine
    ? (route?.lineWidth ?? 4)
    : tool === "text"
      ? (activeText?.fontWeight ?? editorStyleDefaults.textFontWeight)
      : (activeHold?.markerWidth ?? editorStyleDefaults.markerWidth);
  const outlineWidth = editingLine
    ? (route?.lineOutlineWidth ?? 2)
    : (activeText?.outlineWidth ??
      activeHold?.outlineWidth ??
      (tool === "text"
        ? editorStyleDefaults.textOutlineWidth
        : editorStyleDefaults.holdOutlineWidth));
  const outlineColor = editingLine
    ? (route?.lineOutlineColor ?? "#202522")
    : (activeText?.outlineColor ??
      activeHold?.outlineColor ??
      (tool === "text"
        ? editorStyleDefaults.textOutlineColor
        : editorStyleDefaults.holdOutlineColor));

  useEffect(() => {
    const color = activeText?.color ?? activeHold?.color;
    if (color) setSelectedItemColor(color);
  }, [activeHold?.color, activeText?.color]);

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
        author: legacyRoute?.author ?? "",
        description: legacyRoute?.description ?? "",
        autoDetectHolds: record.autoDetectHolds ?? true,
        allowEllipses: record.allowEllipses ?? true,
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
    if (!previewImageUrl) return;
    return () => URL.revokeObjectURL(previewImageUrl);
  }, [previewImageUrl]);

  async function saveRouteDetails() {
    if (!route) return;
    const { description, author } = route;
    await updateRoute(route.id, {
      description: description?.trim() || undefined,
      author: author?.trim() || undefined,
    });
    notify("ルートを保存しました");
  }

  async function saveWallSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wallSettingsSaving) return;
    setWallSettingsSaving(true);
    try {
      if (route) {
        await updateRoute(route.id, {
          author: wallSettingsDraft.author.trim() || undefined,
          description: wallSettingsDraft.description.trim() || undefined,
        });
      }
      const updated = await updateWall(wallId, {
        name: wallSettingsDraft.name.trim() || "名前のない壁",
        japaneseGrade: wallSettingsDraft.japaneseGrade || undefined,
        vGrade: wallSettingsDraft.vGrade || undefined,
        gymName: wallSettingsDraft.gymName.trim() || undefined,
        tags: wallSettingsDraft.tags,
        autoDetectHolds: wallSettingsDraft.autoDetectHolds,
        allowEllipses: wallSettingsDraft.allowEllipses,
      });
      setWall(updated);
      setWallSettingsOpen(false);
      notify("壁の設定を保存しました");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "壁の設定を保存できませんでした。");
    } finally {
      setWallSettingsSaving(false);
    }
  }

  function addRouteText(position: Hold["position"], text: string) {
    if (!route || !text.trim()) return;
    const annotation: RouteText = {
      id: crypto.randomUUID(),
      text: text.trim(),
      position,
      color: selectedItemColor,
      fontWeight: editorStyleDefaults.textFontWeight,
      fontFamily: editorStyleDefaults.textFontFamily,
      outlineWidth: editorStyleDefaults.textOutlineWidth,
      outlineColor: editorStyleDefaults.textOutlineColor,
    };
    setTool("text");
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
    if (!editingLine) setSelectedItemColor(color);
    updateSelectedStyle({ color }, { color }, { lineColor: color });
  }

  function reportStyleError(reason: unknown) {
    notify(reason instanceof Error ? reason.message : "見た目の設定を保存できませんでした。");
  }

  function updateSelectedStyle(
    holdPatch: Partial<Hold>,
    textPatch: Partial<RouteText>,
    linePatch: Partial<ClimbingRoute>,
  ) {
    if (editingLine && route) {
      void updateRoute(route.id, linePatch).catch(reportStyleError);
    } else if (activeText && route) {
      void updateRoute(route.id, {
        textAnnotations: (route.textAnnotations ?? []).map((annotation) =>
          annotation.id === activeText.id ? { ...annotation, ...textPatch } : annotation,
        ),
      }).catch(reportStyleError);
      updateEditorStyleDefaults({
        ...(textPatch.fontWeight === undefined ? {} : { textFontWeight: textPatch.fontWeight }),
        ...(textPatch.fontFamily === undefined ? {} : { textFontFamily: textPatch.fontFamily }),
        ...(textPatch.outlineWidth === undefined
          ? {}
          : { textOutlineWidth: textPatch.outlineWidth }),
        ...(textPatch.outlineColor === undefined
          ? {}
          : { textOutlineColor: textPatch.outlineColor }),
      });
    } else if (activeHold) {
      void updateHold(activeHold.id, holdPatch).catch(reportStyleError);
      updateEditorStyleDefaults({
        ...(holdPatch.markerWidth === undefined ? {} : { markerWidth: holdPatch.markerWidth }),
        ...(holdPatch.outlineWidth === undefined
          ? {}
          : { holdOutlineWidth: holdPatch.outlineWidth }),
        ...(holdPatch.outlineColor === undefined
          ? {}
          : { holdOutlineColor: holdPatch.outlineColor }),
      });
    } else if (tool === "text") {
      updateEditorStyleDefaults({
        ...(textPatch.fontWeight === undefined ? {} : { textFontWeight: textPatch.fontWeight }),
        ...(textPatch.fontFamily === undefined ? {} : { textFontFamily: textPatch.fontFamily }),
        ...(textPatch.outlineWidth === undefined
          ? {}
          : { textOutlineWidth: textPatch.outlineWidth }),
        ...(textPatch.outlineColor === undefined
          ? {}
          : { textOutlineColor: textPatch.outlineColor }),
      });
    } else if (tool === "hold") {
      updateEditorStyleDefaults({
        ...(holdPatch.markerWidth === undefined ? {} : { markerWidth: holdPatch.markerWidth }),
        ...(holdPatch.outlineWidth === undefined
          ? {}
          : { holdOutlineWidth: holdPatch.outlineWidth }),
        ...(holdPatch.outlineColor === undefined
          ? {}
          : { holdOutlineColor: holdPatch.outlineColor }),
      });
    }
  }

  function updateEditorStyleDefaults(patch: Partial<WallEditorStyleDefaults>) {
    if (!wall) return;
    const editorStyleDefaults = {
      ...defaultEditorStyleDefaults,
      ...wall.editorStyleDefaults,
      ...patch,
    };
    setWall((current) => (current ? { ...current, editorStyleDefaults } : current));
    void updateWall(wall.id, { editorStyleDefaults }).catch(reportStyleError);
  }

  function resetStyleWidth() {
    if (editingLine) updateSelectedStyle({}, {}, { lineWidth: 4 });
    else if (tool === "text") updateSelectedStyle({}, { fontWeight: 600 }, {});
    else if (tool === "hold") updateSelectedStyle({ markerWidth: 3 }, {}, {});
  }

  function resetOutlineWidth() {
    if (editingLine) updateSelectedStyle({}, {}, { lineOutlineWidth: 2 });
    else if (tool === "text") updateSelectedStyle({}, { outlineWidth: 0 }, {});
    else if (tool === "hold") updateSelectedStyle({ outlineWidth: 0 }, {}, {});
  }

  function resetOutlineColor() {
    if (editingLine) updateSelectedStyle({}, {}, { lineOutlineColor: "#202522" });
    else if (tool === "text") updateSelectedStyle({}, { outlineColor: "#FFFEFA" }, {});
    else if (tool === "hold") updateSelectedStyle({ outlineColor: "#FFFEFA" }, {}, {});
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

  async function previewRoute(routeToPreview: ClimbingRoute) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const file = await createRouteFile(routeToPreview);
      setPreviewImageUrl(URL.createObjectURL(file));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "投稿プレビューを作成できませんでした。");
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
    const shareText = `${wall.name}（壁データは同じ端末に保存されています）`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: wall.name, text: shareText, url });
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
        <Link className="back-link" to="/" aria-label="壁一覧に戻る">
          <ArrowLeft size={17} />
        </Link>
        <div className="wall-title">
          <strong>{wall.name}</strong>
        </div>
        <button
          className="icon-button"
          type="button"
          title="壁の設定"
          aria-label="壁の設定"
          onClick={() => {
            setWallSettingsDraft((current) => ({
              ...current,
              author: route?.author ?? "",
              description: route?.description ?? "",
              autoDetectHolds: wall?.autoDetectHolds ?? true,
              allowEllipses: wall?.allowEllipses ?? true,
            }));
            setWallSettingsOpen(true);
          }}
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
          className="button button--outline button--small editor-preview"
          type="button"
          aria-label="投稿をプレビュー"
          title="投稿をプレビュー"
          disabled={!route || actionBusy}
          onClick={() => {
            if (route) void previewRoute(route);
          }}
        >
          <Eye size={15} /> <span>プレビュー</span>
        </button>
        <button
          className="button button--primary editor-save"
          type="button"
          disabled={!route}
          onClick={() => void saveRouteDetails()}
        >
          <Save size={15} /> 投稿
        </button>
      </header>

      {previewImageUrl && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-panel editor-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-preview-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">ROUTE PREVIEW</p>
                <h2 id="editor-preview-title">投稿プレビュー</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="プレビューを閉じる"
                onClick={() => setPreviewImageUrl(null)}
              >
                <X size={18} />
              </button>
            </div>
            <img
              className="editor-preview-modal__image"
              src={previewImageUrl}
              alt={`${wall.name} ${route?.name ?? ""}の投稿プレビュー`}
            />
          </section>
        </div>
      )}

      <div className="editor-layout">
        <section className="canvas-column">
          <div className="editor-controls-row">
            <nav className="editor-tool-nav" aria-label="キャンバスツール">
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
            </nav>
            <div className="editor-toolbar">
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
              <div className="selected-object-style">
                <div
                  className="selected-object-color"
                  title="選択中の色、または次に配置するホールド・文字の色"
                >
                  <ColorPalette
                    value={editingLine ? (route?.lineColor ?? "#f2d13d") : selectedItemColor}
                    label="選択中の色、または次に配置するホールド・文字の色"
                    onChange={updateSelectedColor}
                  />
                </div>
                <div className="selected-object-style__controls">
                  <label htmlFor="selected-object-width">
                    太さ
                    {tool === "text" ? (
                      <select
                        id="selected-object-width"
                        className="text-input text-input--compact"
                        aria-label="文字の太さ"
                        value={styleWidth}
                        disabled={!canEditStyle}
                        onDoubleClick={() => updateSelectedStyle({}, { fontWeight: 600 }, {})}
                        onChange={(event) =>
                          updateSelectedStyle(
                            {},
                            { fontWeight: Number(event.currentTarget.value) },
                            {},
                          )
                        }
                      >
                        <option value={300}>細字</option>
                        <option value={400}>標準</option>
                        <option value={600}>やや太字</option>
                        <option value={700}>太字</option>
                        <option value={900}>極太</option>
                      </select>
                    ) : (
                      <>
                        <input
                          id="selected-object-width"
                          type="range"
                          aria-label={editingLine ? "線の太さ" : "丸の太さ"}
                          min={1}
                          max={20}
                          step={1}
                          value={styleWidth}
                          disabled={!canEditStyle}
                          onDoubleClick={resetStyleWidth}
                          onChange={(event) => {
                            const width = Number(event.currentTarget.value);
                            updateSelectedStyle({ markerWidth: width }, {}, { lineWidth: width });
                          }}
                        />
                        <output>{styleWidth}px</output>
                      </>
                    )}
                  </label>
                  <label>
                    枠線
                    <input
                      type="range"
                      aria-label="枠線の太さ"
                      min={0}
                      max={10}
                      step={1}
                      value={outlineWidth}
                      disabled={!canEditStyle}
                      onDoubleClick={resetOutlineWidth}
                      onChange={(event) => {
                        const width = Number(event.currentTarget.value);
                        updateSelectedStyle(
                          { outlineWidth: width },
                          { outlineWidth: width },
                          { lineOutlineWidth: width },
                        );
                      }}
                    />
                    <output>{outlineWidth}px</output>
                  </label>
                  <label>
                    枠線の色
                    <input
                      type="color"
                      aria-label="枠線の色"
                      value={outlineColor}
                      disabled={!canEditStyle}
                      onDoubleClick={resetOutlineColor}
                      onChange={(event) => {
                        const color = event.currentTarget.value;
                        updateSelectedStyle(
                          { outlineColor: color },
                          { outlineColor: color },
                          { lineOutlineColor: color },
                        );
                      }}
                    />
                  </label>
                  <label
                    className={tool === "text" ? undefined : "font-control-reserved"}
                    aria-hidden={tool !== "text"}
                  >
                    フォント
                    <select
                      className="text-input text-input--compact"
                      aria-label="文字のフォント"
                      value={activeText?.fontFamily ?? editorStyleDefaults.textFontFamily}
                      disabled={tool !== "text" || !canEditStyle}
                      onDoubleClick={() =>
                        updateSelectedStyle({}, { fontFamily: "sans-serif" }, {})
                      }
                      onChange={(event) => {
                        const family = event.currentTarget.value;
                        if (
                          family === "sans-serif" ||
                          family === "serif" ||
                          family === "monospace"
                        ) {
                          updateSelectedStyle({}, { fontFamily: family }, {});
                        }
                      }}
                    >
                      <option value="sans-serif">ゴシック体</option>
                      <option value="serif">明朝体</option>
                      <option value="monospace">等幅</option>
                    </select>
                  </label>
                </div>
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
              textFontWeight={editorStyleDefaults.textFontWeight}
              textFontFamily={editorStyleDefaults.textFontFamily}
              textOutlineWidth={editorStyleDefaults.textOutlineWidth}
              textOutlineColor={editorStyleDefaults.textOutlineColor}
              showLines={showLines}
              autoDetectHolds={autoDetectHolds}
              allowEllipses={allowEllipses}
              onAddHold={(position, markerRadius, bounds, shape) =>
                void addHold(position, markerRadius, selectedItemColor, bounds, shape, {
                  markerWidth: editorStyleDefaults.markerWidth,
                  outlineWidth: editorStyleDefaults.holdOutlineWidth,
                  outlineColor: editorStyleDefaults.holdOutlineColor,
                })
                  .then((hold) => {
                    setTool("hold");
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
                if (id) setTool("hold");
                setSelectedTextId(null);
                setSelectedHoldId(id);
              }}
              onAppendHold={(id) => void appendHold(id)}
              onAddText={addRouteText}
              onEditText={editRouteText}
              onMoveText={moveRouteText}
              onResizeText={resizeRouteText}
              onSelectText={(id) => {
                if (id) {
                  setTool("text");
                  setSelectedHoldId(null);
                }
                setSelectedTextId(id);
              }}
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
      </div>

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
                disabled={wallSettingsSaving}
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
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setWallSettingsDraft((current) => ({
                    ...current,
                    name,
                  }));
                }}
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
                  onChange={(event) => {
                    const japaneseGrade = event.currentTarget.value;
                    setWallSettingsDraft((current) => ({
                      ...current,
                      japaneseGrade,
                    }));
                  }}
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
                  onChange={(event) => {
                    const vGrade = event.currentTarget.value;
                    setWallSettingsDraft((current) => ({
                      ...current,
                      vGrade,
                    }));
                  }}
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
                onChange={(event) => {
                  const gymName = event.currentTarget.value;
                  setWallSettingsDraft((current) => ({
                    ...current,
                    gymName,
                  }));
                }}
                maxLength={80}
              />
            </label>
            <label className="field-label">
              作成者
              <input
                className="text-input"
                value={wallSettingsDraft.author}
                disabled={!route || wallSettingsSaving}
                onChange={(event) => {
                  const author = event.currentTarget.value;
                  setWallSettingsDraft((current) => ({
                    ...current,
                    author,
                  }));
                }}
                maxLength={80}
              />
            </label>
            <label className="field-label">
              説明
              <textarea
                className="text-input textarea-input"
                value={wallSettingsDraft.description}
                disabled={!route || wallSettingsSaving}
                onChange={(event) => {
                  const description = event.currentTarget.value;
                  setWallSettingsDraft((current) => ({
                    ...current,
                    description,
                  }));
                }}
                rows={3}
                maxLength={500}
              />
            </label>
            <fieldset className="wall-editor-options">
              <legend className="field-label">キャンバス設定</legend>
              <button
                className={`auto-detect-control ${wallSettingsDraft.autoDetectHolds ? "is-on" : ""}`}
                type="button"
                role="switch"
                aria-label="ホールド輪郭の自動検出"
                aria-checked={wallSettingsDraft.autoDetectHolds}
                disabled={wallSettingsSaving}
                onClick={() =>
                  setWallSettingsDraft((current) => ({
                    ...current,
                    autoDetectHolds: !current.autoDetectHolds,
                  }))
                }
              >
                <span className="auto-detect-control__label">ホールド輪郭の自動検出</span>
                <span className="auto-detect-control__track" aria-hidden="true">
                  <span />
                </span>
                <span className="auto-detect-control__status">
                  {wallSettingsDraft.autoDetectHolds ? "ON" : "OFF"}
                </span>
              </button>
              <button
                className={`auto-detect-control ${wallSettingsDraft.allowEllipses ? "is-on" : ""}`}
                type="button"
                role="switch"
                aria-label="楕円を許可"
                aria-checked={wallSettingsDraft.allowEllipses}
                disabled={wallSettingsSaving}
                onClick={() =>
                  setWallSettingsDraft((current) => ({
                    ...current,
                    allowEllipses: !current.allowEllipses,
                  }))
                }
              >
                <span className="auto-detect-control__label">楕円を許可</span>
                <span className="auto-detect-control__track" aria-hidden="true">
                  <span />
                </span>
                <span className="auto-detect-control__status">
                  {wallSettingsDraft.allowEllipses ? "ON" : "OFF"}
                </span>
              </button>
            </fieldset>
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
                  disabled={wallSettingsSaving}
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
                disabled={wallSettingsSaving}
                onClick={() => setWallSettingsOpen(false)}
              >
                キャンセル
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={wallSettingsSaving}
              >
                <Save size={15} /> 設定を保存
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
