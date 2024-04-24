import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import * as utils from "@/orderbook/orders/payment-processor-v2/build/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.token_set_id,
        collections.id
      FROM collections
      WHERE collections.id = $/collection/
    `,
    {
      collection: options.collection,
    }
  );
  if (!collectionResult?.id) {
    throw new Error("Could not fetch collection");
  }

  const collectionIsContractWide = collectionResult.token_set_id?.startsWith("contract:");
  const buildInfo = await utils.getBuildInfo(options, options.collection, "buy");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  if (collectionIsContractWide) {
    const builder = new Sdk.PaymentProcessorV2.Builders.ContractWide(config.chainId);
    return builder.build({
      ...buildInfo.params,
      beneficiary: options.maker,
    });
  } else {
    const builder = new Sdk.PaymentProcessorV2.Builders.TokenList(config.chainId);

    // Build the resulting token set's schema
    const schema = {
      kind: "collection",
      data: {
        collection: options.collection,
      },
    };

    let cachedTokenIds: string[] | null = null;
    const schemaHash = generateSchemaHash(schema);
    const cacheKey = `${schemaHash}:tokens`;

    if (!cachedTokenIds) {
      // Attempt 1: use a cached version of the token ids
      cachedTokenIds = await redis
        .get(cacheKey)
        .then((c) => (c ? (JSON.parse(c) as string[]) : null));
    }

    if (!cachedTokenIds) {
      // Attempt 2: read from database
      cachedTokenIds = await Tokens.getTokenIdsInCollection(options.collection, "", false);
      await redis.set(cacheKey, JSON.stringify(cachedTokenIds), "EX", 3600);
    }

    return builder.build({
      ...buildInfo.params,
      beneficiary: options.maker,
      tokenIds: cachedTokenIds,
    });
  }
};
