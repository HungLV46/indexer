-- Up Migration

CREATE TABLE "payment_splits" (
  "address" BYTEA NOT NULL,
  "api_key" TEXT NOT NULL,
  "is_deployed" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_distribution_time" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "payment_splits"
  ADD CONSTRAINT "payment_splits_pk"
  PRIMARY KEY ("address");

CREATE TABLE "payment_splits_recipients" (
  "payment_split_address" BYTEA NOT NULL,
  "recipient" BYTEA NOT NULL,
  "amount_bps" INT NOT NULL
);

ALTER TABLE "payment_splits_recipients"
  ADD CONSTRAINT "payment_splits_recipients_pk"
  PRIMARY KEY ("payment_split_address", "recipient");

-- Down Migration

DROP TABLE "payment_splits_recipients";

DROP TABLE "payment_splits";