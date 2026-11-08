import { readFile } from "node:fs/promises";
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

async function openTestEditor(page: Page, imageSize = 400) {
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
  await page.evaluate(async (size) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#2f7a68";
    context.fillRect(0, 0, size, size);
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
          width: size,
          height: size,
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("images").put({
          id: "style-image",
          blob,
          mimeType: "image/png",
          width: size,
          height: size,
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
            markerRadius: size / 20,
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
          textAnnotations: [{ id: "style-text", text: "Crux", position: { x: 0.25, y: 0.3 } }],
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
  }, imageSize);
  await page.goto("/walls/style-wall");
  await expect(page.locator("canvas.wall-canvas")).toBeVisible();
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`preserves annotation thickness and bottom text in a high-resolution PNG at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openTestEditor(page, 2400);
    await selectCanvasObject(page, 0.25, 0.65);
    await page.getByLabel("丸の太さ").fill("8");
    await page.getByRole("button", { name: "ルートに追加" }).click();
    await page.getByLabel("線の太さ", { exact: true }).fill("12");
    await page.getByRole("button", { name: "文字を入力して配置" }).click();
    await selectCanvasObject(page, 0.25, 0.95);
    await page.getByLabel("壁面に配置する文字").fill("下端の文字");
    await page.getByLabel("壁面に配置する文字").press("Enter");
    await expect.poll(async () => (await readStyles(page)).route.textAnnotations?.length).toBe(2);

    const editorPixels = await page.locator("canvas.wall-canvas").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const ratio = element.width / bounds.width;
      const size = Math.min(bounds.width, bounds.height) * ratio;
      const canvas = document.createElement("canvas");
      const sampleSize = Math.floor(Math.min(bounds.width, bounds.height));
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(
        element,
        (element.width - size) / 2,
        (element.height - size) / 2,
        size,
        size,
        0,
        0,
        sampleSize,
        sampleSize,
      );
      return { src: canvas.toDataURL(), size: sampleSize };
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Style wallのPNGを保存" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error("Downloaded PNG is unavailable");
    const pngSrc = `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
    const samples = await page.evaluate(
      async ({ editorSrc, pngSrc, sampleSize }) => {
        const regions = [
          { x: 0.45, y: 0.55, width: 0.1, height: 0.2, yellow: true },
          { x: 0.18, y: 0.58, width: 0.14, height: 0.14, yellow: false },
          { x: 0.24, y: 0.24, width: 0.5, height: 0.12, yellow: false },
          { x: 0.24, y: 0.9, width: 0.6, height: 0.1, yellow: false },
        ];
        async function countPixels(src: string, imageHeight?: number) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = sampleSize;
          canvas.height = sampleSize;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is unavailable");
          context.drawImage(
            image,
            0,
            0,
            image.naturalWidth,
            imageHeight ?? image.naturalHeight,
            0,
            0,
            sampleSize,
            sampleSize,
          );
          return regions.map((region) => {
            const pixels = context.getImageData(
              region.x * sampleSize,
              region.y * sampleSize,
              region.width * sampleSize,
              region.height * sampleSize,
            ).data;
            let count = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              if (
                region.yellow
                  ? pixels[index] > 180 && pixels[index + 1] > 150 && pixels[index + 2] < 100
                  : pixels[index] < 70 && pixels[index + 1] < 70 && pixels[index + 2] < 70
              ) {
                count += 1;
              }
            }
            return count;
          });
        }
        const image = new Image();
        image.src = pngSrc;
        await image.decode();
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          editor: await countPixels(editorSrc),
          png: await countPixels(pngSrc, 2400),
        };
      },
      { editorSrc: editorPixels.src, pngSrc, sampleSize: editorPixels.size },
    );
    expect(samples.width).toBe(2400);
    expect(samples.height).toBe(2400);
    for (let index = 0; index < samples.editor.length; index += 1) {
      expect(samples.editor[index]).toBeGreaterThan(10);
      expect(samples.png[index]).toBeGreaterThan(10);
      if (index === 3) continue;
      expect(samples.png[index] / samples.editor[index], `region ${index}`).toBeGreaterThan(0.8);
      expect(samples.png[index] / samples.editor[index], `region ${index}`).toBeLessThan(1.2);
    }
  });
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
  await page.getByRole("button", { name: "投稿をプレビュー" }).click();
  const previewDialog = page.getByRole("dialog", { name: "投稿プレビュー" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.locator("img")).toHaveAttribute("src", /^blob:/);
  await previewDialog.getByRole("button", { name: "プレビューを閉じる" }).click();

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

test("saves the annotated route image to the shared wall post", async ({ page }) => {
  const now = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "viewer-session",
          userId: "viewer",
          token: "viewer-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
        user: {
          id: "viewer",
          name: "Viewer",
          email: "viewer@example.com",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  await page.route("**/api/community/profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: "viewer",
          handle: "viewer",
          username: "Viewer",
          bio: "",
          climbingLevel: "",
          japaneseClimbingLevel: "",
          vClimbingLevel: "",
          homeGym: "",
          homeGyms: [],
          residence: "",
          age: null,
          avatar: null,
          isPrivate: false,
          followerCount: 0,
          followingCount: 0,
        },
      },
    }),
  );

  let updatePayload: {
    image: string;
    routes: { id: string; name: string; grade: string }[];
  } | null = null;
  await page.route("**/api/community/posts/wall/style-wall", (route) =>
    route.fulfill({ json: { postId: "style-post" } }),
  );
  await page.route("**/api/community/posts/wall/style-wall/image", async (route) => {
    updatePayload = route.request().postDataJSON();
    await route.fulfill({ json: { updated: true, postId: "style-post" } });
  });
  await page.route("**/api/community/posts/style-post**", (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ json: { updated: true } });
    }
    return route.fulfill({
      json: {
        post: {
          id: "style-post",
          userId: "viewer",
          username: "Viewer",
          handle: "viewer",
          avatar: null,
          wallId: "style-wall",
          wallName: "Style wall",
          gymName: "",
          japaneseGrade: "",
          vGrade: "",
          author: "",
          description: "",
          routes: updatePayload?.routes ?? [],
          tags: { hold: [], move: [], type: [] },
          image: updatePayload?.image,
          createdAt: Date.now(),
          likeCount: 0,
          likedByMe: false,
          savedByMe: false,
        },
      },
    });
  });
  const remoteImage =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  await page.route("**/api/community/posts?**", (route) =>
    route.fulfill({
      json: {
        posts: [
          {
            id: "style-post",
            userId: "viewer",
            username: "Viewer",
            handle: "viewer",
            avatar: null,
            wallId: "style-wall",
            wallName: "Style wall",
            gymName: "",
            routes: [],
            tags: { hold: [], move: [], type: [] },
            image: remoteImage,
            createdAt: Date.now(),
            likeCount: 0,
            likedByMe: false,
            savedByMe: false,
          },
          {
            id: "other-post",
            userId: "other-user",
            username: "Other Climber",
            handle: "other-climber",
            avatar: null,
            wallId: "style-wall",
            wallName: "Other wall",
            gymName: "",
            routes: [],
            tags: { hold: [], move: [], type: [] },
            image: remoteImage,
            createdAt: Date.now(),
            likeCount: 0,
            likedByMe: false,
            savedByMe: false,
          },
        ],
        gyms: [],
        grades: [],
      },
    }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await openTestEditor(page, 2400);
  await page.getByRole("button", { name: "文字を入力して配置" }).click();
  await selectCanvasObject(page, 0.25, 0.95);
  await page.getByLabel("壁面に配置する文字").fill("下端の文字");
  await page.getByLabel("壁面に配置する文字").press("Enter");
  await expect.poll(async () => (await readStyles(page)).route.textAnnotations?.length).toBe(2);
  await selectCanvasObject(page, 0.25, 0.45);
  await page.getByLabel("壁面に配置する文字").fill("送信直前の文字");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Style wallのPNGを保存" }).click();
  const downloadPath = await (await downloadPromise).path();
  if (!downloadPath) throw new Error("Downloaded PNG is unavailable");
  const exportedPng = `data:image/png;base64,${(await readFile(downloadPath)).toString("base64")}`;
  await page.goto("/?post=style-post");
  const exportedDetailImage = page.locator(".wall-post-detail__image");
  await expect(exportedDetailImage).toHaveAttribute("src", /^blob:/);
  const displayedPng = await exportedDetailImage.evaluate(async (image) => {
    const blob = await (await fetch(image.src)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  });
  expect(displayedPng).toBe(exportedPng);
  expect(updatePayload).toBeNull();
  await page.goto("/");
  const feedImage = page.getByRole("img", { name: "Style wallの壁画像", exact: true });
  await expect(feedImage).toHaveAttribute("src", /^blob:/);
  const displayedFeedPng = await feedImage.evaluate(async (image) => {
    const blob = await (await fetch(image.src)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  });
  expect(displayedFeedPng).toBe(exportedPng);
  await expect(page.getByRole("img", { name: "Other wallの壁画像", exact: true })).toHaveAttribute(
    "src",
    remoteImage,
  );
  await page.getByRole("button", { name: "リスト表示", exact: true }).click();
  await expect(feedImage).toHaveAttribute("src", /^blob:/);
  await page.reload();
  await expect(feedImage).toHaveAttribute("src", /^blob:/);
  await page.getByRole("link", { name: "Style wallの投稿詳細を開く" }).click();
  await expect(page.locator(".wall-post-detail__image")).toHaveAttribute("src", /^blob:/);
  await page.reload();
  await expect(page.locator(".wall-post-detail__image")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("link", { name: "Style wallを編集" }).click();
  await expect(page.locator("canvas.wall-canvas")).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect.poll(() => updatePayload?.image).toMatch(/^data:image\/webp;base64,/);
  await expect(page).toHaveURL(/\/\?post=style-post$/);
  const detailImage = page.locator(".wall-post-detail__image");
  await expect(detailImage).toHaveAttribute("src", /^blob:/);
  const samples = await detailImage.evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0);
    const counts = [0.3, 0.45, 0.95].map((y) => {
      const pixels = context.getImageData(
        image.naturalWidth * 0.24,
        2400 * (y - 0.04),
        image.naturalWidth * 0.6,
        2400 * 0.08,
      ).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 70 && pixels[index + 1] < 70 && pixels[index + 2] < 70) count += 1;
      }
      return count;
    });
    return { width: image.naturalWidth, height: image.naturalHeight, counts };
  });
  expect(samples.width).toBe(2400);
  expect(samples.height).toBe(2400);
  for (const count of samples.counts) expect(count).toBeGreaterThan(10);
  await expect
    .poll(async () => (await readStyles(page)).route.textAnnotations?.at(-1)?.text)
    .toBe("送信直前の文字");
  expect(updatePayload?.routes).toEqual([
    { id: "style-route", name: "Style route", grade: "", description: "Existing description" },
  ]);
  await expect(page.getByText("投稿を保存しました。")).toBeVisible();
});

test("asks before leaving an unpublished wall and deletes it after confirmation", async ({
  page,
}) => {
  const now = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "viewer-session",
          userId: "viewer",
          token: "viewer-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
        user: {
          id: "viewer",
          name: "Viewer",
          email: "viewer@example.com",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  await page.route("**/api/community/profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: "viewer",
          handle: "viewer",
          username: "Viewer",
          bio: "",
          climbingLevel: "",
          japaneseClimbingLevel: "",
          vClimbingLevel: "",
          homeGym: "",
          homeGyms: [],
          residence: "",
          age: null,
          avatar: null,
          isPrivate: false,
          followerCount: 0,
          followingCount: 0,
        },
      },
    }),
  );
  await page.route("**/api/community/posts/wall/style-wall", (route) =>
    route.fulfill({ json: { postId: null } }),
  );

  await openTestEditor(page);
  await expect(page.getByRole("button", { name: "投稿", exact: true })).toBeEnabled();
  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  await page.getByRole("link", { name: "壁一覧に戻る" }).click();
  expect(await dialogPromise).toContain("まだ投稿されていません");
  await expect(page).toHaveURL("/");

  const wallRemains = await page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open("pinto-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("walls");
          const wall = transaction.objectStore("walls").get("style-wall");
          transaction.oncomplete = () => {
            resolve(Boolean(wall.result));
            database.close();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
  expect(wallRemains).toBe(false);
});

test("discards local edits to a published wall when leaving without saving", async ({ page }) => {
  const now = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "viewer-session",
          userId: "viewer",
          token: "viewer-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
        user: {
          id: "viewer",
          name: "Viewer",
          email: "viewer@example.com",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  await page.route("**/api/community/profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: "viewer",
          handle: "viewer",
          username: "Viewer",
          bio: "",
          climbingLevel: "",
          japaneseClimbingLevel: "",
          vClimbingLevel: "",
          homeGym: "",
          homeGyms: [],
          residence: "",
          age: null,
          avatar: null,
          isPrivate: false,
          followerCount: 0,
          followingCount: 0,
        },
      },
    }),
  );
  await page.route("**/api/community/posts/wall/style-wall", (route) =>
    route.fulfill({ json: { postId: "style-post" } }),
  );

  await openTestEditor(page);
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await selectCanvasObject(page, 0.25, 0.65);
  await page.getByLabel("丸の太さ").fill("8");
  await expect.poll(async () => (await readStyles(page)).hold.markerWidth).toBe(8);

  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    return message;
  });
  await page.getByRole("link", { name: "壁一覧に戻る" }).click();
  expect(await dialogPromise).toContain("編集が保存されていません");
  await expect(page).toHaveURL("/?post=style-post");
  expect((await readStyles(page)).hold.markerWidth).toBeUndefined();
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
