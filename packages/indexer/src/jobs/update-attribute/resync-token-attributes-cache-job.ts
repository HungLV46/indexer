import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Tokens } from "@/models/tokens";

import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

export type ResyncTokenAttributesCacheJobPayload = {
  contract: string;
  tokenId: string;
  context?: string;
};

export default class ResyncTokenAttributesCacheJob extends AbstractRabbitMqJobHandler {
  public static maxTokensPerAttribute = 15000;

  queueName = "resync-token-attributes-cache-queue";
  maxRetries = 10;
  concurrency = 3;

  public async process(payload: ResyncTokenAttributesCacheJobPayload) {
    const { contract, tokenId } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(
      contract,
      tokenId,
      ResyncTokenAttributesCacheJob.maxTokensPerAttribute
    );

    // Recalculate the number of tokens on sale for each attribute
    await resyncAttributeCacheJob.addToQueue(
      tokenAttributes.map((tokenAttribute) => ({
        attributeId: tokenAttribute.attributeId,
      }))
    );
  }

  public async addToQueue(
    params: ResyncTokenAttributesCacheJobPayload,
    delay = 0,
    forceRefresh = false
  ) {
    const token = `${params.contract}:${params.tokenId}`;
    const jobId = forceRefresh ? undefined : token;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncTokenAttributesCacheJob = new ResyncTokenAttributesCacheJob();
