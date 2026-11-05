CREATE TABLE IF NOT EXISTS "community_profile" (
  "userId" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "handle" TEXT COLLATE NOCASE UNIQUE,
  "bio" TEXT NOT NULL DEFAULT '',
  "climbingLevel" TEXT NOT NULL DEFAULT '',
  "homeGym" TEXT NOT NULL DEFAULT '',
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "community_follow" (
  "followerId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "followedId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" INTEGER NOT NULL,
  PRIMARY KEY ("followerId", "followedId"),
  CHECK ("followerId" != "followedId")
);

CREATE INDEX IF NOT EXISTS "community_follow_followedId_idx"
  ON "community_follow" ("followedId");