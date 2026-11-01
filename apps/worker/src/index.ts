import { Hono } from "hono";
import { discordRoutes } from "./routes/discord";

type Bindings = { ASSETS: Fetcher };
const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/hello", (context) => context.json({ message: "Hello World!" }));
app.route("/api/integrations/discord", discordRoutes);
app.notFound((context) => {
  if (new URL(context.req.url).pathname.startsWith("/api/")) {
    return context.json({ error: "Not found" }, 404);
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

export default app;
