import { expect, type Page, test } from "@playwright/test";

async function authenticateAsE2eUser(page: Page) {
  const now = new Date().toISOString();
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "e2e-session",
          userId: "e2e-user",
          token: "e2e-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          createdAt: now,
          updatedAt: now,
        },
        user: {
          id: "e2e-user",
          name: "E2E Climber",
          email: "e2e@example.com",
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
          id: "e2e-user",
          handle: "e2e_climber",
          username: "E2E Climber",
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
}

async function selectTokyoGym(page: Page) {
  await page.getByLabel("都道府県で絞り込む").selectOption("JP-13");
  await page.getByLabel("ジム名で検索").fill("B-PUMP TOKYO");
  await page.getByLabel("ジム名を選択").selectOption({ label: "B-PUMP TOKYO 秋葉原" });
}

test("asks logged-out visitors to sign in before adding a wall", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "壁を追加" }).click();
  const prompt = page.getByRole("dialog", { name: "ログインが必要です" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText("壁を追加するにはログインしてください。")).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  await prompt.getByRole("button", { name: "キャンセル" }).click();
  await expect(prompt).toHaveCount(0);
});

test("filters favorite gyms by region and name in settings", async ({ page }) => {
  await authenticateAsE2eUser(page);
  await page.goto("/settings");
  const favoriteGyms = page.getByRole("group", { name: /よく行くジム/ });

  await favoriteGyms.getByLabel("都道府県で絞り込む").selectOption("JP-13");
  await favoriteGyms.getByLabel("ジム名で検索").fill("B-PUMP TOKYO");
  const gym = favoriteGyms.getByRole("checkbox", {
    name: "B-PUMP TOKYO 秋葉原",
    exact: true,
  });
  await gym.check();
  await favoriteGyms.getByLabel("ジム名で検索").fill("");
  await favoriteGyms.getByLabel("都道府県で絞り込む").selectOption("");

  await expect(gym).toBeChecked();
});

test("filters gyms by region and name when adding a wall", async ({ page }) => {
  await authenticateAsE2eUser(page);
  await page.route("**/api/community/posts/wall/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { postId: null } })
      : route.continue(),
  );
  await page.goto("/");
  let automaticPostCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/community/posts") {
      automaticPostCount += 1;
    }
  });
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
    name: "filtered-gym-wall.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("Filtered gym wall");
  await selectTokyoGym(page);
  await page.getByRole("button", { name: "壁を作成" }).click();

  expect(automaticPostCount).toBe(0);
  await expect(page.getByRole("button", { name: "投稿", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "壁の設定", exact: true }).click();
  const settings = page.getByRole("form", { name: "壁の設定" });
  await expect(settings.getByLabel("ジム名を選択")).toHaveValue("B-PUMP TOKYO 秋葉原");
});

test("publishes a newly created wall only after explicit submission", async ({ page }) => {
  await authenticateAsE2eUser(page);
  await page.route("**/api/community/posts/wall/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { postId: null } })
      : route.continue(),
  );
  let publishedPost: { wallId: string; image: string } | null = null;
  await page.route("**/api/community/posts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    publishedPost = route.request().postDataJSON();
    await route.fulfill({ json: { post: { id: "e2e-wall-post" } } });
  });
  await page.route("**/api/community/posts/e2e-wall-post", (route) =>
    route.fulfill({
      json: {
        post: {
          id: "e2e-wall-post",
          userId: "e2e-user",
          username: "E2E Climber",
          handle: "e2e_climber",
          avatar: null,
          wallId: publishedPost?.wallId ?? "",
          wallName: "Explicit post wall",
          gymName: "B-PUMP TOKYO 秋葉原",
          japaneseGrade: "",
          vGrade: "",
          author: "",
          description: "",
          routes: [],
          tags: { hold: [], move: [], type: [] },
          image: publishedPost?.image ?? "",
          createdAt: Date.now(),
          likeCount: 0,
          likedByMe: false,
          savedByMe: false,
        },
      },
    }),
  );
  await page.goto("/");
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
    name: "explicit-post-wall.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("Explicit post wall");
  await selectTokyoGym(page);
  await page.getByRole("button", { name: "壁を作成" }).click();

  const publishButton = page.getByRole("button", { name: "投稿", exact: true });
  await expect(publishButton).toBeEnabled();
  await expect(publishButton).toHaveCSS("background-color", "rgb(47, 122, 104)");
  expect(publishedPost).toBeNull();
  await publishButton.click();
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  expect(publishedPost).toMatchObject({ wallId: expect.any(String) });
  expect(publishedPost?.image).toMatch(/^data:image\/webp;base64,/);
  await page.getByRole("link", { name: "壁一覧に戻る" }).click();
  await expect(page).toHaveURL("/?post=e2e-wall-post");
  await expect(page.getByRole("heading", { name: "Explicit post wall" })).toBeVisible();
  await expect(page.getByRole("link", { name: "編集", exact: true })).toBeVisible();
});

test("deletes holds by keyboard and touch drag", async ({ page }) => {
  await authenticateAsE2eUser(page);
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
  await selectTokyoGym(page);
  await page.getByRole("button", { name: "壁を作成" }).click();
  await expect(page).toHaveURL(/\/walls\//);
  await expect(page.locator(".wall-title")).toContainText("E2E wall");
  await expect(page.getByRole("button", { name: "壁名を変更" })).toHaveCount(0);
  await expect(page.locator(".wall-title")).not.toHaveAttribute("role", "button");
  await page.getByRole("button", { name: "壁のリンクを共有" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-shared-url", /\/walls\//);
  await page.reload();
  await expect(page.locator(".wall-title")).toContainText("E2E wall");

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
  await page.getByRole("button", { name: "壁の設定", exact: true }).click();
  await page.getByRole("form", { name: "壁の設定" }).getByLabel("作成者").fill("E2E setter");
  await page.getByRole("button", { name: "設定を保存" }).click();

  await expect(page.getByRole("button", { name: "E2E routeを複製" })).toBeVisible();
  await expect(page.getByRole("button", { name: "E2E routeを削除" })).toBeVisible();

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "E2E routeのPNGを保存" }).click();
  expect((await pngDownload).suggestedFilename()).toBe("E2E route.png");
  await expect(page.getByRole("button", { name: "E2E routeを共有" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "E2E routeをDiscordに共有" })).toBeVisible();

  const routeActionLabels = page.locator(".route-card__tool span");
  await expect(routeActionLabels).toHaveCount(6);
  for (const label of await routeActionLabels.all()) await expect(label).toBeHidden();
  await expect(page.locator(".wall-link-share span")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".wall-link-share span")).toBeHidden();
  for (const label of await routeActionLabels.all()) await expect(label).toBeHidden();
});

test("edits gym, creator, and description from wall settings on mobile", async ({ page }) => {
  await authenticateAsE2eUser(page);
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
    name: "mobile-settings.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageBase64, "base64"),
  });
  await page.getByLabel("壁の名前").fill("Mobile settings");
  await selectTokyoGym(page);
  await page.getByRole("button", { name: "壁を作成" }).click();
  await expect(page).toHaveURL(/\/walls\//);

  await expect(page.locator("#editor-sidebar-panel")).toHaveCount(0);
  const settings = page.getByRole("form", { name: "壁の設定" });
  await page.getByRole("button", { name: "壁の設定", exact: true }).click();
  await settings.getByLabel("都道府県で絞り込む").selectOption("JP-13");
  await settings.getByLabel("ジム名で検索").fill("ROCKY");
  await settings.getByLabel("ジム名を選択").selectOption({ label: "ROCKY（ロッキー） 品川店" });
  await settings.getByLabel("作成者").fill("E2E setter");
  await settings.getByLabel("説明").fill("Mobile wall description");
  await settings.getByRole("button", { name: "設定を保存" }).click();
  await expect(settings).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "壁の設定", exact: true }).click();
  await expect(settings.getByLabel("ジム名を選択")).toHaveValue("ROCKY（ロッキー） 品川店");
  await expect(settings.getByLabel("作成者")).toHaveValue("E2E setter");
  await expect(settings.getByLabel("説明")).toHaveValue("Mobile wall description");
});

test("serves the local Worker API through the development proxy", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:5173/api/hello");
  expect(response.ok()).toBeTruthy();
});

test("reopens selected route text for editing instead of duplicating it", async ({ page }) => {
  await authenticateAsE2eUser(page);
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
  await selectTokyoGym(page);
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
              const route = routesRequest.result.find((item) => item.name === "Text editing route");
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
  const resizeStart = await canvas.evaluate((element, anchor) => {
    const fontSize = Math.max(
      14,
      24 * Math.min(element.clientWidth / 400, element.clientHeight / 400),
    );
    const textWidth = Math.max(fontSize, Array.from("Updated").length * fontSize * 0.7);
    return { x: anchor.x + textWidth + 4, y: anchor.y + fontSize / 2 + 3 };
  }, textPoint);
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x + 30, resizeStart.y + 30, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => (await readTextAnnotations())[0]?.fontScale ?? 1)
    .toBeGreaterThan(1);
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
