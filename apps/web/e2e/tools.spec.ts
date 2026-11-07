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
    await page.getByRole("link", { name: /Crux/ }).click();
    await expect(page).toHaveURL(/\/tools\/crux$/);
    await expect(page.getByRole("heading", { name: "Crux", exact: true })).toBeVisible();
    await expect(page.getByText("動画を選んで解析")).toBeVisible();
    await expect(page.getByText(/胴体中心は2Dの目安で、実際の重心ではありません/)).toBeVisible();
    await expect(navigation.getByRole("link", { name: "ツール", exact: true })).toHaveClass(
      "is-active",
    );
    await page.getByRole("link", { name: "ツール一覧" }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/tools\/crux$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/tools$/);
  });
}

test("stores uploaded Crux videos in the browser library", async ({ page }) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.goto("/tools/crux");

  await page.locator('input[type="file"][accept="video/*,.mov"]').setInputFiles({
    name: "climb.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test video"),
  });
  const video = page.locator(".crux-library__select").filter({ hasText: "climb.mp4" });
  await expect(video).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".crux-library__select").filter({ hasText: "climb.mp4" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "climb.mp4を削除" }).click();
  await expect(page.locator(".crux-library__select").filter({ hasText: "climb.mp4" })).toHaveCount(
    0,
  );
});
