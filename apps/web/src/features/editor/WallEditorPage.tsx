import type { Route as ClimbingRoute, Hold, Wall } from "@pinto/shared";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Hand,
  MapPin,
  Pencil,
  Plus,
  Redo2,
  Route as RouteIcon,
  Save,
  Trash2,
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

type Tool = "hold" | "route" | "pan";
type Panel = "holds" | "routes";
type RouteDraft = {
  name: string;
  grade: string;
  description: string;
  author: string;
  gymName: string;
};
const blankDraft: RouteDraft = { name: "", grade: "", description: "", author: "", gymName: "" };

function roleFor(route: ClimbingRoute, holdId: string): "start" | "normal" | "finish" {
  if (route.startHoldIds.includes(holdId)) return "start";
  if (route.finishHoldIds.includes(holdId)) return "finish";
  return "normal";
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
  const createRoute = useWorkspaceStore((state) => state.createRoute);
  const updateRoute = useWorkspaceStore((state) => state.updateRoute);
  const duplicateRoute = useWorkspaceStore((state) => state.duplicateRoute);
  const removeRoute = useWorkspaceStore((state) => state.removeRoute);
  const selectRoute = useWorkspaceStore((state) => state.selectRoute);
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
  const [panel, setPanel] = useState<Panel>("routes");
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeGrade, setRouteGrade] = useState("");
  const [draft, setDraft] = useState<RouteDraft>(blankDraft);
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const route = routes.find((item) => item.id === selectedRouteId);
  const selectedHold = holds.find((hold) => hold.id === selectedHoldId);

  useEffect(() => {
    let imageObjectUrl: string | null = null;
    let active = true;
    void Promise.all([getWall(wallId), loadWall(wallId), loadWalls()]).then(async ([record]) => {
      if (!active || !record) return;
      setWall(record);
      setWallName(record.name);
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
      name: selected.name,
      grade: selected.grade ?? "",
      description: selected.description ?? "",
      author: selected.author ?? "",
      gymName: selected.gymName ?? "",
    });
  }, [selectedRouteId, routes]);

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await createRoute({
        name: routeName,
        ...(routeGrade.trim() ? { grade: routeGrade.trim() } : {}),
      });
      setTool("hold");
      setRouteName("");
      setRouteGrade("");
      setCreateOpen(false);
      setPanel("routes");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "ルートを作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function saveRouteDetails() {
    if (!route) return;
    const { name, grade, description, author, gymName } = draft;
    await updateRoute(route.id, {
      name: name.trim() || "新しいルート",
      grade: grade.trim() || undefined,
      description: description.trim() || undefined,
      author: author.trim() || undefined,
      gymName: gymName.trim() || undefined,
    });
    notify("ルートを保存しました");
  }

  async function saveWallName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await renameWall(wallId, wallName);
    setRenaming(false);
  }

  async function exportPng() {
    if (!wall || !route) return;
    try {
      const image = await getImage(wall.imageId);
      if (!image) throw new Error("壁画像が見つかりません。");
      const png = await exportRoutePng(image.blob, wall.width, wall.height, holds, route);
      const url = URL.createObjectURL(png);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${route.name.replace(/[\\/:*?"<>|]/g, "-")}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "PNGを作成できませんでした。");
    }
  }

  async function shareRoute() {
    if (!wall || !route) return;
    setShareBusy(true);
    try {
      const image = await getImage(wall.imageId);
      const webhook = await getDiscordSettings();
      if (!image || !webhook?.webhookUrl)
        throw new Error("SettingsでDiscord Webhookを設定してください。");
      const png = await exportRoutePng(image.blob, wall.width, wall.height, holds, route);
      const message = await shareRoutePng(
        webhook.webhookUrl,
        {
          name: route.name,
          grade: route.grade,
          holdCount: route.holdIds.length,
          author: route.author,
          gymName: route.gymName,
        },
        png,
      );
      notify(message);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Discordへの共有に失敗しました。");
    } finally {
      setShareBusy(false);
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
        <span className="header-spacer" />
        <button
          className="icon-button"
          type="button"
          title="元に戻す"
          aria-label="元に戻す"
          disabled={past.length === 0}
          onClick={() => void undo()}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="やり直す"
          aria-label="やり直す"
          disabled={future.length === 0}
          onClick={() => void redo()}
        >
          <Redo2 size={17} />
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
            </fieldset>
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
            <span className="toolbar-spacer" />
            <button
              className="button button--outline button--small"
              type="button"
              disabled={!route}
              onClick={() => void exportPng()}
            >
              <Download size={15} /> PNG
            </button>
            <button
              className="button button--share button--small"
              type="button"
              disabled={!route || shareBusy}
              onClick={() => void shareRoute()}
            >
              <Upload size={15} /> {shareBusy ? "送信中" : "共有"}
            </button>
          </div>
          <div className="canvas-frame">
            <WallCanvas
              wall={wall}
              imageUrl={imageUrl}
              holds={holds}
              route={route}
              selectedHoldId={selectedHoldId}
              tool={tool}
              showLines={showLines}
              onAddHold={(position) =>
                void addHold(position)
                  .then((hold) => setSelectedHoldId(hold.id))
                  .catch((reason: unknown) =>
                    notify(
                      reason instanceof Error ? reason.message : "ホールドを追加できませんでした。",
                    ),
                  )
              }
              onMoveHold={(id, position) => void moveHold(id, position)}
              onSelectHold={setSelectedHoldId}
              onAppendHold={(id) => void appendHold(id)}
            />
            <div className="canvas-caption">
              <span>
                {wall.width} × {wall.height}px
              </span>
              <span>{holds.length} HOLDS</span>
            </div>
          </div>
        </section>

        <aside className="editor-sidebar">
          <div className="sidebar-tabs">
            <button
              className={panel === "routes" ? "is-active" : ""}
              type="button"
              onClick={() => setPanel("routes")}
            >
              Routes <span>{routes.length}</span>
            </button>
            <button
              className={panel === "holds" ? "is-active" : ""}
              type="button"
              onClick={() => setPanel("holds")}
            >
              Holds <span>{holds.length}</span>
            </button>
          </div>
          {panel === "routes" ? (
            <div className="sidebar-content">
              <div className="route-list-heading">
                <span>この壁のルート</span>
                <button
                  className="icon-button icon-button--accent"
                  type="button"
                  title="ルートを作成"
                  aria-label="ルートを作成"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={17} />
                </button>
              </div>
              {routes.length === 0 ? (
                <p className="sidebar-empty">ルートはまだありません。</p>
              ) : (
                <div className="route-list">
                  {routes.map((item, index) => (
                    <div
                      key={item.id}
                      className={`route-card ${item.id === selectedRouteId ? "is-selected" : ""}`}
                    >
                      <button
                        className="route-card__select"
                        type="button"
                        onClick={() => selectRoute(item.id)}
                      >
                        <span
                          className="route-swatch"
                          style={{
                            backgroundColor: ["#e96d4d", "#2f7a68", "#5677a8", "#8e5d92"][
                              index % 4
                            ],
                          }}
                        />
                        <span className="route-card__name">
                          {item.name}
                          <small>
                            {item.grade || "Grade not set"} · {item.holdIds.length} holds
                          </small>
                        </span>
                      </button>
                      {item.id === selectedRouteId && (
                        <div className="route-card__actions">
                          <button
                            className="icon-button"
                            type="button"
                            title="複製"
                            aria-label="ルートを複製"
                            onClick={() => void duplicateRoute(item.id)}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            title="削除"
                            aria-label="ルートを削除"
                            onClick={() => {
                              if (window.confirm(`「${item.name}」を削除しますか？`))
                                void removeRoute(item.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {route && (
                <>
                  <form
                    className="route-details-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveRouteDetails();
                    }}
                  >
                    <div className="panel-section-heading">
                      <span>DETAILS</span>
                      <span className="route-source">MANUAL</span>
                    </div>
                    <label className="field-label">
                      ルート名
                      <input
                        className="text-input text-input--compact"
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, name: event.currentTarget.value }))
                        }
                        maxLength={80}
                        required
                      />
                    </label>
                    <label className="field-label">
                      グレード
                      <input
                        className="text-input text-input--compact"
                        value={draft.grade}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, grade: event.currentTarget.value }))
                        }
                        placeholder="例: V4"
                        maxLength={20}
                      />
                    </label>
                    <div className="field-grid">
                      <label className="field-label">
                        作成者
                        <input
                          className="text-input text-input--compact"
                          value={draft.author}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              author: event.currentTarget.value,
                            }))
                          }
                          maxLength={80}
                        />
                      </label>
                      <label className="field-label">
                        ジム名
                        <input
                          className="text-input text-input--compact"
                          value={draft.gymName}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              gymName: event.currentTarget.value,
                            }))
                          }
                          maxLength={80}
                        />
                      </label>
                    </div>
                    <label className="field-label">
                      説明
                      <textarea
                        className="text-input text-input--compact textarea-input"
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            description: event.currentTarget.value,
                          }))
                        }
                        rows={2}
                        maxLength={500}
                      />
                    </label>
                    <button
                      className="button button--outline button--full button--small"
                      type="submit"
                    >
                      <Save size={14} /> 変更を保存
                    </button>
                  </form>
                  <div className="route-sequence">
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
                </>
              )}
            </div>
          ) : (
            <div className="sidebar-content">
              <div className="route-list-heading">
                <span>登録済みホールド</span>
                <span className="tool-hint">{tool === "hold" ? "編集" : "選択"}</span>
              </div>
              {holds.length === 0 ? (
                <p className="sidebar-empty">ホールドはまだありません。</p>
              ) : (
                <div className="hold-list">
                  {holds.map((hold, index) => (
                    <button
                      key={hold.id}
                      type="button"
                      className={`hold-list-item ${selectedHoldId === hold.id ? "is-selected" : ""}`}
                      onClick={() => setSelectedHoldId(hold.id)}
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
                <div className="hold-properties">
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
                    色
                    <div className="color-input-row">
                      <input
                        type="color"
                        value={selectedHold.color ?? "#f2d13d"}
                        onChange={(event) =>
                          void updateHold(selectedHold.id, { color: event.currentTarget.value })
                        }
                      />
                      <span>{selectedHold.color ?? "#f2d13d"}</span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-panel modal-panel--compact"
            onSubmit={(event) => void submitRoute(event)}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW ROUTE</p>
                <h2>ルートを作成</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={() => setCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field-label">
              ルート名
              <input
                className="text-input"
                value={routeName}
                onChange={(event) => setRouteName(event.currentTarget.value)}
                placeholder="例: Green corner"
                maxLength={80}
                required
              />
            </label>
            <label className="field-label">
              グレード
              <input
                className="text-input"
                value={routeGrade}
                onChange={(event) => setRouteGrade(event.currentTarget.value)}
                placeholder="例: V4"
                maxLength={20}
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                キャンセル
              </button>
              <button className="button button--primary" type="submit" disabled={busy}>
                {busy ? "作成中..." : "ルートを作成"}
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
