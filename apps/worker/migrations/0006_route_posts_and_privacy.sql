ALTER TABLE "community_profile"
  ADD COLUMN "isPrivate" INTEGER NOT NULL DEFAULT 0 CHECK ("isPrivate" IN (0, 1));

CREATE TABLE IF NOT EXISTS "community_route_post" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "wallId" TEXT NOT NULL,
  "wallName" TEXT NOT NULL,
  "routeName" TEXT NOT NULL,
  "gymName" TEXT NOT NULL,
  "grade" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "image" TEXT NOT NULL CHECK (length("image") <= 700000),
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "community_route_post_createdAt_idx"
  ON "community_route_post" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_route_post_gym_grade_idx"
  ON "community_route_post" ("gymName", "grade", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_route_post_user_idx"
  ON "community_route_post" ("userId", "createdAt" DESC);