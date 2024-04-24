import { idb, ridb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";
import { Collections } from "@/models/collections";
import { AddressZero } from "@ethersproject/constants";
import { fromUnixTime } from "date-fns";

export type FixOwnershipJobCursorInfo = {
  syncUpToTimestamp: number;
  timestamp?: number;
  disableErc1155?: boolean;
};

export class FixOwnershipJob extends AbstractRabbitMqJobHandler {
  queueName = "fix-ownership";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: FixOwnershipJobCursorInfo) {
    const { syncUpToTimestamp, timestamp, disableErc1155 } = payload;
    const limit = 200;
    let cursor = "";

    if (timestamp) {
      cursor = `AND timestamp < $/timestamp/`;
    }

    const query = `
      SELECT nft_transfer_events.*, c.kind AS "contract_kind"
      FROM nft_transfer_events
      JOIN contracts c ON nft_transfer_events.address = c.address
      WHERE timestamp > $/syncUpToTimestamp/
      AND is_deleted = 0
      ${cursor}
      ORDER BY timestamp DESC, tx_index DESC, log_index DESC
      LIMIT ${limit}
    `;

    const transfers = await ridb.manyOrNone(query, { syncUpToTimestamp, timestamp });

    for (const transfer of transfers) {
      if (transfer.contract_kind === "erc721") {
        const ownerQuery = `
          SELECT *
          FROM nft_balances
          WHERE contract = $/contract/
          AND token_id = $/tokenId/
          AND amount > 0
        `;

        const owners = await ridb.manyOrNone(ownerQuery, {
          contract: transfer.address,
          tokenId: transfer.token_id,
        });

        if (owners.length > 1) {
          // Fix multiple owners
          const currentOwner = await this.getErc721CurrentOwner(
            fromBuffer(transfer.address),
            transfer.token_id
          );

          logger.info(
            this.queueName,
            `Multiple owners found for ${fromBuffer(transfer.address)}:${
              transfer.token_id
            } current owner ${currentOwner} reached ${transfer.created_at.toISOString()} timestamp ${
              timestamp ? fromUnixTime(timestamp).toISOString() : ""
            }`
          );

          for (const owner of owners) {
            if (fromBuffer(owner.owner) !== currentOwner) {
              logger.info(
                this.queueName,
                `Remove owner ${fromBuffer(owner.owner)} for ${fromBuffer(transfer.address)}:${
                  transfer.token_id
                }`
              );

              const updateOwnersQuery = `
                UPDATE nft_balances
                SET amount = 0, updated_at = NOW()
                WHERE owner = $/owner/
                AND contract = $/contract/
                AND token_id = $/tokenId/
              `;

              await idb.none(updateOwnersQuery, {
                owner: owner.owner,
                contract: transfer.address,
                tokenId: transfer.token_id,
              });

              const collection = await Collections.getByContractAndTokenId(
                fromBuffer(transfer.address),
                transfer.token_id
              );

              if (collection) {
                await resyncUserCollectionsJob.addToQueue([
                  {
                    user: fromBuffer(owner.owner),
                    collectionId: collection.id,
                  },
                ]);
              }
            }
          }
        } else if (owners.length && Number(owners[0].amount) > 1) {
          // Fix owner balance
          logger.info(
            this.queueName,
            `Owner ${fromBuffer(owners[0].owner)} for ${fromBuffer(transfer.address)}:${
              transfer.token_id
            } has ${owners[0].amount} setting to 1`
          );

          const updateOwnersQuery = `
            UPDATE nft_balances
            SET amount = 1, updated_at = NOW()
            WHERE owner = $/owner/
            AND contract = $/contract/
            AND token_id = $/tokenId/
          `;

          await idb.none(updateOwnersQuery, {
            owner: owners[0].owner,
            contract: transfer.address,
            tokenId: transfer.token_id,
          });
        } else if (owners.length) {
          // Fix wrong owner
          const currentOwner = await this.getErc721CurrentOwner(
            fromBuffer(transfer.address),
            transfer.token_id
          );

          if (fromBuffer(owners[0].owner) !== currentOwner) {
            const updateCurrentOwner = `
              UPDATE nft_balances
              SET amount = 1, updated_at = NOW()
              WHERE owner = $/owner/
              AND contract = $/contract/
              AND token_id = $/tokenId/
              AND amount != 1
            `;

            await idb.none(updateCurrentOwner, {
              owner: toBuffer(currentOwner),
              contract: transfer.address,
              tokenId: transfer.token_id,
            });

            const updateOldOwner = `
              UPDATE nft_balances
              SET amount = 0, updated_at = NOW()
              WHERE owner = $/owner/
              AND contract = $/contract/
              AND token_id = $/tokenId/
              AND amount != 0
            `;

            await idb.none(updateOldOwner, {
              owner: owners[0].owner,
              contract: transfer.address,
              tokenId: transfer.token_id,
            });

            logger.info(
              this.queueName,
              `Updated wrong owner to ${currentOwner} from ${fromBuffer(
                owners[0].owner
              )} on ${fromBuffer(transfer.address)}:${transfer.token_id}`
            );

            const collection = await Collections.getByContractAndTokenId(
              fromBuffer(transfer.address),
              Number(transfer.token_id)
            );

            if (collection) {
              await resyncUserCollectionsJob.addToQueue([
                {
                  user: fromBuffer(owners[0].owner),
                  collectionId: collection.id,
                },
                {
                  user: currentOwner,
                  collectionId: collection.id,
                },
              ]);
            }
          }
        }
      } else if (!disableErc1155 && transfer.contract_kind === "erc1155") {
        // If not zero address update the balance
        if (
          ![AddressZero, "0x000000000000000000000000000000000000dead"].includes(
            fromBuffer(transfer.to)
          )
        ) {
          await this.updateErc1155OwnerBalance(
            fromBuffer(transfer.to),
            fromBuffer(transfer.address),
            transfer.token_id
          );
        }

        // If not zero address update the balance
        if (
          ![AddressZero, "0x000000000000000000000000000000000000dead"].includes(
            fromBuffer(transfer.from)
          )
        ) {
          await this.updateErc1155OwnerBalance(
            fromBuffer(transfer.from),
            fromBuffer(transfer.address),
            transfer.token_id
          );
        }
      }
    }

    // Check if there are more potential users to sync
    if (transfers.length == limit) {
      const lastItem = _.last(transfers);

      return {
        addToQueue: true,
        cursor: { syncUpToTimestamp, timestamp: lastItem.timestamp, disableErc1155 },
      };
    }

    return { addToQueue: false };
  }

  public async getErc721CurrentOwner(contract: string, tokenId: string) {
    const currentOwnerQuery = `
      SELECT nft_transfer_events.to
      FROM nft_transfer_events
      WHERE address = $/contract/
      AND token_id = $/tokenId/
      AND is_deleted = 0
      ORDER BY timestamp DESC, tx_index DESC, log_index DESC
      LIMIT 1
    `;

    const currentOwner = await ridb.oneOrNone(currentOwnerQuery, {
      contract: toBuffer(contract),
      tokenId: tokenId,
    });

    return fromBuffer(currentOwner.to);
  }

  public async updateErc1155OwnerBalance(owner: string, contract: string, tokenId: string) {
    const ownerReceivedQuery = `
      SELECT COALESCE(SUM(nte.amount), 0) AS "amount"
      FROM nft_transfer_events nte
      WHERE address = $/contract/
      AND token_id = $/tokenId/
      AND nte.to = $/owner/
      AND is_deleted = 0
    `;

    const ownerReceived = await ridb.oneOrNone(ownerReceivedQuery, {
      owner: toBuffer(owner),
      contract: toBuffer(contract),
      tokenId: tokenId,
    });

    const ownerSentQuery = `
      SELECT COALESCE(SUM(nte.amount), 0) AS "amount"
      FROM nft_transfer_events nte
      WHERE address = $/contract/
      AND token_id = $/tokenId/
      AND nte.from = $/owner/
      AND is_deleted = 0
    `;

    const ownerSent = await ridb.oneOrNone(ownerSentQuery, {
      owner: toBuffer(owner),
      contract: toBuffer(contract),
      tokenId: tokenId,
    });

    const currentBalance = _.max([ownerReceived.amount - ownerSent.amount, 0]);

    const updateOwnersQuery = `
      UPDATE nft_balances
      SET amount = $/balance/, updated_at = NOW()
      WHERE owner = $/owner/
      AND contract = $/contract/
      AND token_id = $/tokenId/
      AND amount != $/balance/
    `;

    const { rowCount } = await idb.result(updateOwnersQuery, {
      owner: toBuffer(owner),
      contract: toBuffer(contract),
      tokenId: tokenId,
      balance: currentBalance,
    });

    if (rowCount > 0) {
      logger.info(
        this.queueName,
        `Updated owner ${owner} balance to ${currentBalance} for ${contract}:${tokenId}`
      );

      const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

      if (collection) {
        await resyncUserCollectionsJob.addToQueue([
          {
            user: owner,
            collectionId: collection.id,
          },
        ]);
      }
    }
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: FixOwnershipJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: FixOwnershipJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const fixOwnershipJob = new FixOwnershipJob();
