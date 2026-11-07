import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, Heart, MapPin, Pencil, Share2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../infrastructure/api/auth";
import {
  getWallPost,
  setWallPostLike,
  setWallPostSaved,
  type WallPost,
} from "../../infrastructure/api/community";
import { useWallPng } from "./use-wall-png";

export function WallPostDetailPage({ postId }: { postId: string }) {
  const { data: session } = authClient.useSession();
  const [post, setPost] = useState<WallPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"like" | "save" | null>(null);
  const [error, setError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const postWallId = post?.wallId;
  const postUserId = post?.userId;
  const viewerUserId = session?.user?.id;
  const {
    hasLocalWall,
    url: localPngUrl,
    error: imageError,
  } = useWallPng(postUserId === viewerUserId ? postWallId : undefined);
  const imageUrl = localPngUrl ?? post?.image;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getWallPost(postId, Boolean(session?.user))
      .then((result) => {
        if (active) setPost(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setPost(null);
          setError(reason instanceof Error ? reason.message : "投稿を読み込めませんでした。");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, session?.user]);

  async function toggleLike() {
    if (!post || !session?.user) return;
    setPendingAction("like");
    setError("");
    try {
      const result = await setWallPostLike(post.id, !post.likedByMe);
      setPost((current) =>
        current ? { ...current, likedByMe: result.active, likeCount: result.likeCount } : current,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "いいねを更新できませんでした。");
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleSaved() {
    if (!post || !session?.user) return;
    setPendingAction("save");
    setError("");
    try {
      const result = await setWallPostSaved(post.id, !post.savedByMe);
      setPost((current) => (current ? { ...current, savedByMe: result.active } : current));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存状態を更新できませんでした。");
    } finally {
      setPendingAction(null);
    }
  }

  async function sharePost() {
    if (!post) return;
    setError("");
    setShareNotice("");
    const url = new URL(`/?post=${encodeURIComponent(post.id)}`, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: post.wallName,
            text: `${post.wallName} · ${post.gymName}`,
            url,
          });
          return;
        } catch (reason) {
          if (reason instanceof Error && reason.name === "AbortError") return;
          if (!navigator.clipboard?.writeText) throw reason;
        }
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error("このブラウザーではリンクを共有できません。");
      }
      await navigator.clipboard.writeText(url);
      setShareNotice("投稿リンクをコピーしました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "リンクを共有できませんでした。");
    }
  }

  return (
    <main className="page-shell wall-post-detail-page">
      <Link className="text-link wall-post-detail__back" to="/" search={{}}>
        <ArrowLeft size={15} /> 壁の投稿一覧
      </Link>
      {(error || imageError) && (
        <p className="community-status" role="alert">
          {error || imageError}
        </p>
      )}
      {loading ? (
        <p className="empty-copy">投稿を読み込んでいます...</p>
      ) : !post ? (
        <p className="empty-copy">投稿が見つからないか、閲覧できません。</p>
      ) : (
        <article className="wall-post-detail">
          {session?.user?.id === post.userId && hasLocalWall ? (
            <Link
              className="wall-post-detail__image-link"
              to="/walls/$wallId"
              params={{ wallId: post.wallId }}
              aria-label={`${post.wallName}を編集`}
            >
              <img
                className="wall-post-detail__image"
                src={imageUrl}
                alt={`${post.wallName}の壁画像`}
              />
            </Link>
          ) : (
            <img
              className="wall-post-detail__image"
              src={imageUrl}
              alt={`${post.wallName}の壁画像`}
            />
          )}
          <div className="wall-post-detail__body">
            <header className="wall-post-detail__heading">
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
              </div>
              <p className="eyebrow">WALL POST</p>
              <h1 className="display-title">{post.wallName}</h1>
              <p className="route-post__meta">
                <MapPin size={14} /> {post.gymName}
                {[post.japaneseGrade, post.vGrade].some(Boolean) && (
                  <span>{[post.japaneseGrade, post.vGrade].filter(Boolean).join(" · ")}</span>
                )}
                <span>{post.routes.length} ルート</span>
              </p>
              {post.author && <p className="route-post__description">作成者: {post.author}</p>}
              {post.description && <p className="route-post__description">{post.description}</p>}
              <time dateTime={new Date(post.createdAt).toISOString()}>
                {new Intl.DateTimeFormat("ja-JP", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(post.createdAt)}
              </time>
            </header>

            {post.tags && (
              <div className="route-post__tags">
                {post.tags.hold.map((tag) => (
                  <span key={`hold-${tag}`}>ホールド: {tag}</span>
                ))}
                {post.tags.move.map((tag) => (
                  <span key={`move-${tag}`}>ムーブ: {tag}</span>
                ))}
                {post.tags.type.map((tag) => (
                  <span key={`type-${tag}`}>タイプ: {tag}</span>
                ))}
              </div>
            )}

            <div className="wall-post-detail__actions">
              {session?.user?.id === post.userId && hasLocalWall && (
                <Link
                  className="button button--primary"
                  to="/walls/$wallId"
                  params={{ wallId: post.wallId }}
                >
                  <Pencil size={15} /> 編集
                </Link>
              )}
              <button
                className={`route-post__action ${post.likedByMe ? "is-active" : ""}`}
                type="button"
                aria-label={`${post.wallName}にいいね`}
                aria-pressed={post.likedByMe}
                disabled={!session?.user || pendingAction !== null}
                onClick={() => void toggleLike()}
              >
                <Heart size={16} fill={post.likedByMe ? "currentColor" : "none"} />
                <span>{post.likeCount}</span>
              </button>
              <button
                className={`route-post__action ${post.savedByMe ? "is-active" : ""}`}
                type="button"
                aria-label={`${post.wallName}を保存`}
                aria-pressed={post.savedByMe}
                disabled={!session?.user || pendingAction !== null}
                onClick={() => void toggleSaved()}
              >
                <Bookmark size={16} fill={post.savedByMe ? "currentColor" : "none"} />
                <span>{post.savedByMe ? "保存済み" : "保存"}</span>
              </button>
              <button
                className="route-post__action"
                type="button"
                aria-label="投稿を共有"
                onClick={() => void sharePost()}
              >
                <Share2 size={16} />
                <span>共有</span>
              </button>
            </div>
            {shareNotice && (
              <p className="field-hint" role="status">
                {shareNotice}
              </p>
            )}
            {!session?.user && <p className="field-hint">いいね・保存にはログインが必要です。</p>}
          </div>
        </article>
      )}
    </main>
  );
}
