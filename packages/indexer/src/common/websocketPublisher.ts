import { redisWebsocketPublisher } from "./redis";
import { getNetworkName } from "@/config/network";

export interface WebsocketMessage {
  published_at?: number;
  event: string;
  tags: {
    [key: string]: string;
  };
  changed?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  offset?: string;
}

export const publishWebsocketEvent = async (message: WebsocketMessage): Promise<void> => {
  message.published_at = Date.now();
  await redisWebsocketPublisher.publish(`${getNetworkName()}-ws-events`, JSON.stringify(message));
};
