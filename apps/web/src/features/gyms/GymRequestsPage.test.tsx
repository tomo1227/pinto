import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GymRequestsPage } from "./GymRequestsPage";

vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({ to, children }: { to: string; children: ReactNode }) =>
      createElement("a", { href: to }, children),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GymRequestsPage", () => {
  it("deletes a request from the admin list", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          requests: [
            {
              id: "request-1",
              prefectureCode: "JP-27",
              gymName: "新しいクライミングジム",
              address: "大阪市北区",
              phone: "",
              website: "",
              message: "",
              createdAt: Date.now(),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GymRequestsPage />);

    expect(await screen.findByRole("heading", { name: "新しいクライミングジム" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(await screen.findByRole("status")).toHaveTextContent("申請を削除しました");
    expect(screen.queryByRole("heading", { name: "新しいクライミングジム" })).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/gyms/requests/request-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
