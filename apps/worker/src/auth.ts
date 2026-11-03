import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "./auth-schema";

export type AuthBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GYM_ADMIN_EMAILS?: string;
};

export function createAuth(env: AuthBindings) {
  const database = drizzle(env.DB, { schema: authSchema });
  const socialProviders =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {};

  return betterAuth({
    database: drizzleAdapter(database, { provider: "sqlite", schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    ...(env.BETTER_AUTH_URL
      ? { baseURL: env.BETTER_AUTH_URL, trustedOrigins: [env.BETTER_AUTH_URL] }
      : {}),
    emailAndPassword: { enabled: false },
    socialProviders,
  });
}
