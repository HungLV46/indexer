import _ from "lodash";

import { logger } from "@/common/logger";
import {
  redisSubscriber,
  allChainsSyncRedisSubscriber,
  acquireLock,
  redis,
  allChainsSyncRedis,
} from "@/common/redis";
import { config } from "@/config/index";
import { AllChainsChannel, Channel } from "@/pubsub/channels";
import { ApiKeyUpdatedEvent } from "@/pubsub/events/api-key-updated-event";
import { RateLimitUpdatedEvent } from "@/pubsub/events/rate-limit-updated-event";
import { RoutersUpdatedEvent } from "@/pubsub/events/routers-updated-event";
import { SourcesUpdatedEvent } from "@/pubsub/events/sources-updated-event";
import { ApiKeyCreatedAllChainsEvent } from "@/pubsub/all-chains-events/api-key-created-all-chains-event";
import { ApiKeyUpdatedAllChainsEvent } from "@/pubsub/all-chains-events/api-key-updated-all-chains-event";
import { PauseRabbitConsumerEvent } from "@/pubsub/events/pause-rabbit-consumer-event";
import { ResumeRabbitConsumerEvent } from "@/pubsub/events/resume-rabbit-consumer-event";

import getUuidByString from "uuid-by-string";
import { RateLimitCreatedEvent } from "@/pubsub/all-chains-events/rate-limit-created-event";
import { RateLimitDeletedEvent } from "@/pubsub/all-chains-events/rate-limit-deleted-event";
import { MetadataReenabledEvent } from "@/pubsub/events/metadata-reenable-event";
import { PauseRabbitConsumerAllChainsEvent } from "@/pubsub/all-chains-events/pause-rabbit-consumer-all-chains-event";
import { ResumeRabbitConsumerAllChainsEvent } from "@/pubsub/all-chains-events/resume-rabbit-consumer-all-chains-event";
import { getNetworkName } from "@/config/network";

export class PubSub {
  public static getFullChannelName(channelName: Channel) {
    return `${getNetworkName()}-${channelName}`;
  }

  public static async publish(channel: Channel, message: string) {
    return redis.publish(PubSub.getFullChannelName(channel), message);
  }

  public static async subscribe() {
    // Subscribe to all channels defined in the `Channel` enum
    redisSubscriber.subscribe(
      _.values(Channel).map((channel) => PubSub.getFullChannelName(channel)),
      (error, count) => {
        if (error) {
          logger.error("pubsub", `Failed to subscribe ${error.message}`);
        }
        logger.info("pubsub", `subscribed to ${count} channels`);
      }
    );

    redisSubscriber.on("message", async (channel, message) => {
      logger.info("pubsub", `Received message on channel ${channel}, message = ${message}`);

      switch (channel) {
        case PubSub.getFullChannelName(Channel.ApiKeyUpdated):
          await ApiKeyUpdatedEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.RateLimitRuleUpdated):
          await RateLimitUpdatedEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.RoutersUpdated):
          await RoutersUpdatedEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.SourcesUpdated):
          await SourcesUpdatedEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.PauseRabbitConsumerQueue):
          await PauseRabbitConsumerEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.ResumeRabbitConsumerQueue):
          await ResumeRabbitConsumerEvent.handleEvent(message);
          break;

        case PubSub.getFullChannelName(Channel.MetadataReenabled):
          await MetadataReenabledEvent.handleEvent(message);
          break;
      }
    });
  }
}

export class AllChainsPubSub {
  public static getFullChannelName(channelName: AllChainsChannel) {
    return `${channelName}`;
  }

  public static async publish(channel: AllChainsChannel, message: string) {
    return allChainsSyncRedis.publish(AllChainsPubSub.getFullChannelName(channel), message);
  }

  public static async subscribe() {
    // Subscribe to all channels defined in the `AllChainsChannel` enum
    allChainsSyncRedisSubscriber.subscribe(
      _.values(AllChainsChannel).map((channel) => AllChainsPubSub.getFullChannelName(channel)),
      (error, count) => {
        if (error) {
          logger.error("pubsub-all-chains", `Failed to subscribe ${error.message}`);
        }
        logger.info("pubsub-all-chains", `subscribed to ${count} channels`);
      }
    );

    allChainsSyncRedisSubscriber.on("message", async (channel, message) => {
      // For some events prevent multiple pods processing same message
      const lockAcquired = await acquireLock(getUuidByString(message), 60);

      // For log received log only once
      if (lockAcquired) {
        logger.info(
          "pubsub-all-chains",
          `Received message on channel ${channel}, message = ${message}`
        );
      }

      // For some events mainnet acts as the master, no need to handle for updates on mainnet for those
      switch (channel) {
        case lockAcquired && config.chainId !== 1 && AllChainsChannel.ApiKeyCreated:
          await ApiKeyCreatedAllChainsEvent.handleEvent(message);
          break;

        case lockAcquired && config.chainId !== 1 && AllChainsChannel.ApiKeyUpdated:
          await ApiKeyUpdatedAllChainsEvent.handleEvent(message);
          break;

        case lockAcquired && config.chainId !== 1 && AllChainsChannel.RateLimitRuleCreated:
          await RateLimitCreatedEvent.handleEvent(message);
          break;

        case lockAcquired && config.chainId !== 1 && AllChainsChannel.RateLimitRuleUpdated:
          await RateLimitUpdatedEvent.handleEvent(message);
          break;

        case lockAcquired && config.chainId !== 1 && AllChainsChannel.RateLimitRuleDeleted:
          await RateLimitDeletedEvent.handleEvent(message);
          break;

        case AllChainsChannel.PauseRabbitConsumerQueue:
          await PauseRabbitConsumerAllChainsEvent.handleEvent(message);
          break;

        case AllChainsChannel.ResumeRabbitConsumerQueue:
          await ResumeRabbitConsumerAllChainsEvent.handleEvent(message);
          break;
      }
    });
  }
}
