ALTER TABLE "community_profile"
  ADD COLUMN "japaneseClimbingLevel" TEXT NOT NULL DEFAULT '';

ALTER TABLE "community_profile"
  ADD COLUMN "vClimbingLevel" TEXT NOT NULL DEFAULT '';

UPDATE "community_profile"
SET "japaneseClimbingLevel" = CASE
  WHEN "climbingLevel" IN (
    '10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級',
    '初段', '二段', '三段', '四段', '五段', '六段'
  ) THEN "climbingLevel"
  ELSE ''
END,
"vClimbingLevel" = CASE
  WHEN "climbingLevel" IN (
    'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8',
    'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'
  ) THEN "climbingLevel"
  ELSE ''
END
WHERE "climbingLevel" != '';
