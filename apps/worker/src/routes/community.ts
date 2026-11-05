import { JAPANESE_CLIMBING_LEVELS, V_CLIMBING_LEVELS } from "@pinto/shared";
import { Hono } from "hono";
import { type AuthBindings, createAuth } from "../auth";

type CommunityMember = {
  id: string;
  handle: string | null;
  username: string;
  avatar: string | null;
  bio: string;
  climbingLevel: string;
  japaneseClimbingLevel: string;
  vClimbingLevel: string;
  homeGym: string;
  homeGyms: string[];
  residence: string;
  age: number | null;
  followerCount: number;
  followingCount: number;
};

type CommunityMemberRow = Omit<CommunityMember, "homeGyms"> & {
  homeGyms: string | null;
  residence?: string | null;
  age?: number | null;
};

function normalizeCommunityMember(row: CommunityMemberRow): CommunityMember {
  const legacyLevel = row.climbingLevel ?? "";
  const japaneseClimbingLevel =
    row.japaneseClimbingLevel ||
    (JAPANESE_CLIMBING_LEVELS.includes(legacyLevel as (typeof JAPANESE_CLIMBING_LEVELS)[number])
      ? legacyLevel
      : "");
  const vClimbingLevel =
    row.vClimbingLevel ||
    (V_CLIMBING_LEVELS.includes(legacyLevel as (typeof V_CLIMBING_LEVELS)[number])
      ? legacyLevel
      : "");
  let homeGyms: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.homeGyms ?? "[]");
    if (Array.isArray(parsed)) {
      homeGyms = [...new Set(parsed.filter((gym): gym is string => typeof gym === "string"))];
    }
  } catch {
    homeGyms = [];
  }
  if (homeGyms.length === 0 && row.homeGym) homeGyms = [row.homeGym];
  return {
    ...row,
    climbingLevel: japaneseClimbingLevel || vClimbingLevel || legacyLevel,
    japaneseClimbingLevel,
    vClimbingLevel,
    homeGym: homeGyms[0] ?? row.homeGym ?? "",
    homeGyms,
    residence: row.residence ?? "",
    age: row.age ?? null,
  };
}

export const communityRoutes = new Hono<{ Bindings: AuthBindings }>();

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

async function hasRegisteredIdentity(env: AuthBindings, userId: string) {
  const profile = await env.DB.prepare(
    "SELECT handle, username FROM community_profile WHERE userId = ?",
  )
    .bind(userId)
    .first<{ handle: string | null; username: string }>();
  return Boolean(profile?.handle && profile.username.trim());
}

communityRoutes.get("/profile", async (context) => {
  const authenticated = await getSession(context.req.raw, context.env);
  if (!authenticated) return context.json({ error: "ログインが必要です。" }, 401);

  const now = Date.now();
  await context.env.DB.prepare(
    `INSERT OR IGNORE INTO community_profile (userId, createdAt, updatedAt)
     VALUES (?, ?, ?)`,
  )
    .bind(authenticated.user.id, now, now)
    .run();

  const profile = await context.env.DB.prepare(
    `SELECT user.id, community_profile.handle, community_profile.username, community_profile.bio,
          community_profile.climbingLevel, community_profile.japaneseClimbingLevel,
          community_profile.vClimbingLevel, community_profile.homeGym, community_profile.homeGyms,
          community_profile.residence, community_profile.age, community_profile.avatar,
         community_profile.isPrivate,
         (SELECT COUNT(*) FROM community_follow WHERE followedId = user.id) AS followerCount,
         (SELECT COUNT(*) FROM community_follow WHERE followerId = user.id) AS followingCount
       FROM community_profile JOIN user ON user.id = community_profile.userId
       WHERE user.id = ?`,
  )
    .bind(authenticated.user.id)
    .first<CommunityMemberRow & { isPrivate: number }>();
  return context.json({
    profile: profile
      ? { ...normalizeCommunityMember(profile), isPrivate: Boolean(profile.isPrivate) }
      : null,
  });
});

communityRoutes.get("/connections/:kind", async (context) => {
  const authenticated = await getSession(context.req.raw, context.env);
  if (!authenticated) return context.json({ error: "ログインが必要です。" }, 401);
  if (!(await hasRegisteredIdentity(context.env, authenticated.user.id))) {
    return context.json({ error: "先にユーザー名とユーザーIDを登録してください。" }, 403);
  }

  const kind = context.req.param("kind");
  if (kind !== "followers" && kind !== "following") {
    return context.json({ error: "一覧の種類が無効です。" }, 400);
  }

  const relationColumn = kind === "followers" ? "followedId" : "followerId";
  const memberColumn = kind === "followers" ? "followerId" : "followedId";
  const { results } = await context.env.DB.prepare(
    `SELECT user.id, community_profile.handle, community_profile.username, community_profile.avatar,
           community_profile.bio, community_profile.climbingLevel,
           community_profile.japaneseClimbingLevel, community_profile.vClimbingLevel,
           community_profile.homeGym,
           community_profile.homeGyms, community_profile.residence, community_profile.age,
            (SELECT COUNT(*) FROM community_follow WHERE followedId = user.id) AS followerCount,
            (SELECT COUNT(*) FROM community_follow WHERE followerId = user.id) AS followingCount
     FROM community_follow
     JOIN user ON user.id = community_follow.${memberColumn}
     LEFT JOIN community_profile ON community_profile.userId = user.id
     WHERE community_follow.${relationColumn} = ?
     ORDER BY community_follow.createdAt DESC LIMIT 100`,
  )
    .bind(authenticated.user.id)
    .all<CommunityMemberRow>();
  return context.json({ members: results.map(normalizeCommunityMember) });
});

communityRoutes.put("/profile", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const authenticated = await getSession(context.req.raw, context.env);
  if (!authenticated) return context.json({ error: "ログインが必要です。" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await context.req.json<Record<string, unknown>>();
  } catch {
    return context.json({ error: "プロフィールの形式が無効です。" }, 400);
  }

  const handle = typeof input.handle === "string" ? input.handle.trim().toLowerCase() : "";
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  const legacyLevel = typeof input.climbingLevel === "string" ? input.climbingLevel.trim() : "";
  const japaneseInput =
    typeof input.japaneseClimbingLevel === "string" ? input.japaneseClimbingLevel.trim() : "";
  const vInput = typeof input.vClimbingLevel === "string" ? input.vClimbingLevel.trim() : "";
  const japaneseClimbingLevel =
    input.japaneseClimbingLevel === undefined &&
    JAPANESE_CLIMBING_LEVELS.includes(legacyLevel as (typeof JAPANESE_CLIMBING_LEVELS)[number])
      ? legacyLevel
      : japaneseInput;
  const vClimbingLevel =
    input.vClimbingLevel === undefined &&
    V_CLIMBING_LEVELS.includes(legacyLevel as (typeof V_CLIMBING_LEVELS)[number])
      ? legacyLevel
      : vInput;
  const hasSeparateLevels =
    input.japaneseClimbingLevel !== undefined || input.vClimbingLevel !== undefined;
  const climbingLevel =
    japaneseClimbingLevel || vClimbingLevel || (hasSeparateLevels ? "" : legacyLevel);
  const residence = typeof input.residence === "string" ? input.residence.trim() : "";
  const ageInput = input.age === "" ? null : input.age;
  const age = ageInput === undefined || ageInput === null ? null : ageInput;
  const homeGymInput =
    input.homeGyms === undefined
      ? typeof input.homeGym === "string" && input.homeGym.trim()
        ? [input.homeGym]
        : []
      : input.homeGyms;
  if (!Array.isArray(homeGymInput) || !homeGymInput.every((gym) => typeof gym === "string")) {
    return context.json({ error: "よく行くジムの形式が無効です。" }, 400);
  }
  const homeGyms = [...new Set(homeGymInput.map((gym) => gym.trim()).filter(Boolean))];
  const homeGym = homeGyms[0] ?? "";
  const avatar =
    input.avatar === null ? null : typeof input.avatar === "string" ? input.avatar : undefined;
  const isPrivate = input.isPrivate === true;
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    return context.json(
      { error: "ユーザーIDは英小文字・数字・_の3〜24文字で入力してください。" },
      400,
    );
  }
  if (!username || username.length > 32) {
    return context.json({ error: "ユーザー名は1〜32文字で入力してください。" }, 400);
  }
  if (
    bio.length > 240 ||
    residence.length > 100 ||
    homeGyms.length > 30 ||
    homeGyms.some((gym) => gym.length > 80)
  ) {
    return context.json({ error: "プロフィールの入力上限を超えています。" }, 400);
  }
  if (
    (japaneseClimbingLevel &&
      !JAPANESE_CLIMBING_LEVELS.includes(
        japaneseClimbingLevel as (typeof JAPANESE_CLIMBING_LEVELS)[number],
      )) ||
    (vClimbingLevel &&
      !V_CLIMBING_LEVELS.includes(vClimbingLevel as (typeof V_CLIMBING_LEVELS)[number])) ||
    legacyLevel.length > 32
  ) {
    return context.json({ error: "クライミングレベルの選択内容が無効です。" }, 400);
  }
  if (age !== null && (typeof age !== "number" || !Number.isInteger(age) || age < 1 || age > 120)) {
    return context.json({ error: "年齢は1〜120の整数で入力してください。" }, 400);
  }
  if (
    avatar === undefined ||
    (avatar !== null &&
      (avatar.length > 200_000 || !/^data:image\/(webp|png|jpeg);base64,/.test(avatar)))
  ) {
    return context.json({ error: "アイコン画像が無効か、サイズ上限を超えています。" }, 400);
  }

  const now = Date.now();
  try {
    await context.env.DB.prepare(
      `INSERT INTO community_profile
         (userId, handle, username, bio, climbingLevel, japaneseClimbingLevel, vClimbingLevel,
          homeGym, homeGyms, residence, age, avatar, isPrivate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         handle = excluded.handle, username = excluded.username, bio = excluded.bio,
         climbingLevel = excluded.climbingLevel,
         japaneseClimbingLevel = excluded.japaneseClimbingLevel,
         vClimbingLevel = excluded.vClimbingLevel, homeGym = excluded.homeGym,
         homeGyms = excluded.homeGyms, residence = excluded.residence, age = excluded.age,
         avatar = excluded.avatar,
         isPrivate = excluded.isPrivate,
         updatedAt = excluded.updatedAt`,
    )
      .bind(
        authenticated.user.id,
        handle,
        username,
        bio,
        climbingLevel,
        japaneseClimbingLevel,
        vClimbingLevel,
        homeGym,
        JSON.stringify(homeGyms),
        residence,
        age,
        avatar,
        isPrivate ? 1 : 0,
        now,
        now,
      )
      .run();
  } catch (reason) {
    if (reason instanceof Error && reason.message.includes("UNIQUE constraint failed")) {
      return context.json({ error: "このユーザーIDはすでに使われています。" }, 409);
    }
    throw reason;
  }
  return context.json({
    profile: {
      handle,
      username,
      bio,
      climbingLevel,
      japaneseClimbingLevel,
      vClimbingLevel,
      homeGym,
      homeGyms,
      residence,
      age,
      avatar,
      isPrivate,
    },
  });
});

communityRoutes.get("/users", async (context) => {
  const query = (context.req.query("q") ?? "").trim().slice(0, 40);
  const { results } = await context.env.DB.prepare(
    `SELECT user.id, community_profile.handle, community_profile.username, community_profile.bio,
          community_profile.climbingLevel, community_profile.japaneseClimbingLevel,
          community_profile.vClimbingLevel, community_profile.homeGym, community_profile.homeGyms,
          community_profile.residence, community_profile.age, community_profile.avatar,
            (SELECT COUNT(*) FROM community_follow WHERE followedId = user.id) AS followerCount,
            (SELECT COUNT(*) FROM community_follow WHERE followerId = user.id) AS followingCount
     FROM community_profile JOIN user ON user.id = community_profile.userId
     WHERE community_profile.handle IS NOT NULL AND (
      ? = '' OR instr(lower(community_profile.username), lower(?)) > 0 OR
      instr(lower(community_profile.handle), lower(?)) > 0 OR
      instr(lower(community_profile.japaneseClimbingLevel), lower(?)) > 0 OR
      instr(lower(community_profile.vClimbingLevel), lower(?)) > 0 OR
      instr(lower(community_profile.homeGym), lower(?)) > 0 OR
      instr(lower(community_profile.homeGyms), lower(?)) > 0
     )
     ORDER BY community_profile.updatedAt DESC LIMIT 50`,
  )
    .bind(query, query, query, query, query, query, query)
    .all<CommunityMemberRow>();
  return context.json({ members: results.map(normalizeCommunityMember) });
});

communityRoutes.get("/users/:handle", async (context) => {
  const authenticated = await getSession(context.req.raw, context.env);
  const profile = await context.env.DB.prepare(
    `SELECT user.id, community_profile.handle, community_profile.username, community_profile.bio,
          community_profile.climbingLevel, community_profile.japaneseClimbingLevel,
          community_profile.vClimbingLevel, community_profile.homeGym, community_profile.homeGyms,
          community_profile.residence, community_profile.age, community_profile.avatar,
            (SELECT COUNT(*) FROM community_follow WHERE followedId = user.id) AS followerCount,
            (SELECT COUNT(*) FROM community_follow WHERE followerId = user.id) AS followingCount,
            EXISTS (
              SELECT 1 FROM community_follow
              WHERE followerId = ? AND followedId = user.id
            ) AS isFollowing,
            EXISTS (
              SELECT 1 FROM community_follow
              WHERE followerId = user.id AND followedId = ?
            ) AS isFollowedBy,
            (user.id = ?) AS isSelf
     FROM community_profile JOIN user ON user.id = community_profile.userId
     WHERE community_profile.handle = ?`,
  )
    .bind(
      authenticated?.user.id ?? "",
      authenticated?.user.id ?? "",
      authenticated?.user.id ?? "",
      context.req.param("handle"),
    )
    .first<CommunityMemberRow & { isFollowing: number; isFollowedBy: number; isSelf: number }>();
  if (!profile) return context.json({ error: "プロフィールが見つかりません。" }, 404);
  return context.json({ profile: normalizeCommunityMember(profile) });
});

communityRoutes.post("/users/:handle/follow", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const authenticated = await getSession(context.req.raw, context.env);
  if (!authenticated) return context.json({ error: "ログインが必要です。" }, 401);
  if (!(await hasRegisteredIdentity(context.env, authenticated.user.id))) {
    return context.json({ error: "先にユーザー名とユーザーIDを登録してください。" }, 403);
  }

  const target = await context.env.DB.prepare(
    "SELECT userId FROM community_profile WHERE handle = ?",
  )
    .bind(context.req.param("handle"))
    .first<{ userId: string }>();
  if (!target) return context.json({ error: "プロフィールが見つかりません。" }, 404);
  if (target.userId === authenticated.user.id) {
    return context.json({ error: "自分をフォローすることはできません。" }, 400);
  }

  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO community_follow (followerId, followedId, createdAt) VALUES (?, ?, ?)",
  )
    .bind(authenticated.user.id, target.userId, Date.now())
    .run();
  return context.json({ following: true });
});

communityRoutes.delete("/users/:handle/follow", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const authenticated = await getSession(context.req.raw, context.env);
  if (!authenticated) return context.json({ error: "ログインが必要です。" }, 401);
  if (!(await hasRegisteredIdentity(context.env, authenticated.user.id))) {
    return context.json({ error: "先にユーザー名とユーザーIDを登録してください。" }, 403);
  }

  await context.env.DB.prepare(
    `DELETE FROM community_follow
     WHERE followerId = ? AND followedId = (
       SELECT userId FROM community_profile WHERE handle = ?
     )`,
  )
    .bind(authenticated.user.id, context.req.param("handle"))
    .run();
  return context.json({ following: false });
});
