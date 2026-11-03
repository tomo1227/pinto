// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AuthBindings } from "../../../worker/src/auth";
import { gymRequestRoutes } from "../../../worker/src/routes/gym-requests";

vi.mock("../../../worker/src/auth", () => ({
  createAuth: () => ({
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "admin-1", email: "admin@example.com" },
      }),
    },
  }),
}));

function makeEnv() {
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
  const bind = vi.fn().mockReturnValue({ run });
  const all = vi.fn().mockResolvedValue({ results: [] });
  const prepare = vi.fn().mockReturnValue({ bind, all });
  const env = {
    DB: { prepare },
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://pinto.test",
    GYM_ADMIN_EMAILS: "admin@example.com",
  } as unknown as AuthBindings;
  return { env, prepare, bind, run };
}

describe("gym registration requests", () => {
  it("stores a validated request without a review status", async () => {
    const { env, prepare, bind, run } = makeEnv();
    const response = await gymRequestRoutes.request(
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefectureCode: "JP-27",
          gymName: "New Climbing Gym",
          address: "Osaka",
          phone: "06-1234-5678",
          website: "https://example.com",
          message: "Please add this gym",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requestId: expect.any(String) });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("message, createdAt)"));
    expect(bind).toHaveBeenCalledWith(
      expect.any(String),
      "JP-27",
      "New Climbing Gym",
      "Osaka",
      "06-1234-5678",
      "https://example.com",
      "Please add this gym",
      expect.any(Number),
    );
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects invalid prefectures and websites without writing", async () => {
    const { env, prepare } = makeEnv();
    const invalidPrefecture = await gymRequestRoutes.request(
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefectureCode: "JP-99",
          gymName: "Invalid Gym",
          website: "javascript:alert(1)",
        }),
      },
      env,
    );

    expect(invalidPrefecture.status).toBe(400);

    const invalidWebsite = await gymRequestRoutes.request(
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefectureCode: "JP-27",
          gymName: "Invalid Gym",
          website: "javascript:alert(1)",
        }),
      },
      env,
    );

    expect(invalidWebsite.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("lists requests only for configured admins", async () => {
    const { env, prepare } = makeEnv();
    const response = await gymRequestRoutes.request("/", {}, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [] });
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("FROM gym_registration_request"));

    const denied = await gymRequestRoutes.request("/", {}, {
      ...env,
      GYM_ADMIN_EMAILS: "other@example.com",
    } as AuthBindings);
    expect(denied.status).toBe(403);
  });

  it("deletes a request through the admin endpoint", async () => {
    const { env, prepare, bind, run } = makeEnv();
    const response = await gymRequestRoutes.request(
      "/request-1",
      {
        method: "DELETE",
        headers: { Origin: "https://pinto.test" },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(prepare).toHaveBeenCalledWith("DELETE FROM gym_registration_request WHERE id = ?");
    expect(bind).toHaveBeenCalledWith("request-1");
    expect(run).toHaveBeenCalledOnce();
  });
});
