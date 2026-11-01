// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { discordRoutes, validateDiscordWebhook } from "../../../worker/src/routes/discord";

const webhookUrl = "https://discord.com/api/webhooks/12345678901234567/abc_def-123";

afterEach(() => vi.unstubAllGlobals());

describe("Discord webhook validation", () => {
  it("accepts only HTTPS Discord webhook endpoints", () => {
    expect(validateDiscordWebhook(webhookUrl)).toBe(webhookUrl);
    for (const invalid of [
      "http://discord.com/api/webhooks/123/token",
      "https://discord.com.evil.test/api/webhooks/123/token",
      "https://example.com/api/webhooks/123/token",
      "https://discord.com/api/webhooks/123/token?next=https://example.com",
      "https://user:pass@discord.com/api/webhooks/123/token",
      "https://discord.com/api/users/@me",
    ]) {
      expect(() => validateDiscordWebhook(invalid)).toThrow(/無効/);
    }
  });

  it("sends a mention-safe connection test to Discord", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await discordRoutes.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: expect.any(String) });
    expect(fetchMock).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({ redirect: "error" }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ allowed_mentions: { parse: [] } });
  });

  it("uploads a PNG embed and safely maps Discord rate limits", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("webhookUrl", webhookUrl);
    form.set(
      "route",
      JSON.stringify({ name: "Green arete", grade: "V4", holdCount: 6, author: "Setter" }),
    );
    form.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "route.png", {
        type: "image/png",
      }),
    );
    const shared = await discordRoutes.request("/share", { method: "POST", body: form });
    expect(shared.status).toBe(200);
    const outgoing = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const embed = JSON.parse(String(outgoing.get("payload_json")));
    expect(embed.allowed_mentions).toEqual({ parse: [] });
    expect(embed.embeds[0].image.url).toBe("attachment://route.png");
    expect(outgoing.get("files[0]")).toBeInstanceOf(Blob);

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "retry-after": "2" } }),
    );
    const limited = await discordRoutes.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("2");
    expect(await limited.json()).toMatchObject({ error: expect.stringContaining("制限") });
  });
});
