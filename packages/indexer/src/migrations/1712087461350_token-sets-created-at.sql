-- Up Migration

ALTER TABLE "token_sets" ADD COLUMN "created_at" TIMESTAMPTZ;
ALTER TABLE "token_sets" ALTER "created_at" SET DEFAULT now();

-- Down Migration

ALTER TABLE "token_sets" DROP COLUMN "created_at";