// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AuthBindings } from "../../../worker/src/auth";
import { routePostRoutes } from "../../../worker/src/routes/route-posts";

vi.mock("../../../worker/src/auth", () => ({
  createAuth: () => ({
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "viewer-1" } }),
    },
  }),
}));

function makeEnv(postExists = true) {
  const statements: string[] = [];
  const boundValues: unknown[][] = [];
  const prepare = vi.fn((sql: string) => {
    statements.push(sql);
    return {
      bind: (...values: unknown[]) => {
        boundValues.push(values);
        if (sql.includes("SELECT handle, username FROM community_profile")) {
          return {
            first: vi.fn().mockResolvedValue({ handle: "viewer", username: "Viewer" }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }
        if (sql.includes("SELECT post.id FROM community_wall_post")) {
          return {
            first: vi.fn().mockResolvedValue(postExists ? { id: "post-1" } : null),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }
        if (sql.includes("SELECT id FROM community_wall_post WHERE id = ? AND userId = ?")) {
          return {
            first: vi.fn().mockResolvedValue(postExists ? { id: "post-1" } : null),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }
        if (sql.includes("SELECT COUNT(*) AS likeCount")) {
          return {
            first: vi.fn().mockResolvedValue({ likeCount: 3 }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }
        return {
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      },
    };
  });
  const env = {
    DB: { prepare },
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://pinto.test",
  } as unknown as AuthBindings;
  return { env, statements, boundValues, prepare };
}

const originHeaders = {
  Origin: "https://pinto.test",
  "Content-Type": "application/json",
};

describe("wall post reactions", () => {
  it("stores a like and returns the updated count", async () => {
    const { env, statements } = makeEnv();
    const response = await routePostRoutes.request(
      "/post-1/like",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({ active: true }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: true, likeCount: 3 });
    expect(
      statements.some((sql) => sql.includes("INSERT OR IGNORE INTO community_wall_post_like")),
    ).toBe(true);
  });

  it("stores a save and rejects reactions on posts the viewer cannot see", async () => {
    const saved = makeEnv();
    const saveResponse = await routePostRoutes.request(
      "/post-1/save",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({ active: true }),
      },
      saved.env,
    );
    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toEqual({ active: true });
    expect(
      saved.statements.some((sql) =>
        sql.includes("INSERT OR IGNORE INTO community_wall_post_save"),
      ),
    ).toBe(true);

    const missing = makeEnv(false);
    const missingResponse = await routePostRoutes.request(
      "/post-1/like",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({ active: true }),
      },
      missing.env,
    );
    expect(missingResponse.status).toBe(404);
    expect(missing.statements).toHaveLength(1);
  });
});

describe("wall post edits", () => {
  it("updates post metadata only for its owner", async () => {
    const { env, statements, boundValues } = makeEnv();
    const response = await routePostRoutes.request(
      "/post-1",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({
          wallName: "Updated wall",
          gymName: "Updated gym",
          japaneseGrade: "3級",
          vGrade: "V4",
          author: "Setter",
          description: "Updated description",
          tags: { hold: ["カチ"], move: [], type: ["ルーフ"] },
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: true });
    const updateIndex = statements.findIndex((sql) => sql.includes("UPDATE community_wall_post"));
    expect(boundValues[updateIndex]).toEqual(
      expect.arrayContaining([
        "Updated wall",
        "Updated gym",
        "Updated description",
        "post-1",
        "viewer-1",
      ]),
    );

    const notOwner = makeEnv(false);
    const forbiddenUpdate = await routePostRoutes.request(
      "/post-1",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({
          wallName: "Updated wall",
          gymName: "Updated gym",
          japaneseGrade: "",
          vGrade: "",
          author: "",
          description: "",
          tags: { hold: [], move: [], type: [] },
        }),
      },
      notOwner.env,
    );
    expect(forbiddenUpdate.status).toBe(404);
    expect(notOwner.statements).toHaveLength(1);
  });

  it("rejects invalid metadata without updating the post", async () => {
    const { env, statements } = makeEnv();
    const response = await routePostRoutes.request(
      "/post-1",
      {
        method: "PUT",
        headers: originHeaders,
        body: JSON.stringify({
          wallName: "",
          gymName: "Updated gym",
          japaneseGrade: "",
          vGrade: "",
          author: "",
          description: "",
          tags: { hold: [], move: [], type: [] },
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("UPDATE community_wall_post"))).toBe(false);
  });
});

describe("wall post tags", () => {
  it("accepts PNG previews when the browser falls back from WebP encoding", async () => {
    const { env } = makeEnv();
    const response = await routePostRoutes.request(
      "/",
      {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({
          wallId: "wall-1",
          wallName: "壁",
          gymName: "ジム",
          routes: [],
          image: "data:image/png;base64,AAAA",
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
  });

  it("stores post metadata and allowed tags and uses category filters in the feed query", async () => {
    const { env, statements, boundValues } = makeEnv();
    const tags = { hold: ["カチ"], move: ["ヒールフック", "クロス"], type: ["ルーフ"] };
    const response = await routePostRoutes.request(
      "/",
      {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({
          wallId: "wall-1",
          wallName: "壁",
          gymName: "ジム",
          japaneseGrade: "3級",
          vGrade: "V4",
          author: "Setter",
          description: "Competition wall",
          routes: [],
          tags,
          image: "data:image/webp;base64,AAAA",
        }),
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      post: {
        japaneseGrade: "3級",
        vGrade: "V4",
        author: "Setter",
        description: "Competition wall",
      },
    });
    const insertIndex = statements.findIndex((sql) =>
      sql.includes("INSERT INTO community_wall_post"),
    );
    expect(boundValues[insertIndex]).toContain(JSON.stringify(tags));
    expect(boundValues[insertIndex]).toEqual(
      expect.arrayContaining(["3級", "V4", "Setter", "Competition wall"]),
    );

    const feedResponse = await routePostRoutes.request(
      "/?scope=all&hold=カチ&hold=ガバ&type=スラブ",
      {},
      env,
    );
    expect(feedResponse.status).toBe(200);
    const feedIndex = statements.findIndex((sql) => sql.includes("SELECT post.id, post.userId"));
    expect(statements[feedIndex]).toContain("json_each(post.tags, '$.hold')");
    expect(statements[feedIndex]).toContain("json_each(post.tags, '$.type')");
    expect(boundValues[feedIndex]).toEqual(expect.arrayContaining(["カチ", "ガバ", "スラブ"]));
  });

  it("rejects unsupported wall grades", async () => {
    const { env, statements } = makeEnv();
    const response = await routePostRoutes.request(
      "/",
      {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({
          wallId: "wall-1",
          wallName: "壁",
          gymName: "ジム",
          vGrade: "V99",
          routes: [],
          image: "data:image/webp;base64,AAAA",
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("INSERT INTO community_wall_post"))).toBe(false);
  });

  it("filters the feed to a profile handle", async () => {
    const { env, statements, boundValues } = makeEnv();
    const response = await routePostRoutes.request("/?scope=all&handle=climber_01", {}, env);

    expect(response.status).toBe(200);
    const feedIndex = statements.findIndex((sql) => sql.includes("SELECT post.id, post.userId"));
    expect(statements[feedIndex]).toContain("profile.handle = ?");
    expect(boundValues[feedIndex]).toEqual(expect.arrayContaining(["climber_01"]));
  });

  it("rejects tag values outside the available options", async () => {
    const { env, statements } = makeEnv();
    const response = await routePostRoutes.request(
      "/",
      {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({
          wallId: "wall-1",
          wallName: "壁",
          gymName: "ジム",
          routes: [],
          tags: { hold: ["unknown"], move: [], type: [] },
          image: "data:image/webp;base64,AAAA",
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("INSERT INTO community_wall_post"))).toBe(false);
  });
});
