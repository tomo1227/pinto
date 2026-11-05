CREATE TABLE IF NOT EXISTS "community_wall_post_like" (
  "postId" TEXT NOT NULL REFERENCES "community_wall_post"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" INTEGER NOT NULL,
  PRIMARY KEY ("postId", "userId")
);

CREATE INDEX IF NOT EXISTS "community_wall_post_like_user_idx"
  ON "community_wall_post_like" ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "community_wall_post_save" (
  "postId" TEXT NOT NULL REFERENCES "community_wall_post"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" INTEGER NOT NULL,
  PRIMARY KEY ("postId", "userId")
);

CREATE INDEX IF NOT EXISTS "community_wall_post_save_user_idx"
  ON "community_wall_post_save" ("userId", "createdAt" DESC);