import { expect, test } from "@playwright/test";

test("deletes holds by keyboard and touch drag", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.shareCount = String(
          Number(document.documentElement.dataset.shareCount ?? "0") + 1,
        );
        document.documentElement.dataset.sharedUrl = data.url ?? "";
        document.documentElement.dataset.sharedFile = data.files?.[0]?.name ?? "";
        document.documentElement.dataset.sharedType = data.files?.[0]?.type ?? "";
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Walls & routes" })).toBeVisible();
  await page.getByRole("button", { name: "リスト表示" }).click();
  await expect(page.getByRole("button", { name: "リスト表示" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "グリッド表示" }).click();
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#2f7a68";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "壁を追加" }).click();
  await page.getByLabel("壁の写真").setInputFiles({
    name: "wall.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("E2E wall");
  await page.getByRole("button", { name: "壁を作成" }).click();
  await expect(page).toHaveURL(/\/walls\//);
  await expect(page.getByRole("button", { name: /E2E wall/ })).toBeVisible();
  await page.getByRole("button", { name: "壁のリンクを共有" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-shared-url", /\/walls\//);
  await page.reload();
  await expect(page.getByRole("button", { name: /E2E wall/ })).toBeVisible();

  const canvas = page.locator("canvas.wall-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Wall canvas is unavailable");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator(".canvas-caption span").nth(1)).toHaveText("1 HOLDS");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.press("Delete");
  await expect(page.locator(".canvas-caption span").nth(1)).toHaveText("0 HOLDS");

  await page.evaluate(() => {
    const canvas = document.querySelector("canvas.wall-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Wall canvas is unavailable");
    canvas.setPointerCapture = () => {};
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    for (const type of ["pointerdown", "pointerup"]) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 42,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          button: 0,
        }),
      );
    }
  });
  await expect(page.locator(".canvas-caption span").nth(1)).toHaveText("1 HOLDS");

  await page.evaluate(() => {
    const canvas = document.querySelector("canvas.wall-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Wall canvas is unavailable");
    canvas.setPointerCapture = () => {};
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    for (const [type, clientX, clientY] of [
      ["pointerdown", x, y],
      ["pointermove", x + 8, y + 8],
    ] as const) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 43,
          pointerType: "touch",
          clientX,
          clientY,
          button: 0,
        }),
      );
    }
  });
  const trashTarget = page.locator(".canvas-touch-delete-target");
  await expect(trashTarget).toBeVisible();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas.wall-canvas");
    const target = document.querySelector(".canvas-touch-delete-target");
    if (!(canvas instanceof HTMLCanvasElement) || !(target instanceof HTMLElement))
      throw new Error("Touch delete target is unavailable");
    const bounds = target.getBoundingClientRect();
    const clientX = bounds.left + bounds.width / 2;
    const clientY = bounds.top + bounds.height / 2;
    for (const type of ["pointermove", "pointerup"]) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 43,
          pointerType: "touch",
          clientX,
          clientY,
          button: 0,
        }),
      );
    }
  });
  await expect(page.locator(".canvas-caption span").nth(1)).toHaveText("0 HOLDS");

  await page.getByRole("button", { name: "ルートを作成" }).click();
  await page.locator(".modal-panel").getByLabel("ルート名").fill("E2E route");
  await page.locator(".modal-panel").getByLabel("日本式グレード").selectOption("3級");
  await page.locator(".modal-panel").getByLabel("Vグレード").selectOption("V4");
  await page.locator(".modal-panel").getByRole("button", { name: "ルートを作成" }).click();
  await expect(
    page.locator(".route-card__name small").filter({ hasText: "3級 · V4" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ルートを作成" }).click();
  await page.locator(".modal-panel").getByLabel("ルート名").fill("E2E route 2");
  await page.locator(".modal-panel").getByRole("button", { name: "ルートを作成" }).click();
  await page.getByLabel("作成者").fill("E2E setter");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByLabel("作成者")).toHaveValue("E2E setter");

  await expect(page.getByRole("button", { name: "E2E routeを複製" })).toBeVisible();
  await expect(page.getByRole("button", { name: "E2E routeを削除" })).toBeVisible();

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "E2E routeのPNGを保存" }).click();
  expect((await pngDownload).suggestedFilename()).toBe("E2E route.png");
  await page.getByRole("button", { name: "E2E routeを共有" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-share-count", "1");
  await expect(page.locator("html")).toHaveAttribute("data-shared-file", "E2E route.png");
  await expect(page.getByRole("button", { name: "E2E routeをDiscordに共有" })).toBeVisible();

  const routeActionLabels = page.locator(".route-card__tool span");
  await expect(routeActionLabels).toHaveCount(6);
  for (const label of await routeActionLabels.all()) await expect(label).toBeHidden();
  await expect(page.locator(".wall-link-share span")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".wall-link-share span")).toBeHidden();
  for (const label of await routeActionLabels.all()) await expect(label).toBeHidden();
});

test("serves the local Worker API through the development proxy", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5173/api/hello");
  expect(response.ok()).toBeTruthy();
});
