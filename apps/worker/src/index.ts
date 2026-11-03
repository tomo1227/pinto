import { Hono } from "hono";
import { type AuthBindings, createAuth } from "./auth";
import { communityRoutes } from "./routes/community";
import { discordRoutes } from "./routes/discord";
import { gymRequestRoutes } from "./routes/gym-requests";
import { routePostRoutes } from "./routes/route-posts";

type Bindings = AuthBindings & { ASSETS: Fetcher };
const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/hello", (context) => context.json({ message: "Hello World!" }));
app.on(["GET", "POST"], "/api/auth/*", async (context) => {
  if (!context.env.BETTER_AUTH_SECRET || context.env.BETTER_AUTH_SECRET.length < 32) {
    return context.json({ error: "認証シークレットを設定してください。" }, 503);
  }
  return await createAuth(context.env).handler(context.req.raw);
});
app.route("/api/community", communityRoutes);
app.route("/api/community/posts", routePostRoutes);
app.route("/api/gyms/requests", gymRequestRoutes);
app.route("/api/integrations/discord", discordRoutes);
app.notFound((context) => {
  if (new URL(context.req.url).pathname.startsWith("/api/")) {
    return context.json({ error: "Not found" }, 404);
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

export default app;
