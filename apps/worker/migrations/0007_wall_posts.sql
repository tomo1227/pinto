CREATE TABLE IF NOT EXISTS "community_wall_post" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "wallId" TEXT NOT NULL,
  "wallName" TEXT NOT NULL,
  "gymName" TEXT NOT NULL,
  "routes" TEXT NOT NULL CHECK (json_valid("routes")),
  "image" TEXT NOT NULL CHECK (length("image") <= 700000),
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE ("userId", "wallId")
);

CREATE INDEX IF NOT EXISTS "community_wall_post_createdAt_idx"
  ON "community_wall_post" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_wall_post_gym_idx"
  ON "community_wall_post" ("gymName", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_wall_post_user_idx"
  ON "community_wall_post" ("userId", "createdAt" DESC);
