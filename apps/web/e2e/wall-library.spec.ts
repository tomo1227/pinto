import { expect, test } from "@playwright/test";

test("deletes holds by keyboard and touch drag", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Walls & routes" })).toBeVisible();
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
  await page.reload();
  await expect(page.getByRole("button", { name: /E2E wall/ })).toBeVisible();

  const canvas = page.locator("canvas.wall-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Wall canvas is unavailable");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator(".canvas-caption span").nth(1)).toHaveText("1 HOLDS");
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
});

test("serves the local Worker API through the development proxy", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5173/api/hello");
  expect(response.ok()).toBeTruthy();
});
