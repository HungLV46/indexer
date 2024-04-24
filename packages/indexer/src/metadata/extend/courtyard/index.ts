/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { CollectionMetadata, TokenMetadata } from "@/metadata/types";

// This param indicate this is a shared contract logic that handles multiple collections sharing the same contract
export const isSharedContract = true;

export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  metadata.id = `${metadata.contract}:courtyard-${metadata.slug}`;
  metadata.tokenIdRange = null;
  metadata.tokenSetId = null;

  return { ...metadata };
};

export const extend = async (metadata: TokenMetadata) => {
  metadata.collection = `${metadata.contract}:courtyard-${metadata.slug}`;
  return { ...metadata };
};
