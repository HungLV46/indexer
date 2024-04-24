import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { AllChainsChannel } from "@/pubsub/channels";
import { redb } from "@/common/db";
import { AllChainsPubSub } from "@/pubsub/index";

export type SyncApiKeysJobPayload = {
  apiKey: string;
};

export class SyncApiKeysJob extends AbstractRabbitMqJobHandler {
  queueName = "sync-api-keys";
  maxRetries = 10;
  concurrency = 30;

  public async process(payload: SyncApiKeysJobPayload) {
    const { apiKey } = payload;

    const apiKeyValues = await redb.oneOrNone(`SELECT * FROM api_keys WHERE key = $/apiKey/`, {
      apiKey,
    });

    if (apiKeyValues) {
      await AllChainsPubSub.publish(
        AllChainsChannel.ApiKeyCreated,
        JSON.stringify({ values: apiKeyValues })
      );
    }
  }

  public async addToQueue(info: SyncApiKeysJobPayload, delay = 0) {
    await this.send({ payload: info }, delay);
  }
}

export const syncApiKeysJob = new SyncApiKeysJob();
