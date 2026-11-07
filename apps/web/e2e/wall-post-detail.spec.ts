import { expect, test } from "@playwright/test";

test("opens another climber's wall post details and shares the post without editor controls", async ({
  page,
}) => {
  const post = {
    id: "shared-wall-post",
    userId: "another-user",
    username: "Another Climber",
    handle: "another_climber",
    avatar: null,
    wallId: "another-users-local-wall",
    wallName: "Competition Wall",
    gymName: "Test Climbing Gym",
    routes: [
      {
        id: "route-1",
        name: "Blue Problem",
        grade: "V4",
        japaneseGrade: "3級",
        vGrade: "V4",
        description: "Start on the lower hold.",
      },
    ],
    tags: { hold: [], move: [], type: [] },
    image: "data:image/webp;base64,AA==",
    createdAt: Date.now(),
    likeCount: 2,
    likedByMe: false,
    savedByMe: false,
  };

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.sharedUrl = data.url ?? "";
      },
    });
  });
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/community/posts**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(`/${post.id}`)) {
      return route.fulfill({ json: { post } });
    }
    return route.fulfill({ json: { posts: [post], gyms: [post.gymName], grades: ["V4"] } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Competition Wallの投稿詳細を開く" }).click();

  await expect(page).toHaveURL(/\/\?post=shared-wall-post$/);
  await expect(page.getByRole("heading", { name: "Competition Wall" })).toBeVisible();
  await expect(page.getByText("Blue Problem")).toBeVisible();
  await expect(page.getByText("Start on the lower hold.")).toBeVisible();
  await expect(page.locator("canvas.wall-canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "壁を編集" })).toHaveCount(0);

  await page.getByRole("button", { name: "投稿を共有" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-shared-url",
    /\/\?post=shared-wall-post$/,
  );
});

test("opens an own post's details when its wall is not stored on this device", async ({ page }) => {
  const post = {
    id: "local-wall-post",
    userId: "viewer",
    username: "Viewer",
    handle: "viewer",
    avatar: null,
    wallId: "wall-from-another-device",
    wallName: "Shared Wall",
    gymName: "Test Climbing Gym",
    routes: [],
    tags: { hold: [], move: [], type: [] },
    image: "data:image/webp;base64,AA==",
    createdAt: Date.now(),
    likeCount: 0,
    likedByMe: false,
    savedByMe: false,
  };

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
  await page.route("**/api/community/posts**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(`/${post.id}`)) {
      return route.fulfill({ json: { post } });
    }
    return route.fulfill({ json: { posts: [post], gyms: [post.gymName], grades: [] } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Shared Wallの投稿詳細を開く" }).click();

  await expect(page).toHaveURL(/\/\?post=local-wall-post$/);
  await expect(page.getByRole("heading", { name: "Shared Wall" })).toBeVisible();
  await expect(page.getByText("投稿を読み込んでいます...")).toHaveCount(0);
});
