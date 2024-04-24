import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as tokenSets from "@/orderbook/token-sets";
import { idb } from "@/common/db";

export type RefreshDynamicTokenSetJobPayload = {
  collectionId: string;
};

export default class RefreshDynamicTokenSetJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-dynamic-token-set-queue";
  maxRetries = 10;
  concurrency = 20;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: RefreshDynamicTokenSetJobPayload) {
    const { collectionId } = payload;

    const tokenSet = await tokenSets.dynamicCollectionNonFlagged.get({
      collection: collectionId,
    });

    const tokenSetResult = await idb.oneOrNone(
      `
        SELECT 1 FROM token_sets
        WHERE token_sets.id = $/id/
      `,
      {
        id: tokenSet.id,
      }
    );

    if (tokenSetResult) {
      await tokenSets.dynamicCollectionNonFlagged.save(
        { collection: collectionId },
        undefined,
        true
      );
    }
  }

  public async addToQueue(params: RefreshDynamicTokenSetJobPayload, delay = 10 * 60 * 1000) {
    await this.send({ payload: params, jobId: params.collectionId }, delay);
  }
}

export const refreshDynamicTokenSetJob = new RefreshDynamicTokenSetJob();
