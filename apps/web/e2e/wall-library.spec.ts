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

test("closes the mobile editor panel with a downward swipe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#2f7a68";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "壁を追加" }).click();
  await page.getByLabel("壁の写真").setInputFiles({
    name: "mobile-panel.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("Mobile panel");
  await page.getByRole("button", { name: "壁を作成" }).click();
  await expect(page).toHaveURL(/\/walls\//);

  const editorSidebar = page.locator("#editor-sidebar-panel");
  await page.getByRole("button", { name: "ホールド", exact: true }).click();
  await expect(editorSidebar).toHaveClass(/is-open/);
  await expect(editorSidebar).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  const panelHeading = page.locator(".mobile-editor-panel-heading");
  const panelHeadingBounds = await panelHeading.boundingBox();
  if (!panelHeadingBounds) throw new Error("Mobile editor panel heading is unavailable");
  const dragStartX = panelHeadingBounds.x + panelHeadingBounds.width / 2;
  const dragStartY = panelHeadingBounds.y + panelHeadingBounds.height / 2;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX, dragStartY + 120, { steps: 4 });
  await expect(editorSidebar).toHaveAttribute("style", /translateY\(120px\)/);
  await page.mouse.up();
  await expect(editorSidebar).not.toHaveClass(/is-open/);
});

test("serves the local Worker API through the development proxy", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5173/api/hello");
  expect(response.ok()).toBeTruthy();
});

test("reopens selected route text for editing instead of duplicating it", async ({ page }) => {
  await page.goto("/");
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#2f7a68";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "壁を追加" }).click();
  await page.getByLabel("壁の写真").setInputFiles({
    name: "text-wall.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("Text editing wall");
  await page.getByRole("button", { name: "壁を作成" }).click();
  await page.getByRole("button", { name: "ルートを作成" }).click();
  await page.locator(".modal-panel").getByLabel("ルート名").fill("Text editing route");
  await page.locator(".modal-panel").getByRole("button", { name: "ルートを作成" }).click();
  await page.getByRole("button", { name: "文字を入力して配置" }).click();

  const canvas = page.locator("canvas.wall-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Wall canvas is unavailable");
  const textPoint = { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.3 };
  const otherPoint = { x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height * 0.7 };
  const textInput = page.getByLabel("壁面に配置する文字");
  const readTextAnnotations = () =>
    page.evaluate(
      () =>
        new Promise<{ fontScale?: number }[]>((resolve, reject) => {
          const request = indexedDB.open("pinto-local", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("routes", "readonly");
            const routesRequest = transaction.objectStore("routes").getAll();
            routesRequest.onerror = () => reject(routesRequest.error);
            routesRequest.onsuccess = () => {
              const route = routesRequest.result.find(
                (item) => item.name === "Text editing route",
              );
              resolve(route?.textAnnotations ?? []);
              database.close();
            };
          };
        }),
    );

  await page.mouse.click(textPoint.x, textPoint.y);
  await expect(textInput).toBeFocused();
  const expectedFontSize = await canvas.evaluate((element) => {
    const scale = Math.min(element.clientWidth / 400, element.clientHeight / 400);
    return Math.max(14, 24 * scale);
  });
  const actualFontSize = await textInput.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(actualFontSize).toBeCloseTo(expectedFontSize, 2);
  await expect(textInput).toHaveCSS("-webkit-text-stroke-width", "0px");
  await textInput.fill("Original");
  await page.mouse.click(otherPoint.x, otherPoint.y);
  await expect(textInput).toBeFocused();
  await page.keyboard.type("Next");
  await expect(textInput).toHaveValue("Next");
  await page.keyboard.press("Escape");

  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await expect(textInput).toHaveValue("Original");
  await textInput.press("End");
  await page.keyboard.type("!");
  await expect(textInput).toHaveValue("Original!");
  await page.keyboard.press("Backspace");
  await expect(textInput).toHaveValue("Original");
  await textInput.fill("Updated");
  await page.mouse.click(otherPoint.x, otherPoint.y);
  await page.keyboard.press("Escape");

  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await expect(textInput).toHaveValue("Updated");
  await textInput.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open("pinto-local", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("routes", "readonly");
              const routesRequest = transaction.objectStore("routes").getAll();
              routesRequest.onerror = () => reject(routesRequest.error);
              routesRequest.onsuccess = () => {
                const route = routesRequest.result.find(
                  (item) => item.name === "Text editing route",
                );
                resolve(route?.textAnnotations?.length ?? 0);
                database.close();
              };
            };
          }),
      ),
    )
    .toBe(1);

  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await expect(textInput).toHaveValue("Updated");
  await page.keyboard.press("Escape");
  const resizeStart = await canvas.evaluate(
    (element, anchor) => {
      const fontSize = Math.max(
        14,
        24 * Math.min(element.clientWidth / 400, element.clientHeight / 400),
      );
      const textWidth = Math.max(fontSize, Array.from("Updated").length * fontSize * 0.7);
      return { x: anchor.x + textWidth + 4, y: anchor.y + fontSize / 2 + 3 };
    },
    textPoint,
  );
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x + 30, resizeStart.y + 30, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await readTextAnnotations())[0]?.fontScale ?? 1).toBeGreaterThan(1);
  const desktopFontScale = (await readTextAnnotations())[0]?.fontScale ?? 1;

  const pinchPoints = await canvas.evaluate(
    (element, { anchor, fontScale }) => {
      const fontSize =
        Math.max(14, 24 * Math.min(element.clientWidth / 400, element.clientHeight / 400)) *
        fontScale;
      const textWidth = Math.max(fontSize, Array.from("Updated").length * fontSize * 0.7);
      return [
        { x: anchor.x + 5, y: anchor.y },
        { x: anchor.x + textWidth * 0.7, y: anchor.y },
        { x: anchor.x + textWidth * 1.05, y: anchor.y },
      ];
    },
    { anchor: textPoint, fontScale: desktopFontScale },
  );
  await page.evaluate((points) => {
    const canvas = document.querySelector("canvas.wall-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Wall canvas is unavailable");
    canvas.setPointerCapture = () => {};
    const dispatch = (type: string, pointerId: number, point: { x: number; y: number }) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId,
          pointerType: "touch",
          clientX: point.x,
          clientY: point.y,
          button: 0,
        }),
      );
    dispatch("pointerdown", 51, points[0]);
    dispatch("pointerdown", 52, points[1]);
    dispatch("pointermove", 52, points[2]);
    dispatch("pointerup", 52, points[2]);
    dispatch("pointerup", 51, points[0]);
  }, pinchPoints);
  await expect
    .poll(async () => (await readTextAnnotations())[0]?.fontScale ?? 1)
    .toBeGreaterThan(desktopFontScale);

  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await page.mouse.click(textPoint.x + 2, textPoint.y);
  await expect(textInput).toHaveValue("Updated");
  await textInput.press("Control+A");
  await textInput.press("Backspace");
  await expect(textInput).toHaveValue("");
  await textInput.press("Enter");
  await expect(textInput).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open("pinto-local", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("routes", "readonly");
              const routesRequest = transaction.objectStore("routes").getAll();
              routesRequest.onerror = () => reject(routesRequest.error);
              routesRequest.onsuccess = () => {
                const route = routesRequest.result.find(
                  (item) => item.name === "Text editing route",
                );
                resolve(route?.textAnnotations?.length ?? 0);
                database.close();
              };
            };
          }),
      ),
    )
    .toBe(0);
});
