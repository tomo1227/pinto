import type { Route as ClimbingRoute } from "@pinto/shared";

export type DiscordRouteSummary = Pick<ClimbingRoute, "name" | "grade" | "author" | "gymName"> & {
  holdCount: number;
};

export async function postDiscordTest(webhookUrl: string): Promise<string> {
  const response = await fetch("/api/integrations/discord/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  const result = (await response.json()) as { message?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? "接続テストに失敗しました。");
  return result.message ?? "Discordに接続しました。";
}

export async function shareRoutePng(
  webhookUrl: string,
  route: DiscordRouteSummary,
  png: Blob,
): Promise<string> {
  const body = new FormData();
  body.set("webhookUrl", webhookUrl);
  body.set("route", JSON.stringify(route));
  body.set("file", png, "route.png");
  const response = await fetch("/api/integrations/discord/share", { method: "POST", body });
  const result = (await response.json()) as { message?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Discordへの共有に失敗しました。");
  return result.message ?? "Discordにルートを共有しました。";
}
