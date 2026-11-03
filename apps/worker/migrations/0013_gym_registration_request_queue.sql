CREATE TABLE "gym_registration_request_new" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "prefectureCode" TEXT NOT NULL,
  "gymName" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "website" TEXT NOT NULL DEFAULT '',
  "message" TEXT NOT NULL DEFAULT '',
  "createdAt" INTEGER NOT NULL
);

INSERT INTO "gym_registration_request_new"
  ("id", "prefectureCode", "gymName", "address", "phone", "website", "message", "createdAt")
SELECT "id", "prefectureCode", "gymName", "address", "phone", "website", "message", "createdAt"
FROM "gym_registration_request";

DROP TABLE "gym_registration_request";
ALTER TABLE "gym_registration_request_new" RENAME TO "gym_registration_request";

CREATE INDEX "gym_registration_request_createdAt_idx"
  ON "gym_registration_request" ("createdAt" DESC);