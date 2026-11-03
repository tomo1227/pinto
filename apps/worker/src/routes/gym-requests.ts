import { JAPAN_PREFECTURES } from "@pinto/shared";
import { Hono } from "hono";
import { type AuthBindings, createAuth } from "../auth";

export const gymRequestRoutes = new Hono<{ Bindings: AuthBindings }>();

type GymRegistrationRequest = {
  id: string;
  prefectureCode: string;
  gymName: string;
  address: string;
  phone: string;
  website: string;
  message: string;
  createdAt: number;
};

async function getAdminSession(request: Request, env: AuthBindings) {
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session) return null;
  const allowedEmails = (env.GYM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const email = session.user.email?.trim().toLowerCase();
  return email && allowedEmails.includes(email) ? session : null;
}

function hasTrustedOrigin(request: Request, env: AuthBindings) {
  try {
    return (
      new URL(request.headers.get("origin") ?? "").origin ===
      new URL(env.BETTER_AUTH_URL ?? "").origin
    );
  } catch {
    return false;
  }
}

gymRequestRoutes.get("/", async (context) => {
  const session = await getAdminSession(context.req.raw, context.env);
  if (!session) return context.json({ error: "管理者権限が必要です。" }, 403);

  const { results } = await context.env.DB.prepare(
    `SELECT id, prefectureCode, gymName, address, phone, website, message, createdAt
     FROM gym_registration_request ORDER BY createdAt DESC`,
  ).all<GymRegistrationRequest>();
  return context.json({ requests: results });
});

gymRequestRoutes.post("/", async (context) => {
  let input: Record<string, unknown>;
  try {
    input = await context.req.json<Record<string, unknown>>();
  } catch {
    return context.json({ error: "申請内容の形式が無効です。" }, 400);
  }

  const prefectureCode = typeof input.prefectureCode === "string" ? input.prefectureCode : "";
  const gymName = typeof input.gymName === "string" ? input.gymName.trim() : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const website = typeof input.website === "string" ? input.website.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (!JAPAN_PREFECTURES.some((prefecture) => prefecture.code === prefectureCode)) {
    return context.json({ error: "都道府県を選択してください。" }, 400);
  }
  if (!gymName || gymName.length > 100) {
    return context.json({ error: "ジム名は1〜100文字で入力してください。" }, 400);
  }
  if (address.length > 200 || phone.length > 40 || message.length > 500) {
    return context.json({ error: "住所・電話番号・補足の文字数上限を超えています。" }, 400);
  }
  if (website.length > 300) {
    return context.json({ error: "公式サイトのURLは300文字以内で入力してください。" }, 400);
  }
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      return context.json({ error: "公式サイトにはhttpまたはhttpsのURLを入力してください。" }, 400);
    }
  }

  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `INSERT INTO gym_registration_request
       (id, prefectureCode, gymName, address, phone, website, message, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, prefectureCode, gymName, address, phone, website, message, Date.now())
    .run();

  return context.json({ requestId: id }, 201);
});

gymRequestRoutes.delete("/:requestId", async (context) => {
  if (!hasTrustedOrigin(context.req.raw, context.env)) {
    return context.json({ error: "投稿元を確認できません。" }, 403);
  }
  const session = await getAdminSession(context.req.raw, context.env);
  if (!session) return context.json({ error: "管理者権限が必要です。" }, 403);

  const result = await context.env.DB.prepare("DELETE FROM gym_registration_request WHERE id = ?")
    .bind(context.req.param("requestId"))
    .run();
  if (result.meta?.changes === 0) {
    return context.json({ error: "申請が見つかりません。" }, 404);
  }
  return context.json({ deleted: true });
});
