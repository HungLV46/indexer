/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import { logger } from "@/common/logger";
import { handleTokenUriErrorResponse, handleTokenUriResponse } from "@/metadata/providers/utils";

export const fetchTokenUriMetadata = async (
  { contract, tokenId }: { contract: string; tokenId: string },
  uri: string
) => {
  logger.info(
    "vee-friends-fetcher",
    JSON.stringify({
      message: `fetchTokenUriMetadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
      contract,
      tokenId,
    })
  );

  return axios
    .get(uri)
    .then((res) => handleTokenUriResponse(contract, tokenId, res))
    .catch((error) => handleTokenUriErrorResponse(contract, tokenId, error));
};
