import {
  JAPANESE_CLIMBING_LEVELS,
  V_CLIMBING_LEVELS,
  WALL_POST_TAG_CATEGORIES,
  WALL_POST_TAG_LABELS,
  type WallPostTags,
} from "@pinto/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bookmark,
  Heart,
  ImagePlus,
  LayoutGrid,
  List,
  LogIn,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { GYM_PINS } from "../../domain/gym-pins";
import { authClient } from "../../infrastructure/api/auth";
import {
  deleteWallPost,
  getMyCommunityProfile,
  getWallPostFeed,
  publishWallPost,
  setWallPostLike,
  setWallPostSaved,
  type WallPost,
  type WallPostFeed,
} from "../../infrastructure/api/community";
import { encodeWallPostPreview } from "../../infrastructure/export/wall-post-preview";
import { getImage } from "../../infrastructure/storage/database";
import { useWorkspaceStore } from "../workspace/store";
import { useWallPng } from "./use-wall-png";
import { WallPostDetailPage } from "./WallPostDetailPage";
import { WallTagPicker } from "./WallTagPicker";

const emptyFeed: WallPostFeed = { posts: [], gyms: [], grades: [] };
const emptyWallPostTags: WallPostTags = { hold: [], move: [], type: [] };

function WallFeedImage({
  post,
  viewerId,
  wallName,
}: {
  post: WallPost;
  viewerId: string;
  wallName: string;
}) {
  const { url, error } = useWallPng(post.userId === viewerId ? post.wallId : undefined);
  return (
    <>
      <img className="route-post__image" src={url ?? post.image} alt={`${wallName}の壁画像`} />
      {error && (
        <p className="community-status" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function WallFeed({ authorHandle }: { authorHandle?: string } = {}) {
  const { data: session } = authClient.useSession();
  const viewerId = session?.user.id ?? "";
  const walls = useWorkspaceStore((state) => state.walls);
  const loadWalls = useWorkspaceStore((state) => state.loadWalls);
  const [scope, setScope] = useState<"all" | "following" | "own" | "saved">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [gym, setGym] = useState("");
  const [grade, setGrade] = useState("");
  const [tagFilters, setTagFilters] = useState<WallPostTags>(emptyWallPostTags);
  const [favoriteGym, setFavoriteGym] = useState("");
  const [feed, setFeed] = useState(emptyFeed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const tagFilterCount = WALL_POST_TAG_CATEGORIES.reduce(
    (count, category) => count + tagFilters[category].length,
    0,
  );
  const activeFilterCount = Number(Boolean(gym)) + Number(Boolean(grade)) + tagFilterCount;

  useEffect(() => {
    void loadWalls();
  }, [loadWalls]);

  useEffect(() => {
    if (!viewerId && scope !== "all") setScope("all");
  }, [scope, viewerId]);

  useEffect(() => {
    if (!viewerId) {
      setFavoriteGym("");
      return;
    }
    let active = true;
    void getMyCommunityProfile()
      .then((profile) => {
        if (active) setFavoriteGym(profile.homeGym);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [viewerId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getWallPostFeed(
      { scope: authorHandle ? "all" : scope, authorHandle, gym, grade, tags: tagFilters },
      Boolean(viewerId),
    )
      .then((result) => {
        if (active) setFeed(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "投稿を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, gym, grade, tagFilters, viewerId, authorHandle]);

  async function removePost(id: string) {
    try {
      await deleteWallPost(id);
      setFeed((current) => ({
        ...current,
        posts: current.posts.filter((post) => post.id !== id),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "投稿を削除できませんでした。");
    }
  }

  async function toggleLike(postId: string, likedByMe: boolean) {
    setPendingAction(`${postId}:like`);
    setError("");
    try {
      const result = await setWallPostLike(postId, !likedByMe);
      setFeed((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: result.active, likeCount: result.likeCount }
            : post,
        ),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "いいねを更新できませんでした。");
    } finally {
      setPendingAction("");
    }
  }

  async function toggleSaved(postId: string, savedByMe: boolean) {
    setPendingAction(`${postId}:save`);
    setError("");
    try {
      const result = await setWallPostSaved(postId, !savedByMe);
      setFeed((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === postId ? { ...post, savedByMe: result.active } : post,
        ),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存状態を更新できませんでした。");
    } finally {
      setPendingAction("");
    }
  }

  return (
    <section
      className="route-feed"
      aria-label={authorHandle ? "ユーザーの投稿一覧" : "コミュニティの壁投稿"}
    >
      <div className="route-feed__heading">
        <div>
          <p className="eyebrow">{authorHandle ? "CLIMBER POSTS" : "COMMUNITY WALLS"}</p>
          <h2>{authorHandle ? "投稿一覧" : "投稿された壁"}</h2>
        </div>
        <div className="route-feed__controls">
          {!authorHandle && (
            <div className="route-feed__filters">
              <fieldset className="route-feed__scope" aria-label="投稿範囲">
                <button
                  type="button"
                  className={scope === "all" ? "is-active" : ""}
                  aria-pressed={scope === "all"}
                  onClick={() => setScope("all")}
                >
                  全体
                </button>
                <button
                  type="button"
                  className={scope === "following" ? "is-active" : ""}
                  aria-pressed={scope === "following"}
                  disabled={!session?.user}
                  onClick={() => setScope("following")}
                >
                  フォロー中
                </button>
                <button
                  type="button"
                  className={scope === "own" ? "is-active" : ""}
                  aria-pressed={scope === "own"}
                  disabled={!session?.user}
                  onClick={() => setScope("own")}
                >
                  自分の投稿
                </button>
                <button
                  type="button"
                  className={scope === "saved" ? "is-active" : ""}
                  aria-pressed={scope === "saved"}
                  disabled={!session?.user}
                  onClick={() => setScope("saved")}
                >
                  保存済み
                </button>
                <button
                  className={`route-feed__search${filtersOpen ? " is-active" : ""}`}
                  type="button"
                  title="投稿を絞り込む"
                  aria-label="投稿を絞り込む"
                  aria-expanded={filtersOpen}
                  aria-controls="route-feed-filter-panel"
                  onClick={() => setFiltersOpen((current) => !current)}
                >
                  <Search size={16} aria-hidden="true" />
                  {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
                </button>
                {filtersOpen && (
                  <div className="route-feed__filter-panel" id="route-feed-filter-panel">
                    <label className="sr-only" htmlFor="route-feed-gym">
                      ジムで絞り込む
                    </label>
                    <select
                      id="route-feed-gym"
                      className="text-input route-feed__select"
                      value={gym}
                      onChange={(event) => setGym(event.currentTarget.value)}
                    >
                      <option value="">すべてのジム</option>
                      {favoriteGym && (
                        <option value={favoriteGym}>よく行くジム · {favoriteGym}</option>
                      )}
                      {feed.gyms.map(
                        (name) =>
                          name !== favoriteGym && (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ),
                      )}
                    </select>
                    <label className="sr-only" htmlFor="route-feed-grade">
                      グレードで絞り込む
                    </label>
                    <select
                      id="route-feed-grade"
                      className="text-input route-feed__select"
                      value={grade}
                      onChange={(event) => setGrade(event.currentTarget.value)}
                    >
                      <option value="">すべてのグレード</option>
                      {feed.grades.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <details className="route-feed__tag-filter">
                      <summary>タグ{tagFilterCount > 0 && <span>{tagFilterCount}</span>}</summary>
                      <div className="route-feed__tag-panel">
                        <WallTagPicker tags={tagFilters} onChange={setTagFilters} />
                      </div>
                    </details>
                    {activeFilterCount > 0 && (
                      <button
                        className="route-feed__tag-reset"
                        type="button"
                        onClick={() => {
                          setGym("");
                          setGrade("");
                          setTagFilters(emptyWallPostTags);
                        }}
                      >
                        <RotateCcw size={14} /> 条件をクリア
                      </button>
                    )}
                  </div>
                )}
              </fieldset>
            </div>
          )}
          <fieldset className="route-feed__scope route-feed__view-toggle" aria-label="表示形式">
            <button
              type="button"
              className={viewMode === "grid" ? "is-active" : ""}
              aria-label="グリッド表示"
              title="グリッド表示"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "is-active" : ""}
              aria-label="リスト表示"
              title="リスト表示"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
            >
              <List size={16} aria-hidden="true" />
            </button>
          </fieldset>
        </div>
      </div>
      {error && (
        <p className="community-status" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty-copy">投稿を読み込んでいます...</p>
      ) : feed.posts.length ? (
        <div className={`route-feed__grid${viewMode === "list" ? " is-list" : ""}`}>
          {feed.posts.map((post) => {
            const isOwnPost = post.userId === viewerId;
            const wallName = isOwnPost
              ? (walls.find((wall) => wall.id === post.wallId)?.name ?? post.wallName)
              : post.wallName;
            const wallImage = <WallFeedImage post={post} viewerId={viewerId} wallName={wallName} />;
            const postDetailsHref = `/?post=${encodeURIComponent(post.id)}`;
            return (
              <article className="route-post" key={post.id}>
                <a
                  className="route-post__wall-image-link"
                  href={postDetailsHref}
                  aria-label={`${wallName}の投稿詳細を開く`}
                >
                  {wallImage}
                </a>
                <div className="route-post__body">
                  <div className="route-post__author">
                    {post.avatar ? (
                      <img src={post.avatar} alt="" />
                    ) : (
                      <span>
                        <UserRound size={15} aria-hidden="true" />
                      </span>
                    )}
                    <Link
                      className="route-post__author-link"
                      to="/community/$handle"
                      params={{ handle: post.handle }}
                    >
                      {post.username}
                    </Link>
                    <small>@{post.handle}</small>
                    {post.userId === session?.user?.id && (
                      <button
                        className="icon-button route-post__delete"
                        type="button"
                        title="自分の投稿を削除"
                        aria-label={`${wallName}の投稿を削除`}
                        onClick={() => {
                          if (window.confirm(`「${wallName}」の壁投稿を削除しますか？`))
                            void removePost(post.id);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <h3>
                    <a className="route-post__wall-title-link" href={postDetailsHref}>
                      {wallName}
                    </a>
                  </h3>
                  <p className="route-post__meta">
                    <MapPin size={13} /> {post.gymName}
                    {[post.japaneseGrade, post.vGrade].some(Boolean) && (
                      <span>{[post.japaneseGrade, post.vGrade].filter(Boolean).join(" · ")}</span>
                    )}
                    <span>{post.routes.length} ルート</span>
                  </p>
                  {WALL_POST_TAG_CATEGORIES.some((category) => post.tags[category].length > 0) && (
                    <div className="route-post__tags">
                      {WALL_POST_TAG_CATEGORIES.flatMap((category) =>
                        post.tags[category].map((tag) => (
                          <span key={`${category}-${tag}`}>
                            {WALL_POST_TAG_LABELS[category]}: {tag}
                          </span>
                        )),
                      )}
                    </div>
                  )}
                  {post.routes.length > 0 ? (
                    <ul className="route-post__routes">
                      {post.routes.map((route) => (
                        <li key={route.id}>
                          <span>{route.name}</span>
                          {(route.japaneseGrade || route.vGrade || route.grade) && (
                            <strong>
                              {route.japaneseGrade || route.vGrade
                                ? [route.japaneseGrade, route.vGrade].filter(Boolean).join(" · ")
                                : route.grade}
                            </strong>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="route-post__wall">ルート未登録</p>
                  )}
                  <div className="route-post__actions">
                    <button
                      className={`route-post__action ${post.likedByMe ? "is-active" : ""}`}
                      type="button"
                      aria-label={`${wallName}にいいね`}
                      aria-pressed={post.likedByMe}
                      title={session?.user ? "いいね" : "いいねするにはログインが必要です"}
                      disabled={!session?.user || pendingAction === `${post.id}:like`}
                      onClick={() => void toggleLike(post.id, post.likedByMe)}
                    >
                      <Heart size={16} fill={post.likedByMe ? "currentColor" : "none"} />
                      <span>{post.likeCount}</span>
                    </button>
                    <button
                      className={`route-post__action ${post.savedByMe ? "is-active" : ""}`}
                      type="button"
                      aria-label={`${wallName}を保存`}
                      aria-pressed={post.savedByMe}
                      title={session?.user ? "保存" : "保存するにはログインが必要です"}
                      disabled={!session?.user || pendingAction === `${post.id}:save`}
                      onClick={() => void toggleSaved(post.id, post.savedByMe)}
                    >
                      <Bookmark size={16} fill={post.savedByMe ? "currentColor" : "none"} />
                      <span>{post.savedByMe ? "保存済み" : "保存"}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="route-feed__empty">
          {authorHandle
            ? "投稿はまだありません。"
            : scope === "following"
              ? "フォロー中のユーザーが投稿した壁はまだありません。"
              : scope === "saved"
                ? "保存した壁投稿はまだありません。"
                : scope === "own"
                  ? "自分の壁投稿はまだありません。"
                  : "壁の投稿はまだありません。"}
        </p>
      )}
    </section>
  );
}

export function DashboardPage() {
  const postId =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("post");
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const sessionUserId = session?.user.id;
  const createWall = useWorkspaceStore((state) => state.createWall);
  const notify = useWorkspaceStore((state) => state.notify);
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [gymName, setGymName] = useState("");
  const [japaneseGrade, setJapaneseGrade] = useState("");
  const [vGrade, setVGrade] = useState("");
  const [postAuthor, setPostAuthor] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [postTags, setPostTags] = useState<WallPostTags>(emptyWallPostTags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialogOpen || !sessionUserId) return;
    let active = true;
    void getMyCommunityProfile()
      .then((profile) => {
        if (active) {
          const listedGym = GYM_PINS.find((gym) => gym.name === profile.homeGym)?.name ?? "";
          setGymName((current) => current || listedGym);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [dialogOpen, sessionUserId]);

  async function submitWall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user) {
      setDialogOpen(false);
      setLoginPromptOpen(true);
      return;
    }
    if (!file) return;
    setSaving(true);
    try {
      const wall = await createWall(file, name, undefined, {
        japaneseGrade: japaneseGrade || undefined,
        vGrade: vGrade || undefined,
        gymName: gymName.trim() || undefined,
        tags: postTags,
      });
      setDialogOpen(false);
      setFile(null);
      setName("");
      setJapaneseGrade("");
      setVGrade("");
      setPostAuthor("");
      setPostDescription("");
      setPostTags(emptyWallPostTags);
      let statusMessage = "壁を登録しました。";
      if (session?.user) {
        try {
          const image = await getImage(wall.imageId);
          if (!image) throw new Error("壁画像が見つかりません。");
          await publishWallPost({
            wallId: wall.id,
            wallName: wall.name,
            gymName: wall.gymName ?? "",
            japaneseGrade: wall.japaneseGrade ?? "",
            vGrade: wall.vGrade ?? "",
            author: postAuthor.trim(),
            description: postDescription.trim(),
            routes: [],
            tags: wall.tags ?? emptyWallPostTags,
            image: await encodeWallPostPreview(image.blob),
          });
          statusMessage = "壁を登録してタイムラインに投稿しました。";
        } catch (reason) {
          statusMessage = `壁は登録済みですが、タイムラインへの投稿に失敗しました: ${reason instanceof Error ? reason.message : "通信エラー"}`;
        }
      } else {
        statusMessage = "壁を登録しました。タイムラインへの自動投稿にはログインが必要です。";
      }
      notify(statusMessage);
      await navigate({ to: "/walls/$wallId", params: { wallId: wall.id } });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "壁を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function signInWithGoogle() {
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
      if (result.error) notify(result.error.message ?? "Googleログインに失敗しました。");
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Googleログインに失敗しました。");
    }
  }

  if (postId) return <WallPostDetailPage postId={postId} />;

  return (
    <main className="page-shell dashboard-page">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR LOCAL WALL LIBRARY</p>
          <h1 className="display-title">
            Walls <span>&</span> Routes
          </h1>
          <p className="intro-copy">壁の写真から、次の一本をつくろう。</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            if (!session?.user) {
              setLoginPromptOpen(true);
              return;
            }
            setJapaneseGrade("");
            setVGrade("");
            setPostAuthor("");
            setPostDescription("");
            setGymName("");
            setDialogOpen(true);
          }}
        >
          <Plus size={18} /> 壁を追加
        </button>
      </section>

      <WallFeed />

      {loginPromptOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-panel modal-panel--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wall-login-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PINTO ACCOUNT</p>
                <h2 id="wall-login-title">ログインが必要です</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={() => setLoginPromptOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="intro-copy">壁を追加するにはログインしてください。</p>
            <div className="modal-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setLoginPromptOpen(false)}
              >
                キャンセル
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void signInWithGoogle()}
              >
                <LogIn size={16} /> Googleでログイン
              </button>
            </div>
          </section>
        </div>
      )}

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
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                required
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
              <span className="field-hint">JPEG / PNG / WebP / HEIC / HEIF</span>
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
            <div className="route-grade-fields">
              <label className="field-label">
                日本式グレード
                <select
                  className="text-input"
                  value={japaneseGrade}
                  onChange={(event) => setJapaneseGrade(event.currentTarget.value)}
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
                  className="text-input"
                  value={vGrade}
                  onChange={(event) => setVGrade(event.currentTarget.value)}
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
            {session?.user ? (
              <>
                <label className="field-label">
                  ジム名
                  <select
                    className="text-input"
                    value={gymName}
                    onChange={(event) => setGymName(event.currentTarget.value)}
                    required
                  >
                    <option value="">ジムを選択</option>
                    {GYM_PINS.map((gym) => (
                      <option key={gym.id} value={gym.name}>
                        {gym.name}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    登録後、壁画像がタイムラインに自動投稿されます。
                  </span>
                </label>
                <label className="field-label">
                  作成者 <span className="field-hint inline">任意</span>
                  <input
                    className="text-input"
                    value={postAuthor}
                    onChange={(event) => setPostAuthor(event.currentTarget.value)}
                    maxLength={80}
                  />
                </label>
                <label className="field-label">
                  説明
                  <textarea
                    className="text-input textarea-input"
                    value={postDescription}
                    onChange={(event) => setPostDescription(event.currentTarget.value)}
                    maxLength={500}
                  />
                </label>
                <div className="field-label wall-tag-field">
                  <span>
                    タグ <span className="field-hint inline">任意・複数選択可</span>
                  </span>
                  <WallTagPicker tags={postTags} onChange={setPostTags} />
                </div>
              </>
            ) : (
              <p className="field-hint">ログイン中は壁の登録後にタイムラインへ自動投稿されます。</p>
            )}
            <div className="modal-actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setDialogOpen(false)}
              >
                キャンセル
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={!file || saving || sessionPending}
              >
                {saving ? "保存中..." : "壁を作成"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
