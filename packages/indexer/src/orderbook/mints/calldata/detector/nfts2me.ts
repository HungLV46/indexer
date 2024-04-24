import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { getStatus, toSafeNumber } from "@/orderbook/mints/calldata/helpers";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "nfts2me";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function mintPrice() view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function maxPerAddress() view returns (uint256)",
      "function n2mVersion() view returns (uint256)",
      "function mintFee(uint256 amount) view returns (uint256)",
      "function protocolFee() view returns (uint256)",
      "function merkleRoot() view returns (bytes32)",
      "function mintingType() view returns (uint8)",
    ]),
    baseProvider
  );

  try {
    const version = await contract.n2mVersion();
    if (!version) {
      return [];
    }

    const n2mVersion = version.toString();

    let price: string;
    let mintingType: number | undefined;
    if (bn(n2mVersion).gt(1999)) {
      const [mintFee, protocolFee, merkleRoot, mType] = await Promise.all([
        contract.mintFee(1),
        contract.protocolFee(),
        contract.merkleRoot(),
        contract.mintingType(),
      ]);

      price = protocolFee.add(mintFee).toString();
      mintingType = mType;

      if (merkleRoot !== HashZero) {
        // Skip allowlist mints for now
        return [];
      }
    } else {
      const [totalPrice] = await Promise.all([contract.mintPrice()]);
      price = totalPrice.toString();
    }

    const maxPerAddress = await contract.maxPerAddress();

    // Random Mint
    if (mintingType === 1) {
      results.push({
        collection,
        contract: collection,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // "mintRandomTo"
              signature: "0x1d7df191",
              params: [
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
              ],
            },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price,
        maxMintsPerWallet: toSafeNumber(maxPerAddress),
      });
    } else {
      results.push({
        collection,
        contract: collection,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // "mintTo"
              signature: "0x449a52f8",
              params: [
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
              ],
            },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price,
        maxMintsPerWallet: toSafeNumber(maxPerAddress),
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason;
      });
    })
  );

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0x449a52f8", // `mintTo`
      "0x438b1b4b", // `mintTo`
      "0x4a50aa85", // `mintSpecifyTo`
      "0x4402d254", // `mintSpecifyTo`
      "0xfefa5d72", // `mintRandomTo`
      "0x1d7df191", // `mintRandomTo`
      "0x9d13a5ba", // `mintPresale`
      "0x6ad54240", // `mintCustomURITo`
      "0xa0712d68", // `mint`
      "0x94bf804d", // `mint`
      "0x1249c58b", // `mint`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

  // Fetch and save/update the currently available mints
  const latestCollectionMints = await extractByCollectionERC721(collection);
  for (const collectionMint of latestCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }

  // Assume anything that exists in our system but was not returned
  // in the above call is not available anymore so we can close
  for (const existing of existingCollectionMints) {
    if (
      !latestCollectionMints.find(
        (latest) =>
          latest.collection === existing.collection &&
          latest.stage === existing.stage &&
          latest.tokenId === existing.tokenId
      )
    ) {
      await simulateAndUpsertCollectionMint({
        ...existing,
        status: "closed",
      });
    }
  }
};
