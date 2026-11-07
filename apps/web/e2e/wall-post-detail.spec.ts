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
