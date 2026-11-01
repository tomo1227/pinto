import { Hono } from "hono";

type ShareRoute = {
  name: string;
  grade?: string;
  holdCount: number;
  author?: string;
  gymName?: string;
};

const MAX_PNG_BYTES = 8_000_000;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

export class WebhookValidationError extends Error {}

export function validateDiscordWebhook(value: unknown): string {
  if (typeof value !== "string" || value.length > 512)
    throw new WebhookValidationError("Discord Webhook URLが無効です。");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebhookValidationError("Discord Webhook URLが無効です。");
  }
  const allowedHosts = new Set(["discord.com", "discordapp.com"]);
  const validPath = /^\/api\/webhooks\/\d{1,20}\/[A-Za-z0-9._-]{1,200}\/?$/;
  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname.toLowerCase()) ||
    url.port !== "" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !validPath.test(url.pathname)
  ) {
    throw new WebhookValidationError("Discord Webhook URLが無効です。");
  }
  return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
}

function parseShareRoute(value: FormDataEntryValue | null): ShareRoute | null {
  if (typeof value !== "string" || value.length > 4_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const route = parsed as Record<string, unknown>;
    if (typeof route.name !== "string" || !route.name.trim() || route.name.length > 256)
      return null;
    if (
      typeof route.holdCount !== "number" ||
      !Number.isInteger(route.holdCount) ||
      route.holdCount < 0 ||
      route.holdCount > 500
    )
      return null;
    const optionalString = (item: unknown) =>
      typeof item === "string" && item.length <= 256 ? item : undefined;
    return {
      name: route.name.trim(),
      holdCount: route.holdCount,
      ...(optionalString(route.grade) ? { grade: optionalString(route.grade) } : {}),
      ...(optionalString(route.author) ? { author: optionalString(route.author) } : {}),
      ...(optionalString(route.gymName) ? { gymName: optionalString(route.gymName) } : {}),
    };
  } catch {
    return null;
  }
}

async function sendToDiscord(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: "error" });
  } catch {
    throw new Error("Discordに接続できませんでした。ネットワークを確認してください。");
  }
}

function discordFailure(response: Response): {
  message: string;
  status: 429 | 502;
  headers?: Record<string, string>;
} {
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    return {
      message: "Discordの送信制限に達しました。少し待ってから再試行してください。",
      status: 429,
      ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
    };
  }
  return {
    message: "Discordへの送信に失敗しました。Webhook URLとDiscordの状態を確認してください。",
    status: 502,
  };
}

export const discordRoutes = new Hono();

discordRoutes.post("/test", async (context) => {
  let webhookUrl: string;
  try {
    const body = await context.req.json<{ webhookUrl?: unknown }>();
    webhookUrl = validateDiscordWebhook(body.webhookUrl);
  } catch (error) {
    if (error instanceof WebhookValidationError) return context.json({ error: error.message }, 400);
    return context.json({ error: "リクエスト形式が無効です。" }, 400);
  }

  try {
    const response = await sendToDiscord(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Pinto接続テスト", allowed_mentions: { parse: [] } }),
    });
    if (!response.ok) {
      const failure = discordFailure(response);
      return context.json({ error: failure.message }, failure.status, failure.headers);
    }
    return context.json({ message: "Discordに接続しました。" });
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Discordに接続できませんでした。" },
      502,
    );
  }
});

discordRoutes.post("/share", async (context) => {
  const contentLength = Number(context.req.header("content-length") ?? 0);
  if (contentLength > MAX_PNG_BYTES + 32_000)
    return context.json({ error: "画像は8MB以下にしてください。" }, 413);

  let form: FormData;
  try {
    form = await context.req.formData();
  } catch {
    return context.json({ error: "共有データの形式が無効です。" }, 400);
  }

  let webhookUrl: string;
  try {
    webhookUrl = validateDiscordWebhook(form.get("webhookUrl"));
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Discord Webhook URLが無効です。" },
      400,
    );
  }

  const route = parseShareRoute(form.get("route"));
  const file = form.get("file");
  if (!route || !(file instanceof File) || file.type !== "image/png" || file.size > MAX_PNG_BYTES) {
    return context.json(
      { error: "ルート情報またはPNG画像が無効です。画像は8MB以下にしてください。" },
      400,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
    return context.json({ error: "PNG画像を読み取れませんでした。" }, 400);
  }

  const fields = [
    { name: "Grade", value: route.grade || "未設定", inline: true },
    { name: "Holds", value: String(route.holdCount), inline: true },
    ...(route.author ? [{ name: "Setter", value: route.author, inline: true }] : []),
    ...(route.gymName ? [{ name: "Gym", value: route.gymName, inline: true }] : []),
  ];
  const payload = {
    embeds: [
      {
        title: route.name,
        color: 0x2f7a68,
        fields,
        image: { url: "attachment://route.png" },
        footer: { text: "Pinto · Climbing route studio" },
      },
    ],
    allowed_mentions: { parse: [] },
  };
  const formData = new FormData();
  formData.set("payload_json", JSON.stringify(payload));
  formData.set("files[0]", new Blob([bytes], { type: "image/png" }), "route.png");

  try {
    const response = await sendToDiscord(webhookUrl, { method: "POST", body: formData });
    if (!response.ok) {
      const failure = discordFailure(response);
      return context.json({ error: failure.message }, failure.status, failure.headers);
    }
    return context.json({ message: "Discordにルートを共有しました。" });
  } catch (error) {
    return context.json(
      { error: error instanceof Error ? error.message : "Discordへの送信に失敗しました。" },
      502,
    );
  }
});
