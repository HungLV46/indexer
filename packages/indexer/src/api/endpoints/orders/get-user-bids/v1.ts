/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";

import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrder, getJoiOrderObject } from "@/common/joi";
import { buildContinuation, regex, splitContinuation, toBuffer } from "@/common/utils";

import { Orders } from "@/utils/orders";

const version = "v1";

export const getUserBidsV1Options: RouteOptions = {
  description: "User Bids (offers)",
  notes: "Get a list of bids (offers), filtered by maker.",
  tags: ["api", "Accounts"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      type: Joi.string()
        .valid("token", "collection", "attribute", "custom")
        .description(
          "Filter to a particular order type. Must be one of `token`, `collection`, `attribute`, `custom`."
        ),
      status: Joi.string()
        .valid("active", "inactive", "valid")
        .description(
          "activeª^º = currently valid\ninactiveª^ = temporarily invalid\nvalid^ = both active and inactive orders"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection bids with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      sortBy: Joi.string()
        .valid("createdAt", "price")
        .default("createdAt")
        .description(
          "Order the items are returned in the response. Defaults sorting direction to descending. "
        ),
      includeCriteriaMetadata: Joi.boolean()
        .default(false)
        .description("If true, criteria metadata is included in the response."),
      includeRawData: Joi.boolean()
        .default(false)
        .description("If true, raw data is included in the response."),
      includeDepth: Joi.boolean()
        .default(false)
        .description("If true, the depth of each order is included in the response."),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(50)
        .description("Amount of items returned in response. Max limit is 50."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    }),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(JoiOrder),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getUserBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    (query as any).user = toBuffer(request.params.user);

    try {
      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "orders",
        "token_set_id",
        query.includeCriteriaMetadata,
        "token_set_schema_hash"
      );

      const orderTypeJoin = query.type
        ? `JOIN token_sets ON token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash`
        : "";

      let orderStatusFilter = "";

      switch (query.status) {
        case "active": {
          orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
          break;
        }
        case "inactive": {
          orderStatusFilter = `orders.fillability_status = 'no-balance' OR (orders.fillability_status = 'fillable' AND orders.approval_status != 'approved')`;
          break;
        }
        case "valid": {
          // Potentially-valid orders
          orderStatusFilter = `orders.fillability_status = 'no-balance' OR (orders.fillability_status = 'fillable' AND orders.approval_status != 'approved') OR (orders.fillability_status = 'fillable' AND orders.approval_status = 'approved')`;
          break;
        }
        default: {
          orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
        }
      }

      let baseQuery = `
        SELECT
          contracts.kind AS "contract_kind",
          orders.id,
          orders.kind,
          orders.side,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              WHEN orders.approval_status = 'disabled' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          orders.token_set_id,
          orders.token_set_schema_hash,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.value,
          orders.currency,
          orders.currency_price,
          orders.currency_value,
          orders.normalized_value,
          orders.currency_normalized_value,
          orders.missing_royalties,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.quantity_filled,
          orders.quantity_remaining,
          coalesce(orders.fee_bps, 0) AS fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
          extract(epoch from orders.created_at) AS created_at,
          extract(epoch from orders.updated_at) AS updated_at,
          orders.originated_at,
          (${criteriaBuildQuery}) AS criteria
          ${query.includeRawData || query.includeDepth ? ", orders.raw_data" : ""}
        FROM orders
        ${orderTypeJoin}
        JOIN LATERAL (
          SELECT kind
          FROM contracts
          WHERE contracts.address = orders.contract
        ) contracts ON TRUE
      `;

      // Filters
      const conditions: string[] = [
        `orders.maker = $/user/`,
        `orders.side = 'buy'`,
        orderStatusFilter,
      ];

      if (query.collection) {
        const [contract] = query.collection.split(":");

        (query as any).contract = toBuffer(contract);
        conditions.push(`orders.contract = $/contract/`);

        if (!query.collection.match(regex.address)) {
          baseQuery += `
            JOIN LATERAL (
              SELECT
                contract,
                token_id
              FROM
                token_sets_tokens
              WHERE
                token_sets_tokens.token_set_id = orders.token_set_id LIMIT 1) tst ON TRUE
            JOIN tokens ON tokens.contract = tst.contract
              AND tokens.token_id = tst.token_id
          `;

          conditions.push(`tokens.collection_id = $/collection/`);
        }
      }

      switch (query.type) {
        case "token": {
          conditions.push(`orders.token_set_id LIKE 'token:%'`);
          break;
        }
        case "collection": {
          conditions.push(`(
                orders.token_set_id LIKE 'contract:%'
                OR orders.token_set_id LIKE 'range:%'
                OR (orders.token_set_id LIKE 'list:%' AND token_sets.attribute_id IS NULL)
                OR orders.token_set_id LIKE 'dynamic:collection-non-flagged:%'
              )`);
          break;
        }
        case "attribute": {
          conditions.push(
            `(orders.token_set_id LIKE 'list:%' AND token_sets.attribute_id IS NOT NULL)`
          );
          break;
        }
        case "custom": {
          conditions.push(`(
                orders.token_set_id LIKE 'list:%' 
                AND token_sets.collection_id IS NULL
                AND token_sets.attribute_id IS NULL
              )`);
          break;
        }
      }

      if (query.continuation) {
        const [sortOrderValueOrCreatedAt, sortOrderId] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );

        (query as any).sortOrderValueOrCreatedAt = sortOrderValueOrCreatedAt;
        (query as any).sortOrderId = sortOrderId;

        if (query.sortBy === "price") {
          conditions.push(
            `(orders.value, orders.id) < ($/sortOrderValueOrCreatedAt/, $/sortOrderId/)`
          );
        } else {
          conditions.push(
            `(orders.created_at, orders.id) < (to_timestamp($/sortOrderValueOrCreatedAt/), $/sortOrderId/)`
          );
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      // Sorting
      if (query.sortBy === "price") {
        baseQuery += ` ORDER BY orders.value DESC, orders.id DESC`;
      } else {
        baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;

      if (rawResult.length === query.limit) {
        const lastResult = rawResult[rawResult.length - 1];

        if (query.sortBy === "price") {
          continuation = buildContinuation(lastResult.value + "_" + lastResult.id);
        } else {
          continuation = buildContinuation(lastResult.created_at + "_" + lastResult.id);
        }
      }

      const result = rawResult.map(async (r) =>
        getJoiOrderObject(
          {
            id: r.id,
            kind: r.kind,
            side: r.side,
            status: r.status,
            tokenSetId: r.token_set_id,
            tokenSetSchemaHash: r.token_set_schema_hash,
            contract: r.contract,
            contractKind: r.contract_kind,
            maker: r.maker,
            taker: r.taker,
            prices: {
              gross: {
                amount: r.currency_price ?? r.price,
                nativeAmount: r.price,
              },
              net: {
                amount: query.normalizeRoyalties
                  ? r.currency_normalized_value ?? r.value
                  : r.currency_value ?? r.value,
                nativeAmount: query.normalizeRoyalties ? r.normalized_value ?? r.value : r.value,
              },
              currency: r.currency,
            },
            validFrom: r.valid_from,
            validUntil: r.valid_until,
            quantityFilled: r.quantity_filled,
            quantityRemaining: r.quantity_remaining,
            criteria: r.criteria,
            sourceIdInt: r.source_id_int,
            feeBps: r.fee_bps,
            feeBreakdown: r.fee_bps === 0 ? [] : r.fee_breakdown,
            expiration: r.expiration,
            isReservoir: r.is_reservoir,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            originatedAt: r.originated_at,
            rawData: r.raw_data,
            missingRoyalties: r.missing_royalties,
          },
          {
            normalizeRoyalties: query.normalizeRoyalties,
            includeRawData: query.includeRawData,
            includeDepth: query.includeDepth,
            displayCurrency: query.displayCurrency,
          }
        )
      );

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-user-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
