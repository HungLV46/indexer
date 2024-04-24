/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// This param indicate this is a shared contract logic that handles multiple collections sharing the same contract
export const isSharedContract = true;

export const extendCollection = async (_chainId: number, metadata: any, _tokenId = null) => {
  metadata.id = `${metadata.contract}:opensea-${metadata.slug}`;
  metadata.tokenIdRange = null;
  metadata.tokenSetId = null;

  return { ...metadata };
};
export const extend = async (metadata: any) => {
  metadata.collection = `${metadata.contract}:opensea-${metadata.slug}`;
  return { ...metadata };
};
