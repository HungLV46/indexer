-- Up Migration
ALTER TABLE collection_mints ADD price_without_fee NUMERIC(78, 0);

-- Down Migration
ALTER TABLE collection_mints DROP COLUMN price_without_fee;
