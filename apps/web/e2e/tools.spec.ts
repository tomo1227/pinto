import { expect, test } from "@playwright/test";

for (const width of [1280, 375]) {
  test(`shows the tools tab next to gyms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
    await page.goto("/gyms");

    const navigation = page.getByRole("navigation", { name: "メインナビゲーション" });
    await expect(navigation.getByRole("link")).toHaveText([
      "壁とルート",
      "クライマー",
      "ジム",
      "ツール",
    ]);
    const tools = navigation.getByRole("link", { name: "ツール", exact: true });
    await expect(tools).toBeInViewport();
    await tools.click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(tools).toHaveClass("is-active");
    await expect(page.getByRole("heading", { name: "ツールは準備中です" })).toBeVisible();
    await expect
      .poll(() =>
        page.getByText("CLIMBING TOOLS", { exact: true }).evaluate((element) => {
          const header = document.querySelector(".app-header");
          if (!header) throw new Error("App header not found");
          return element.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        }),
      )
      .toBeGreaterThanOrEqual(width > 700 ? 58 : 38);
    await expect(navigation.getByRole("link", { name: "ジム", exact: true })).not.toHaveClass(
      "is-active",
    );

    await page.reload();
    await expect(page.getByRole("heading", { name: "Tools", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/gyms$/);
    await expect(navigation.getByRole("link", { name: "ジム", exact: true })).toHaveClass(
      "is-active",
    );
    await page.goForward();
    await expect(page.getByRole("heading", { name: "ツールは準備中です" })).toBeVisible();
  });
}
