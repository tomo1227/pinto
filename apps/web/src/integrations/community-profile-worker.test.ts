// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AuthBindings } from "../../../worker/src/auth";
import { communityRoutes } from "../../../worker/src/routes/community";

vi.mock("../../../worker/src/auth", () => ({
  createAuth: () => ({
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "viewer-1" } }),
    },
  }),
}));

function makeEnv(publicProfile: Record<string, unknown> | null = null) {
  const statements: string[] = [];
  const boundValues: unknown[][] = [];
  const prepare = vi.fn((sql: string) => {
    statements.push(sql);
    return {
      bind: (...values: unknown[]) => {
        boundValues.push(values);
        return {
          first: vi
            .fn()
            .mockResolvedValue(
              sql.includes("FROM community_profile JOIN user") ? publicProfile : null,
            ),
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
  return { env, statements, boundValues };
}

const headers = {
  Origin: "https://pinto.test",
  "Content-Type": "application/json",
};

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    handle: "climber_01",
    username: "Climber",
    bio: "",
    climbingLevel: "",
    homeGym: "",
    avatar: null,
    isPrivate: false,
    ...overrides,
  };
}

describe("community profile details", () => {
  it("returns whether the profile follows the viewer", async () => {
    const publicProfile = {
      id: "member-1",
      handle: "climber_02",
      username: "Climber",
      avatar: null,
      bio: "",
      climbingLevel: "",
      japaneseClimbingLevel: "",
      vClimbingLevel: "",
      homeGym: "",
      homeGyms: "[]",
      residence: "",
      age: null,
      followerCount: 1,
      followingCount: 1,
      isFollowing: 0,
      isFollowedBy: 1,
      isSelf: 0,
    };
    const { env, statements, boundValues } = makeEnv(publicProfile);
    const response = await communityRoutes.request("/users/climber_02", {}, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ profile: { isFollowedBy: 1 } });
    const profileIndex = statements.findIndex((sql) => sql.includes("AS isFollowedBy"));
    expect(boundValues[profileIndex]).toEqual(["viewer-1", "viewer-1", "viewer-1", "climber_02"]);
  });

  it("saves residence, optional age, and multiple gyms", async () => {
    const { env, statements, boundValues } = makeEnv();
    const homeGyms = ["グラビティリサーチ梅田", "CRUX クラックス大阪"];
    const response = await communityRoutes.request(
      "/profile",
      {
        method: "PUT",
        headers,
        body: JSON.stringify(
          profileInput({
            residence: "大阪市",
            age: 32,
            homeGyms,
            japaneseClimbingLevel: "2級",
            vClimbingLevel: "V5",
          }),
        ),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: {
        residence: "大阪市",
        age: 32,
        homeGym: homeGyms[0],
        homeGyms,
        climbingLevel: "2級",
        japaneseClimbingLevel: "2級",
        vClimbingLevel: "V5",
      },
    });
    const insertIndex = statements.findIndex((sql) =>
      sql.includes("INSERT INTO community_profile"),
    );
    expect(boundValues[insertIndex]).toContain(JSON.stringify(homeGyms));
    expect(boundValues[insertIndex]).toContain(32);
  });

  it("keeps age and residence optional and accepts the legacy single gym field", async () => {
    const { env } = makeEnv();
    const response = await communityRoutes.request(
      "/profile",
      {
        method: "PUT",
        headers,
        body: JSON.stringify(profileInput({ homeGym: "旧登録ジム", climbingLevel: "V6" })),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: {
        residence: "",
        age: null,
        homeGym: "旧登録ジム",
        homeGyms: ["旧登録ジム"],
        climbingLevel: "V6",
        japaneseClimbingLevel: "",
        vClimbingLevel: "V6",
      },
    });
  });

  it("rejects ages outside the supported range", async () => {
    const { env, statements } = makeEnv();
    const response = await communityRoutes.request(
      "/profile",
      {
        method: "PUT",
        headers,
        body: JSON.stringify(profileInput({ age: 121 })),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("INSERT INTO community_profile"))).toBe(false);
  });

  it("rejects a grade from the wrong scale", async () => {
    const { env, statements } = makeEnv();
    const response = await communityRoutes.request(
      "/profile",
      {
        method: "PUT",
        headers,
        body: JSON.stringify(profileInput({ japaneseClimbingLevel: "V5", vClimbingLevel: "2級" })),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes("INSERT INTO community_profile"))).toBe(false);
  });
});
