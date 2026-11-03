ALTER TABLE "community_wall_post"
  ADD COLUMN "tags" TEXT NOT NULL DEFAULT '{"hold":[],"move":[],"type":[]}'
  CHECK (json_valid("tags"));