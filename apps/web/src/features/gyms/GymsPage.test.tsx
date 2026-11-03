import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GymsPage } from "./GymsPage";

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

describe("GymsPage", () => {
  it("searches Google Maps with the selected gym", async () => {
    const user = userEvent.setup();
    render(<GymsPage />);

    await user.selectOptions(screen.getByLabelText("ジム"), "gravity-research-umeda");

    const mapsLink = screen.getByRole("link", { name: "Google Mapsで検索" });
    const searchUrl = new URL(mapsLink.getAttribute("href") ?? "");
    expect(searchUrl.origin).toBe("https://www.google.com");
    expect(searchUrl.pathname).toBe("/maps/search/");
    expect(searchUrl.searchParams.get("query")).toBe("グラビティリサーチ梅田 大阪府");
  });

  it("disables gym selection when the JSON has no gyms for a prefecture", async () => {
    const user = userEvent.setup();
    render(<GymsPage />);

    await user.selectOptions(screen.getByLabelText("地域"), "関東");
    await user.selectOptions(screen.getByLabelText("都道府県"), "JP-13");

    expect(screen.getByLabelText("ジム")).toBeDisabled();
    expect(screen.getByText("この都道府県の登録ジムはありません。")).toBeInTheDocument();
  });

  it("submits a gym registration request and shows the pending confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ requestId: "request-1" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GymsPage />);

    await user.click(screen.getByRole("button", { name: "ジムの登録を申請" }));
    await user.type(screen.getByLabelText("ジム名"), "新しいクライミングジム");
    await user.type(screen.getByLabelText("住所（任意）"), "大阪市北区");
    await user.click(screen.getByRole("button", { name: "登録申請を送信" }));

    expect(await screen.findByRole("status")).toHaveTextContent("登録申請を受け付けました");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gyms/requests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prefectureCode: "JP-27",
          gymName: "新しいクライミングジム",
          address: "大阪市北区",
          phone: "",
          website: "",
          message: "",
        }),
      }),
    );
  });
});
