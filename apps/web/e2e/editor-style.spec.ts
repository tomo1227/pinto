import type { Hold, Route, Wall } from "@pinto/shared";
import { expect, type Page, test } from "@playwright/test";

async function readStyles(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ hold: Hold; route: Route; wall: Wall }>((resolve, reject) => {
        const request = indexedDB.open("pinto-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(["holds", "routes", "walls"]);
          const hold = transaction.objectStore("holds").get("style-hold");
          const route = transaction.objectStore("routes").get("style-route");
          const wall = transaction.objectStore("walls").get("style-wall");
          transaction.oncomplete = () => {
            resolve({ hold: hold.result, route: route.result, wall: wall.result });
            database.close();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

async function selectCanvasObject(page: Page, x: number, y: number) {
  const point = await page.locator("canvas.wall-canvas").evaluate(
    (canvas, position) => {
      const bounds = canvas.getBoundingClientRect();
      const size = Math.min(bounds.width, bounds.height);
      return {
        x: bounds.x + (bounds.width - size) / 2 + size * position.x,
        y: bounds.y + (bounds.height - size) / 2 + size * position.y,
      };
    },
    { x, y },
  );
  await page.mouse.click(point.x, point.y);
}

async function openTestEditor(page: Page) {
  await page.goto("/walls/style-wall");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some(
          (database) => database.name === "pinto-local" && database.version === 2,
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#2f7a68";
    context.fillRect(0, 0, 400, 400);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Test image could not be created"));
      }),
    );
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pinto-local");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ["walls", "images", "holds", "routes"],
          "readwrite",
        );
        const now = new Date().toISOString();
        transaction.objectStore("walls").put({
          id: "style-wall",
          name: "Style wall",
          imageId: "style-image",
          width: 400,
          height: 400,
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("images").put({
          id: "style-image",
          blob,
          mimeType: "image/png",
          width: 400,
          height: 400,
          size: blob.size,
          createdAt: now,
        });
        for (const [id, x] of [
          ["style-hold", 0.25],
          ["style-hold-2", 0.75],
        ] as const) {
          transaction.objectStore("holds").put({
            id,
            wallId: "style-wall",
            position: { x, y: 0.65 },
            markerRadius: 20,
            detectionSource: "manual",
            createdAt: now,
            updatedAt: now,
          });
        }
        transaction.objectStore("routes").put({
          id: "style-route",
          wallId: "style-wall",
          name: "Style route",
          author: "Existing setter",
          description: "Existing description",
          holdIds: ["style-hold", "style-hold-2"],
          startHoldIds: [],
          finishHoldIds: [],
          textAnnotations: [{ id: "style-text", text: "Font", position: { x: 0.25, y: 0.3 } }],
          source: "manual",
          createdAt: now,
          updatedAt: now,
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto("/walls/style-wall");
  await expect(page.locator("canvas.wall-canvas")).toBeVisible();
}

test("edits selected circle, text and line styles and persists them on desktop and mobile", async ({
  page,
}) => {
  await openTestEditor(page);
  await expect(page.locator(".wall-title")).toBeVisible();
  await expect(page.getByRole("button", { name: "壁名を変更" })).toHaveCount(0);
  await expect(page.locator("button.wall-title")).toHaveCount(0);
  await expect(page.getByLabel("見た目を変更する対象")).toHaveCount(0);
  await expect(page.getByLabel("丸の太さ")).toBeEnabled();
  await expect(page.getByLabel("文字のフォント")).toBeHidden();

  await selectCanvasObject(page, 0.25, 0.65);
  await page.getByLabel("丸の太さ").fill("8");
  await page.getByLabel("枠線の太さ").fill("3");
  await page.getByLabel("枠線の色").fill("#ffffff");
  await expect
    .poll(async () => (await readStyles(page)).hold)
    .toMatchObject({
      markerWidth: 8,
      outlineWidth: 3,
      outlineColor: "#ffffff",
    });
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => (await readStyles(page)).hold.outlineColor).toBeUndefined();
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect.poll(async () => (await readStyles(page)).hold.outlineColor).toBe("#ffffff");
  await page.getByLabel("丸の太さ").dblclick();
  await expect(page.getByLabel("丸の太さ")).toHaveValue("3");
  await page.getByLabel("丸の太さ").fill("8");
  await page.getByLabel("枠線の太さ").dblclick();
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("0");
  await page.getByLabel("枠線の太さ").fill("3");
  await page.getByLabel("枠線の色").dblclick();
  await expect(page.getByLabel("枠線の色")).toHaveValue("#fffefa");
  await page.getByLabel("枠線の色").fill("#ffffff");
  await expect
    .poll(async () => (await readStyles(page)).hold)
    .toMatchObject({ markerWidth: 8, outlineWidth: 3, outlineColor: "#ffffff" });

  await page.getByRole("button", { name: "文字を入力して配置" }).click();
  await expect(page.getByLabel("文字の太さ")).toBeEnabled();
  await expect(page.getByLabel("丸の太さ")).toHaveCount(0);
  await selectCanvasObject(page, 0.25, 0.3);
  await page.getByLabel("文字の太さ").selectOption("900");
  await page.getByLabel("文字のフォント").selectOption("serif");
  await page.getByLabel("枠線の太さ").fill("2");
  await page.getByLabel("文字の太さ").dblclick();
  await expect(page.getByLabel("文字の太さ")).toHaveValue("600");
  await page.getByLabel("文字の太さ").selectOption("900");
  await page.getByLabel("文字のフォント").dblclick();
  await expect(page.getByLabel("文字のフォント")).toHaveValue("sans-serif");
  await page.getByLabel("文字のフォント").selectOption("serif");
  await page.getByLabel("枠線の太さ").dblclick();
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("0");
  await page.getByLabel("枠線の太さ").fill("2");
  await page.getByLabel("枠線の色").dblclick();
  await expect(page.getByLabel("枠線の色")).toHaveValue("#fffefa");
  await page.getByLabel("枠線の色").fill("#ffffff");
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations?.[0])
    .toMatchObject({
      fontWeight: 900,
      fontFamily: "serif",
      outlineWidth: 2,
      outlineColor: "#ffffff",
    });
  await selectCanvasObject(page, 0.25, 0.3);
  await selectCanvasObject(page, 0.25, 0.3);
  const textInput = page.getByLabel("壁面に配置する文字");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect(textInput).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(textInput).toHaveCSS("background-image", "none");
    await expect(page.getByLabel("文字のフォント")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  await expect(textInput).toHaveCSS("font-family", "serif");
  await expect(textInput).toHaveCSS("font-weight", "900");
  await expect(textInput).toHaveCSS("-webkit-text-stroke-width", "4px");
  await textInput.fill("Updated");
  await textInput.press("Enter");
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations)
    .toEqual([
      expect.objectContaining({
        id: "style-text",
        text: "Updated",
        fontWeight: 900,
        fontFamily: "serif",
        outlineWidth: 2,
        outlineColor: "#ffffff",
      }),
    ]);

  await page.getByRole("button", { name: "ルートに追加" }).click();
  await expect(page.getByLabel("文字のフォント")).toBeHidden();
  await page.getByLabel("線の太さ", { exact: true }).fill("12");
  await page.getByLabel("枠線の太さ").fill("4");
  await page.getByLabel("枠線の色").fill("#ffffff");
  await page.getByLabel("線の太さ", { exact: true }).dblclick();
  await expect(page.getByLabel("線の太さ", { exact: true })).toHaveValue("4");
  await page.getByLabel("線の太さ", { exact: true }).fill("12");
  await page.getByLabel("枠線の太さ").dblclick();
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("2");
  await page.getByLabel("枠線の太さ").fill("4");
  await page.getByLabel("枠線の色").dblclick();
  await expect(page.getByLabel("枠線の色")).toHaveValue("#202522");
  await page.getByLabel("枠線の色").fill("#ffffff");
  await page
    .getByRole("group", { name: "選択中の色、または次に配置するホールド・文字の色" })
    .getByRole("button", { name: "赤", exact: true })
    .click();
  await expect
    .poll(async () => (await readStyles(page)).route)
    .toMatchObject({
      lineWidth: 12,
      lineOutlineWidth: 4,
      lineOutlineColor: "#ffffff",
      lineColor: "#E55050",
    });
  await page.getByRole("button", { name: "ホールド追加・移動" }).click();
  await selectCanvasObject(page, 0.25, 0.65);
  await expect(page.getByLabel("丸の太さ")).toHaveValue("8");
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("3");
  await expect(page.getByLabel("文字のフォント")).toBeHidden();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Style wallのPNGを保存" }).click();
  expect((await download).suggestedFilename()).toBe("Style wall.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("canvas.wall-canvas")).toBeVisible();
  await expect(page.locator(".editor-header .back-link")).toHaveAccessibleName("壁一覧に戻る");
  await expect(page.locator(".editor-header")).not.toContainText("Walls");
  await expect(page.locator(".editor-header .header-divider")).toHaveCount(0);
  await expect(page.locator(".editor-header")).toHaveCSS("min-height", "56px");
  await expect(page.locator(".editor-header")).toHaveCSS("gap", "2px");
  expect(
    await page
      .locator(".editor-header button:not(.editor-save)")
      .evaluateAll((buttons) =>
        buttons.every((button) => getComputedStyle(button).borderWidth === "0px"),
      ),
  ).toBe(true);
  await expect(page.locator(".editor-header .editor-save")).not.toHaveCSS("border-width", "0px");
  expect(
    await page
      .locator(
        ".editor-header > .icon-button, .editor-header > .editor-history-button, .editor-header > .editor-save",
      )
      .evaluateAll((buttons) =>
        buttons.every((button) => getComputedStyle(button).height === "34px"),
      ),
  ).toBe(true);
  const toolNav = page.getByRole("navigation", { name: "キャンバスツール" });
  await expect(toolNav).toBeVisible();
  await expect(toolNav).toHaveCSS("position", "fixed");
  await expect(toolNav).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(toolNav).toHaveCSS("box-shadow", "none");
  await expect(toolNav).toHaveCSS("backdrop-filter", "none");
  await expect(page.locator(".tool-segment")).toHaveCSS("gap", "0px");
  await expect(page.locator(".tool-segment")).toHaveCSS("padding", "0px");
  await expect(page.locator(".tool-segment")).toHaveCSS("border-radius", "0px");
  expect(
    await page
      .locator(".tool-segment > button")
      .evaluateAll((buttons) =>
        buttons.every((button) => getComputedStyle(button).borderRadius === "0px"),
      ),
  ).toBe(true);
  await expect(page.locator(".editor-toolbar")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".line-toggle > span")).toHaveCSS("border-width", "0px");
  await expect(page.locator(".selected-object-color")).toHaveCSS("border-width", "0px");
  await expect
    .poll(() =>
      page
        .locator(".selected-object-style__controls label")
        .evaluateAll((labels) =>
          labels.every((label) => getComputedStyle(label).borderWidth === "0px"),
        ),
    )
    .toBe(true);
  for (const label of [
    "画像を移動",
    "ホールド追加・移動",
    "ルートに追加",
    "文字を入力して配置",
    "ホールドを消去",
  ]) {
    await expect(toolNav.getByRole("button", { name: label })).toBeVisible();
  }
  const mobileNavBounds = await toolNav.boundingBox();
  const toolSegmentBounds = await page.locator(".tool-segment").boundingBox();
  const canvasBounds = await page.locator(".canvas-frame").boundingBox();
  const toolbarBounds = await page.locator(".editor-toolbar").boundingBox();
  const styleControlsBounds = await page.locator(".selected-object-style__controls").boundingBox();
  const footerBounds = await page.locator(".site-footer").boundingBox();
  if (
    !mobileNavBounds ||
    !toolSegmentBounds ||
    !canvasBounds ||
    !toolbarBounds ||
    !styleControlsBounds ||
    !footerBounds
  )
    throw new Error("Mobile editor controls are unavailable");
  expect(mobileNavBounds.y + mobileNavBounds.height).toBeCloseTo(844, 0);
  expect(toolSegmentBounds.x).toBeCloseTo(0, 0);
  expect(toolSegmentBounds.width).toBeCloseTo(390, 0);
  expect(toolSegmentBounds.y + toolSegmentBounds.height).toBeCloseTo(
    mobileNavBounds.y + mobileNavBounds.height,
    0,
  );
  expect(
    await page
      .locator(".tool-segment > button")
      .evaluateAll((buttons) =>
        buttons.every((button) => getComputedStyle(button).height === "60px"),
      ),
  ).toBe(true);
  expect(mobileNavBounds.y).toBeLessThan(footerBounds.y + footerBounds.height);
  expect(mobileNavBounds.y + mobileNavBounds.height).toBeGreaterThan(footerBounds.y);
  expect(canvasBounds.y + canvasBounds.height).toBeLessThanOrEqual(toolbarBounds.y);
  expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(mobileNavBounds.y);
  expect(toolbarBounds.x).toBeGreaterThanOrEqual(0);
  expect(toolbarBounds.x + toolbarBounds.width).toBeLessThanOrEqual(390);
  expect(styleControlsBounds.x).toBeGreaterThanOrEqual(toolbarBounds.x);
  expect(styleControlsBounds.x + styleControlsBounds.width).toBeLessThanOrEqual(
    toolbarBounds.x + toolbarBounds.width,
  );
  await page.getByRole("button", { name: "ルートに追加" }).click();
  await expect(page.getByLabel("線の太さ", { exact: true })).toHaveValue("12");
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("4");
  await expect(page.getByLabel("枠線の色")).toHaveValue("#ffffff");
  await page.getByRole("button", { name: "ホールド追加・移動" }).click();
  await selectCanvasObject(page, 0.25, 0.65);
  await expect(page.getByLabel("丸の太さ")).toHaveValue("8");
  await page.getByRole("button", { name: "文字を入力して配置" }).click();
  await selectCanvasObject(page, 0.25, 0.3);
  await expect(page.getByLabel("文字のフォント")).toHaveValue("serif");
  await expect(page.getByLabel("文字のフォント")).toHaveCSS("border-width", "0px");
  await expect(page.getByLabel("文字の太さ")).toHaveValue("900");
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("2");
  await page.getByLabel("文字のフォント").selectOption("monospace");
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations?.[0]?.fontFamily)
    .toBe("monospace");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("keeps editor toolbar height stable when switching to text mode", async ({ page }) => {
  await openTestEditor(page);
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const toolbar = page.locator(".editor-toolbar");
    const holdBounds = await toolbar.boundingBox();
    if (!holdBounds) throw new Error("Editor toolbar is unavailable");
    await page.getByRole("button", { name: "文字を入力して配置" }).click();
    const textBounds = await toolbar.boundingBox();
    if (!textBounds) throw new Error("Text toolbar is unavailable");
    expect(textBounds.height).toBeCloseTo(holdBounds.height, 0);
    await page.getByRole("button", { name: "ホールド追加・移動" }).click();
  }
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`edits creator and description in wall settings without a sidebar on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTestEditor(page);
    await expect(page.locator(".sidebar-content, .editor-sidebar, .mobile-editor-nav")).toHaveCount(
      0,
    );
    const layout = await page.locator(".editor-layout").boundingBox();
    const canvasColumn = await page.locator(".canvas-column").boundingBox();
    if (!layout || !canvasColumn) throw new Error("Editor layout is unavailable");
    expect(canvasColumn.width).toBeCloseTo(layout.width, 0);
    await expect(page.locator(".editor-layout")).toHaveCSS(
      "padding-bottom",
      viewport.name === "mobile" ? "60px" : "0px",
    );

    const settings = page.getByRole("form", { name: "壁の設定" });
    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByRole("switch", { name: "ホールド輪郭の自動検出" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(settings.getByRole("switch", { name: "楕円を許可" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(settings.getByLabel("作成者")).toHaveValue("Existing setter");
    await expect(settings.getByLabel("説明")).toHaveValue("Existing description");
    await expect(settings.getByLabel("作成者")).toHaveAttribute("maxlength", "80");
    await expect(settings.getByLabel("説明")).toHaveAttribute("maxlength", "500");
    await settings.getByLabel("作成者").fill("Discarded setter");
    await settings.getByLabel("説明").fill("Discarded description");
    await settings.getByRole("button", { name: "キャンセル" }).click();
    await expect(settings).toHaveCount(0);
    await expect.poll(async () => (await readStyles(page)).route.author).toBe("Existing setter");

    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByLabel("作成者")).toHaveValue("Existing setter");
    await expect(settings.getByLabel("説明")).toHaveValue("Existing description");
    await settings.getByLabel("壁の名前").fill("Settings wall");
    await settings.getByLabel("日本式グレード").selectOption("4級");
    await settings.getByLabel("作成者").fill("  New setter  ");
    await settings.getByLabel("説明").fill("  First line\nSecond line  ");
    await settings.getByRole("switch", { name: "ホールド輪郭の自動検出" }).click();
    await settings.getByRole("switch", { name: "楕円を許可" }).click();
    await settings.getByRole("button", { name: "設定を保存" }).click();
    await expect(settings).toHaveCount(0);
    await expect
      .poll(async () => (await readStyles(page)).route)
      .toMatchObject({
        author: "New setter",
        description: "First line\nSecond line",
      });
    await expect
      .poll(async () => (await readStyles(page)).wall)
      .toMatchObject({
        name: "Settings wall",
        japaneseGrade: "4級",
        autoDetectHolds: false,
        allowEllipses: false,
      });

    await page.reload();
    await expect(page.locator("canvas.wall-canvas")).toBeVisible();
    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByLabel("壁の名前")).toHaveValue("Settings wall");
    await expect(settings.getByLabel("日本式グレード")).toHaveValue("4級");
    await expect(settings.getByLabel("作成者")).toHaveValue("New setter");
    await expect(settings.getByLabel("説明")).toHaveValue("First line\nSecond line");
    await expect(settings.getByRole("switch", { name: "ホールド輪郭の自動検出" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(settings.getByRole("switch", { name: "楕円を許可" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await settings.getByRole("switch", { name: "ホールド輪郭の自動検出" }).click();
    await settings.getByRole("switch", { name: "楕円を許可" }).click();
    await settings.getByRole("button", { name: "設定を保存" }).click();
    await expect
      .poll(async () => (await readStyles(page)).wall)
      .toMatchObject({
        autoDetectHolds: true,
        allowEllipses: true,
      });
    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByRole("switch", { name: "ホールド輪郭の自動検出" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(settings.getByRole("switch", { name: "楕円を許可" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await settings.getByRole("button", { name: "キャンセル" }).click();
    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByLabel("作成者")).toHaveValue("New setter");
    await expect(settings.getByLabel("説明")).toHaveValue("First line\nSecond line");
    await settings.getByLabel("作成者").fill(" ");
    await settings.getByLabel("説明").fill("");
    await settings.getByRole("button", { name: "設定を保存" }).click();
    await expect(settings).toHaveCount(0);
    await expect.poll(async () => (await readStyles(page)).route.author).toBeUndefined();
    await expect.poll(async () => (await readStyles(page)).route.description).toBeUndefined();
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect.poll(async () => (await readStyles(page)).route.author).toBe("New setter");
    await page.getByRole("button", { name: "壁の設定", exact: true }).click();
    await expect(settings.getByLabel("作成者")).toHaveValue("New setter");
    await expect(settings.getByLabel("説明")).toHaveValue("First line\nSecond line");
    await settings.getByRole("button", { name: "閉じる" }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 320, height: 740 });
    const narrowToolbarBounds = await page.locator(".editor-toolbar").boundingBox();
    if (!narrowToolbarBounds) throw new Error("Narrow mobile toolbar is unavailable");
    expect(narrowToolbarBounds.x).toBeGreaterThanOrEqual(0);
    expect(narrowToolbarBounds.x + narrowToolbarBounds.width).toBeLessThanOrEqual(320);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test("configures and applies hold and text defaults without selecting an object", async ({
  page,
}) => {
  await openTestEditor(page);
  await expect(page.getByLabel("丸の太さ")).toBeEnabled();
  await expect(page.getByLabel("枠線の太さ")).toBeEnabled();
  await expect(page.getByLabel("枠線の色")).toBeEnabled();
  await page.getByLabel("丸の太さ").fill("7");
  await page.getByLabel("枠線の太さ").fill("4");
  await page.getByLabel("枠線の色").fill("#123456");
  await expect
    .poll(async () => (await readStyles(page)).wall.editorStyleDefaults)
    .toMatchObject({
      markerWidth: 7,
      holdOutlineWidth: 4,
      holdOutlineColor: "#123456",
    });

  await page.reload();
  await expect(page.locator("canvas.wall-canvas")).toBeVisible();
  await expect(page.getByLabel("丸の太さ")).toHaveValue("7");
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("4");
  await expect(page.getByLabel("枠線の色")).toHaveValue("#123456");
  await selectCanvasObject(page, 0.5, 0.5);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<Hold | undefined>((resolve, reject) => {
            const request = indexedDB.open("pinto-local");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("holds");
              const holds = transaction.objectStore("holds").getAll();
              transaction.oncomplete = () => {
                resolve(
                  holds.result.find(
                    (hold: Hold) =>
                      hold.markerWidth === 7 &&
                      hold.outlineWidth === 4 &&
                      hold.outlineColor === "#123456",
                  ),
                );
                database.close();
              };
              transaction.onerror = () => reject(transaction.error);
            };
          }),
      ),
    )
    .toBeTruthy();
  await page.getByLabel("丸の太さ").fill("9");
  await page.getByLabel("枠線の太さ").fill("5");
  await page.getByLabel("枠線の色").fill("#765432");
  await selectCanvasObject(page, 0.5, 0.4);
  await expect(page.getByLabel("丸の太さ")).toHaveValue("9");
  await expect(page.getByLabel("枠線の太さ")).toHaveValue("5");
  await expect(page.getByLabel("枠線の色")).toHaveValue("#765432");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open("pinto-local");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("holds");
              const holds = transaction.objectStore("holds").getAll();
              transaction.oncomplete = () => {
                resolve(
                  holds.result.some(
                    (hold: Hold) =>
                      hold.markerWidth === 9 &&
                      hold.outlineWidth === 5 &&
                      hold.outlineColor === "#765432",
                  ),
                );
                database.close();
              };
              transaction.onerror = () => reject(transaction.error);
            };
          }),
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "文字を入力して配置" }).click();
  await expect(page.getByLabel("文字の太さ")).toBeEnabled();
  await expect(page.getByLabel("文字のフォント")).toBeEnabled();
  await page.getByLabel("文字の太さ").selectOption("700");
  await page.getByLabel("文字のフォント").selectOption("serif");
  await page.getByLabel("枠線の太さ").fill("2");
  await page.getByLabel("枠線の色").fill("#654321");
  await expect
    .poll(async () => (await readStyles(page)).wall.editorStyleDefaults)
    .toMatchObject({
      textFontWeight: 700,
      textFontFamily: "serif",
      textOutlineWidth: 2,
      textOutlineColor: "#654321",
    });
  await selectCanvasObject(page, 0.5, 0.25);
  const textInput = page.getByLabel("壁面に配置する文字");
  await textInput.fill("Default style");
  await textInput.press("Enter");
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations)
    .toContainEqual(
      expect.objectContaining({
        text: "Default style",
        fontWeight: 700,
        fontFamily: "serif",
        outlineWidth: 2,
        outlineColor: "#654321",
      }),
    );
  await page.getByLabel("文字の太さ").selectOption("900");
  await page.getByLabel("文字のフォント").selectOption("monospace");
  await page.getByLabel("枠線の太さ").fill("3");
  await page.getByLabel("枠線の色").fill("#987654");
  await selectCanvasObject(page, 0.7, 0.25);
  await page.getByLabel("壁面に配置する文字").fill("Next style");
  await page.getByLabel("壁面に配置する文字").press("Enter");
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations)
    .toContainEqual(
      expect.objectContaining({
        text: "Next style",
        fontWeight: 900,
        fontFamily: "monospace",
        outlineWidth: 3,
        outlineColor: "#987654",
      }),
    );
});
