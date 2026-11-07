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
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.goto("/tools/crux");

  await page.locator('input[type="file"][accept="video/*,.mov"]').setInputFiles({
    name: "climb.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test video"),
  });
  const video = page.locator(".crux-library__select").filter({ hasText: "climb.mp4" });
  await expect(video).toBeVisible();
  await page.locator('input[type="file"][accept="video/*,.mov"]').setInputFiles({
    name: "comparison.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("comparison video"),
  });
  await page.getByLabel("比較する動画").selectOption({ label: "comparison.mp4" });
  const primaryStart = page.getByLabel("climb.mp4の開始位置");
  const comparisonStart = page.getByLabel("comparison.mp4の開始位置");
  await expect(primaryStart).toBeVisible();
  await expect(comparisonStart).toBeVisible();
  const primaryPlayer = page.locator(".crux-player").nth(0);
  const comparisonPlayer = page.locator(".crux-player").nth(1);
  const primaryBox = await primaryPlayer.boundingBox();
  const comparisonBox = await comparisonPlayer.boundingBox();
  const primaryScreen = await primaryPlayer.locator(".crux-player__screen").boundingBox();
  const primarySliderBox = await primaryStart.boundingBox();
  const comparisonScreen = await comparisonPlayer.locator(".crux-player__screen").boundingBox();
  const comparisonSliderBox = await comparisonStart.boundingBox();
  if (
    !primaryBox ||
    !comparisonBox ||
    !primaryScreen ||
    !primarySliderBox ||
    !comparisonScreen ||
    !comparisonSliderBox
  ) {
    throw new Error("Comparison videos and start sliders should have visible layout boxes.");
  }
  expect(comparisonBox.x).toBeGreaterThan(primaryBox.x);
  expect(comparisonBox.y).toBe(primaryBox.y);
  expect(primarySliderBox.y).toBeGreaterThan(primaryScreen.y + primaryScreen.height);
  expect(comparisonSliderBox.y).toBeGreaterThan(comparisonScreen.y + comparisonScreen.height);

  const displaySettings = page.locator(".crux-display-settings");
  await displaySettings.locator("summary").first().click();
  await page.getByLabel("背景動画").uncheck();
  await page.getByLabel("骨格の線").uncheck();
  await page.getByLabel("頭部", { exact: true }).uncheck();
  const leftArmSettings = page.locator(".crux-display-settings__joint-group").nth(2);
  await leftArmSettings.locator("details summary").click();
  await leftArmSettings.getByLabel("左肘").uncheck();
  const lineOpacity = page.getByLabel("骨格線の透過度");
  await lineOpacity.focus();
  await lineOpacity.press("ArrowLeft");
  const jointColor = page.getByLabel("関節の色");
  await jointColor.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, "#123456");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(jointColor).toHaveValue("#123456");

  await page.reload();
  await expect(
    page.locator(".crux-library__select").filter({ hasText: "climb.mp4" }),
  ).toBeVisible();
  await page.getByLabel("比較する動画").selectOption({ label: "climb.mp4" });
  await page.locator(".crux-display-settings").locator("summary").first().click();
  await expect(page.getByLabel("背景動画")).not.toBeChecked();
  await expect(page.getByLabel("骨格の線")).not.toBeChecked();
  await expect(page.getByLabel("頭部", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("胴体", { exact: true })).toBeChecked();
  const savedLeftArmSettings = page.locator(".crux-display-settings__joint-group").nth(2);
  await savedLeftArmSettings.locator("details summary").click();
  await expect(savedLeftArmSettings.getByLabel("左肘")).not.toBeChecked();
  await expect(savedLeftArmSettings.getByLabel("左手首")).toBeChecked();
  await expect(page.getByLabel("骨格線の透過度")).toHaveValue("99");
  await expect(page.getByLabel("関節の色")).toHaveValue("#123456");
  await expect(
    page.locator(".crux-library__select").filter({ hasText: "comparison.mp4" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "climb.mp4を削除" }).click();
  await page.getByRole("button", { name: "comparison.mp4を削除" }).click();
  await expect(page.locator(".crux-library__select").filter({ hasText: "climb.mp4" })).toHaveCount(
    0,
  );
});
