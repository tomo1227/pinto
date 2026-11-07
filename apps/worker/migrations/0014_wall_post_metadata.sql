ALTER TABLE "community_wall_post"
  ADD COLUMN "japaneseGrade" TEXT NOT NULL DEFAULT '';

ALTER TABLE "community_wall_post"
  ADD COLUMN "vGrade" TEXT NOT NULL DEFAULT '';

ALTER TABLE "community_wall_post"
  ADD COLUMN "author" TEXT NOT NULL DEFAULT '';

ALTER TABLE "community_wall_post"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
