CREATE TABLE IF NOT EXISTS "posts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL CHECK (length("content") <= 1000),
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "posts_createdAt_idx" ON "posts" ("createdAt" DESC);