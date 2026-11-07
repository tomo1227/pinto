import {
  WALL_POST_TAG_CATEGORIES,
  WALL_POST_TAGS,
  type WallPostTagCategory,
  type WallPostTags,
} from "@pinto/shared";
import { type Context, Hono } from "hono";
import { type AuthBindings, createAuth } from "../auth";

type WallPostRoute = {
  id: string;
  name: string;
  grade: string;
  description: string;
};

type WallPost = {
  id: string;
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  wallId: string;
  wallName: string;
  gymName: string;
  routes: WallPostRoute[];
  tags: WallPostTags;
  image: string;
  createdAt: number;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};

type WallPostRow = Omit<WallPost, "routes" | "tags" | "likedByMe" | "savedByMe"> & {
  routes: string;
  tags: string;
  likedByMe: number;
  savedByMe: number;
};

function parseTagCategory<Category extends WallPostTagCategory>(
  category: Category,
  value: unknown,
): WallPostTags[Category] | null {
  if (value === undefined) return [] as WallPostTags[Category];
  const allowedTags: readonly string[] = WALL_POST_TAGS[category];
  if (
    !Array.isArray(value) ||
    value.length > allowedTags.length ||
    !value.every((tag) => typeof tag === "string" && allowedTags.includes(tag))
  ) {
    return null;
  }
  return [...new Set(value)] as WallPostTags[Category];
}

function parseWallPostTags(value: unknown): WallPostTags | null {
  if (value === undefined) return { hold: [], move: [], type: [] };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const hold = parseTagCategory("hold", input.hold);
  const move = parseTagCategory("move", input.move);
  const type = parseTagCategory("type", input.type);
  if (!hold || !move || !type) return null;
  return { hold, move, type };
}

export const routePostRoutes = new Hono<{ Bindings: AuthBindings }>();

async function getSession(request: Request, env: AuthBindings) {
  return createAuth(env).api.getSession({ headers: request.headers });
}

function hasTrustedOrigin(request: Request, env: AuthBindings) {
  try {
    return (
      new URL(request.headers.get("origin") ?? "").origin ===
      new URL(env.BETTER_AUTH_URL ?? "").origin
    );
  } catch {
    return false;
  }
}

function canSeeProfileSql() {
  return `(profile.isPrivate = 0 OR profile.userId = ? OR EXISTS (
    SELECT 1 FROM community_follow
    WHERE followerId = ? AND followedId = profile.userId
  ))`;
}

routePostRoutes.get("/", async (context) => {
  context.header("Cache-Control", "private, no-store");
  const session = await getSession(context.req.raw, context.env);
  const viewerId = session?.user.id ?? "";
  const scope = context.req.query("scope") ?? "all";
  const followingScope = scope === "following";
  const ownScope = scope === "own";
  const savedScope = scope === "saved";
  if ((followingScope || ownScope || savedScope) && !session) {
    return context.json({ error: "ログインが必要です。" }, 401);
  }

  const gym = (context.req.query("gym") ?? "").trim().slice(0, 80);
  const grade = (context.req.query("grade") ?? "").trim().slice(0, 20);
  const authorHandle = (context.req.query("handle") ?? "").trim().toLowerCase().slice(0, 24);
  const tagBindings: string[] = [];
  const tagFilterSql = WALL_POST_TAG_CATEGORIES.flatMap((category) => {
    const allowedTags: readonly string[] = WALL_POST_TAGS[category];
    const tags = [
      ...new Set((context.req.queries(category) ?? []).filter((tag) => allowedTags.includes(tag))),
    ];
    if (tags.length === 0) return [];
    tagBindings.push(...tags);
    return [
      `AND EXISTS (
         SELECT 1 FROM json_each(post.tags, '$.${category}') AS tag
         WHERE tag.value IN (${tags.map(() => "?").join(", ")})
       )`,
    ];
  }).join("\n");
  const { results: rows } = await context.env.DB.prepare(
    `SELECT post.id, post.userId, profile.username, profile.handle, profile.avatar,
            post.wallId, post.wallName, post.gymName, post.routes, post.tags, post.image, post.createdAt,
            (SELECT COUNT(*) FROM community_wall_post_like AS likes WHERE likes.postId = post.id) AS likeCount,
            (viewer_like.userId IS NOT NULL) AS likedByMe,
            (viewer_save.userId IS NOT NULL) AS savedByMe
     FROM community_wall_post AS post
     JOIN community_profile AS profile ON profile.userId = post.userId
     LEFT JOIN community_wall_post_like AS viewer_like
       ON viewer_like.postId = post.id AND viewer_like.userId = ?
     LEFT JOIN community_wall_post_save AS viewer_save
       ON viewer_save.postId = post.id AND viewer_save.userId = ?
     WHERE ${canSeeProfileSql()}
       AND (? = 0 OR EXISTS (
         SELECT 1 FROM community_follow
         WHERE followerId = ? AND followedId = post.userId
       ))
       AND (? = 0 OR post.userId = ?)
       AND (? = 0 OR EXISTS (
         SELECT 1 FROM community_wall_post_save
         WHERE postId = post.id AND userId = ?
       ))
       AND (? = '' OR post.gymName = ?)
       AND (? = '' OR EXISTS (
         SELECT 1 FROM json_each(post.routes) AS route
         WHERE json_extract(route.value, '$.grade') = ?
       ))
       AND (? = '' OR profile.handle = ?)
       ${tagFilterSql}
     ORDER BY post.createdAt DESC LIMIT 100`,
  )
    .bind(
      viewerId,
      viewerId,
      viewerId,
      viewerId,
      followingScope ? 1 : 0,
      viewerId,
      ownScope ? 1 : 0,
      viewerId,
      savedScope ? 1 : 0,
      viewerId,
      gym,
      gym,
      grade,
      grade,
      authorHandle,
      authorHandle,
      ...tagBindings,
    )
    .all<WallPostRow>();
  const posts: WallPost[] = rows.map((row) => ({
    ...row,
    routes: JSON.parse(row.routes) as WallPostRoute[],
    tags: JSON.parse(row.tags) as WallPostTags,
    likedByMe: Boolean(row.likedByMe),
    savedByMe: Boolean(row.savedByMe),
  }));

  const { results: gyms } = await context.env.DB.prepare(
    `SELECT DISTINCT post.gymName AS value
     FROM community_wall_post AS post
     JOIN community_profile AS profile ON profile.userId = post.userId
     WHERE ${canSeeProfileSql()} AND post.gymName != ''
     ORDER BY post.gymName LIMIT 100`,
  )
    .bind(viewerId, viewerId)
    .all<{ value: string }>();
  const { results: grades } = await context.env.DB.prepare(
    `SELECT DISTINCT json_extract(route.value, '$.grade') AS value
     FROM community_wall_post AS post
     JOIN community_profile AS profile ON profile.userId = post.userId
     JOIN json_each(post.routes) AS route
    WHERE ${canSeeProfileSql()} AND json_extract(route.value, '$.grade') != ''
     ORDER BY value LIMIT 100`,
  )
    .bind(viewerId, viewerId)
    .all<{ value: string }>();

  return context.json({
    posts,
    gyms: gyms.map((item) => item.value),
    grades: grades.map((item) => item.value),
  });
});

routePostRoutes.get("/:id", async (context) => {
  context.header("Cache-Control", "private, no-store");
  const session = await getSession(context.req.raw, context.env);
  const viewerId = session?.user.id ?? "";
  const row = await context.env.DB.prepare(
    `SELECT post.id, post.userId, profile.username, profile.handle, profile.avatar,
            post.wallId, post.wallName, post.gymName, post.routes, post.tags, post.image, post.createdAt,
            (SELECT COUNT(*) FROM community_wall_post_like AS likes WHERE likes.postId = post.id) AS likeCount,
            (viewer_like.userId IS NOT NULL) AS likedByMe,
            (viewer_save.userId IS NOT NULL) AS savedByMe
     FROM community_wall_post AS post
     JOIN community_profile AS profile ON profile.userId = post.userId
     LEFT JOIN community_wall_post_like AS viewer_like
       ON viewer_like.postId = post.id AND viewer_like.userId = ?
     LEFT JOIN community_wall_post_save AS viewer_save
       ON viewer_save.postId = post.id AND viewer_save.userId = ?
     WHERE post.id = ? AND ${canSeeProfileSql()}`,
  )
    .bind(viewerId, viewerId, context.req.param("id"), viewerId, viewerId)
    .first<WallPostRow>();
  if (!row) return context.json({ error: "投稿が見つかりません。" }, 404);

  const post: WallPost = {
    ...row,
    routes: JSON.parse(row.routes) as WallPostRoute[],
    tags: JSON.parse(row.tags) as WallPostTags,
    likedByMe: Boolean(row.likedByMe),
    savedByMe: Boolean(row.savedByMe),
  };
  return context.json({ post });
});

async function updatePostReaction(
  context: Context<{ Bindings: AuthBindings }>,
  kind: "like" | "save",
) {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const session = await getSession(context.req.raw, context.env);
  if (!session) return context.json({ error: "ログインが必要です。" }, 401);

  let input: { active?: unknown };
  try {
    input = await context.req.json<{ active?: unknown }>();
  } catch {
    return context.json({ error: "操作内容の形式が無効です。" }, 400);
  }
  if (typeof input.active !== "boolean") {
    return context.json({ error: "操作内容が無効です。" }, 400);
  }

  const postId = context.req.param("id");
  const post = await context.env.DB.prepare(
    `SELECT post.id FROM community_wall_post AS post
     JOIN community_profile AS profile ON profile.userId = post.userId
     WHERE post.id = ? AND ${canSeeProfileSql()}`,
  )
    .bind(postId, session.user.id, session.user.id)
    .first<{ id: string }>();
  if (!post) return context.json({ error: "投稿が見つかりません。" }, 404);

  const table = kind === "like" ? "community_wall_post_like" : "community_wall_post_save";
  if (input.active) {
    await context.env.DB.prepare(
      `INSERT OR IGNORE INTO ${table} (postId, userId, createdAt) VALUES (?, ?, ?)`,
    )
      .bind(postId, session.user.id, Date.now())
      .run();
  } else {
    await context.env.DB.prepare(`DELETE FROM ${table} WHERE postId = ? AND userId = ?`)
      .bind(postId, session.user.id)
      .run();
  }

  if (kind === "like") {
    const likes = await context.env.DB.prepare(
      "SELECT COUNT(*) AS likeCount FROM community_wall_post_like WHERE postId = ?",
    )
      .bind(postId)
      .first<{ likeCount: number }>();
    return context.json({ active: input.active, likeCount: likes?.likeCount ?? 0 });
  }
  return context.json({ active: input.active });
}

routePostRoutes.put("/:id/like", (context) => updatePostReaction(context, "like"));
routePostRoutes.put("/:id/save", (context) => updatePostReaction(context, "save"));

routePostRoutes.post("/", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const session = await getSession(context.req.raw, context.env);
  if (!session) return context.json({ error: "ログインが必要です。" }, 401);

  const profile = await context.env.DB.prepare(
    "SELECT handle, username FROM community_profile WHERE userId = ?",
  )
    .bind(session.user.id)
    .first<{ handle: string | null; username: string }>();
  if (!profile?.handle || !profile.username.trim()) {
    return context.json(
      { error: "投稿するには先にユーザー名とユーザーIDを登録してください。" },
      403,
    );
  }

  let input: Record<string, unknown>;
  try {
    input = await context.req.json<Record<string, unknown>>();
  } catch {
    return context.json({ error: "投稿の形式が無効です。" }, 400);
  }

  const wallId = typeof input.wallId === "string" ? input.wallId : "";
  const wallName = typeof input.wallName === "string" ? input.wallName.trim() : "";
  const gymName = typeof input.gymName === "string" ? input.gymName.trim() : "";
  const image = typeof input.image === "string" ? input.image : "";
  const tags = parseWallPostTags(input.tags);
  if (!/^[\w-]{1,64}$/.test(wallId)) {
    return context.json({ error: "壁IDが無効です。" }, 400);
  }
  if (!wallName || wallName.length > 80) {
    return context.json({ error: "壁名は1〜80文字で入力してください。" }, 400);
  }
  if (!gymName || gymName.length > 80) {
    return context.json({ error: "ジム名は1〜80文字で入力してください。" }, 400);
  }
  if (!Array.isArray(input.routes) || input.routes.length > 100) {
    return context.json({ error: "ルート一覧の形式が無効です。" }, 400);
  }
  if (!tags) return context.json({ error: "タグの選択内容が無効です。" }, 400);
  const routes: WallPostRoute[] = [];
  for (const value of input.routes) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return context.json({ error: "ルート一覧の形式が無効です。" }, 400);
    }
    const item = value as Record<string, unknown>;
    const routeId = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const grade = typeof item.grade === "string" ? item.grade.trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (
      !/^[\w-]{1,64}$/.test(routeId) ||
      !name ||
      name.length > 80 ||
      grade.length > 20 ||
      description.length > 500
    ) {
      return context.json({ error: "ルート情報の入力内容を確認してください。" }, 400);
    }
    routes.push({ id: routeId, name, grade, description });
  }
  if (image.length > 700_000 || !/^data:image\/(webp|png|jpeg);base64,/.test(image)) {
    return context.json({ error: "投稿画像が無効か、サイズ上限を超えています。" }, 400);
  }

  const postId = crypto.randomUUID();
  const now = Date.now();
  await context.env.DB.prepare(
    `INSERT INTO community_wall_post
       (id, userId, wallId, wallName, gymName, routes, tags, image, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, wallId) DO UPDATE SET
       wallName = excluded.wallName, gymName = excluded.gymName,
       routes = excluded.routes, tags = excluded.tags, image = excluded.image,
       updatedAt = excluded.updatedAt`,
  )
    .bind(
      postId,
      session.user.id,
      wallId,
      wallName,
      gymName,
      JSON.stringify(routes),
      JSON.stringify(tags),
      image,
      now,
      now,
    )
    .run();

  return context.json({
    post: { id: postId, userId: session.user.id, wallId, wallName, gymName, routes, tags },
  });
});

routePostRoutes.delete("/:id", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const session = await getSession(context.req.raw, context.env);
  if (!session) return context.json({ error: "ログインが必要です。" }, 401);
  const result = await context.env.DB.prepare(
    "DELETE FROM community_wall_post WHERE id = ? AND userId = ?",
  )
    .bind(context.req.param("id"), session.user.id)
    .run();
  if (!result.meta.changes) return context.json({ error: "投稿が見つかりません。" }, 404);
  return context.json({ deleted: true });
});
