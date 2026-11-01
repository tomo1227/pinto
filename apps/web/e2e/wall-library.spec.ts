import { expect, test } from "@playwright/test";

test("creates a wall locally and keeps it after reload", async ({ page }) => {
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
});

test("serves the local Worker API through the development proxy", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5173/api/hello");
  expect(response.ok()).toBeTruthy();
});
