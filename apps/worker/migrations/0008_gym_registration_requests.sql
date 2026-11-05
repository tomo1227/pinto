CREATE TABLE IF NOT EXISTS "gym_registration_request" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "prefectureCode" TEXT NOT NULL,
  "gymName" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "website" TEXT NOT NULL DEFAULT '',
  "message" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "createdAt" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "gym_registration_request_status_createdAt_idx"
  ON "gym_registration_request" ("status", "createdAt" DESC);