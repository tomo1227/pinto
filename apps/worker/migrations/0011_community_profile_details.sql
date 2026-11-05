ALTER TABLE "community_profile"
  ADD COLUMN "residence" TEXT NOT NULL DEFAULT '';

ALTER TABLE "community_profile"
  ADD COLUMN "age" INTEGER CHECK ("age" IS NULL OR "age" BETWEEN 1 AND 120);

ALTER TABLE "community_profile"
  ADD COLUMN "homeGyms" TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid("homeGyms") AND json_type("homeGyms") = 'array');

UPDATE "community_profile"
SET "homeGyms" = CASE
  WHEN "homeGym" = '' THEN '[]'
  ELSE json_array("homeGym")
END
WHERE "homeGyms" = '[]' AND "homeGym" != '';
