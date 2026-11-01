import type { Wall } from "@pinto/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ImagePlus, Mountain, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { getImage, listRoutes } from "../../infrastructure/storage/database";
import { useWorkspaceStore } from "../workspace/store";

function WallTile({ wall, onDelete }: { wall: Wall; onDelete: (wall: Wall) => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [routeCount, setRouteCount] = useState(0);

  useEffect(() => {
    let url: string | null = null;
    void Promise.all([getImage(wall.imageId), listRoutes(wall.id)]).then(([image, routes]) => {
      if (image) {
        url = URL.createObjectURL(image.blob);
        setImageUrl(url);
      }
      setRouteCount(routes.length);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [wall.id, wall.imageId]);

  return (
    <article className="wall-tile">
      <Link to="/walls/$wallId" params={{ wallId: wall.id }} className="wall-tile__image group">
        {imageUrl ? (
          <img src={imageUrl} alt={`${wall.name}の壁`} />
        ) : (
          <div className="wall-tile__placeholder">
            <Mountain size={34} />
          </div>
        )}
        <span className="wall-tile__open">
          <ArrowUpRight size={17} />
        </span>
      </Link>
      <div className="wall-tile__meta">
        <Link to="/walls/$wallId" params={{ wallId: wall.id }} className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{wall.name}</h2>
          <p className="mt-1 text-xs text-muted">
            {routeCount} routes <span className="px-1">·</span> {wall.width} × {wall.height}px
          </p>
        </Link>
        <button
          className="icon-button text-muted hover:text-red-600"
          type="button"
          title="壁を削除"
          aria-label={`${wall.name}を削除`}
          onClick={() => onDelete(wall)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const walls = useWorkspaceStore((state) => state.walls);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const error = useWorkspaceStore((state) => state.error);
  const loadWalls = useWorkspaceStore((state) => state.loadWalls);
  const createWall = useWorkspaceStore((state) => state.createWall);
  const removeWall = useWorkspaceStore((state) => state.removeWall);
  const notify = useWorkspaceStore((state) => state.notify);
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [inclination, setInclination] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadWalls();
  }, [loadWalls]);

  async function submitWall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      const wall = await createWall(
        file,
        name,
        inclination === "" ? undefined : Number(inclination),
      );
      setDialogOpen(false);
      setFile(null);
      setName("");
      await navigate({ to: "/walls/$wallId", params: { wallId: wall.id } });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "壁を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(wall: Wall) {
    if (!window.confirm(`「${wall.name}」と関連データを削除しますか？`)) return;
    await removeWall(wall.id);
  }

  return (
    <main className="page-shell dashboard-page">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR LOCAL WALL LIBRARY</p>
          <h1 className="display-title">
            Walls <span>&</span> routes
          </h1>
          <p className="intro-copy">壁の写真から、次の一本をつくろう。</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={18} /> 壁を追加
        </button>
      </section>

      <section className="library-section" aria-label="登録した壁">
        <div className="section-label">
          <span>WALLS</span>
          <span>{String(walls.length).padStart(2, "0")}</span>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {isLoading ? (
          <p className="empty-copy">読み込み中...</p>
        ) : walls.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__mark">
              <ImagePlus size={28} />
            </div>
            <div>
              <h2>最初の壁を登録</h2>
              <p>ジムの壁を撮影した画像から、ローカルでルートを作成できます。</p>
            </div>
            <button
              className="button button--outline"
              type="button"
              onClick={() => setDialogOpen(true)}
            >
              <Plus size={17} /> 画像を選ぶ
            </button>
          </div>
        ) : (
          <div className="wall-grid">
            {walls.map((wall) => (
              <WallTile key={wall.id} wall={wall} onDelete={confirmDelete} />
            ))}
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel" onSubmit={submitWall}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW WALL</p>
                <h2>壁を追加</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={() => setDialogOpen(false)}
              >
                ×
              </button>
            </div>
            <label className="field-label">
              壁の写真
              <input
                className="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
              <span className="field-hint">JPEG / PNG / WebP</span>
            </label>
            {file && (
              <div className="selected-file">
                <ImagePlus size={16} />
                <span>{file.name}</span>
                <span>{Math.round(file.size / 1024)} KB</span>
              </div>
            )}
            <label className="field-label">
              壁の名前
              <input
                className="text-input"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="例: Main wall"
                maxLength={80}
                required
              />
            </label>
            <label className="field-label">
              傾斜角度 <span className="field-hint inline">任意</span>
              <div className="input-with-unit">
                <input
                  className="text-input"
                  type="number"
                  min="-90"
                  max="90"
                  value={inclination}
                  onChange={(event) => setInclination(event.currentTarget.value)}
                  placeholder="0"
                />
                <span>°</span>
              </div>
            </label>
            <div className="modal-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setDialogOpen(false)}
              >
                キャンセル
              </button>
              <button className="button button--primary" type="submit" disabled={!file || saving}>
                {saving ? "保存中..." : "壁を作成"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
