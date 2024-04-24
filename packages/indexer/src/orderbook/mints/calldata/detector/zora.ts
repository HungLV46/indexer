import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { AllowlistItem, allowlistExists, createAllowlist } from "@/orderbook/mints/allowlists";
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import { getContractKind } from "@/orderbook/orders/common/helpers";

const STANDARD = "zora";

export type Info = {
  minter?: string;
};

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const c = new Contract(
    collection,
    new Interface([
      "function computeTotalReward(uint256 mintPrice, uint256 numTokens) view returns (uint256)",
      "function computeTotalReward(uint256 numTokens) view returns (uint256)",
      `
        function saleDetails() view returns (
          (
            bool publicSaleActive,
            bool presaleActive,
            uint256 publicSalePrice,
            uint64 publicSaleStart,
            uint64 publicSaleEnd,
            uint64 presaleStart,
            uint64 presaleEnd,
            bytes32 presaleMerkleRoot,
            uint256 maxSalePurchasePerAddress,
            uint256 totalMinted,
            uint256 maxSupply
          )
        )
      `,
      "function zoraFeeForAmount(uint256 quantity) view returns (address recipient, uint256 fee)",
    ]),
    baseProvider
  );

  try {
    const saleDetails = await c.saleDetails();
    const fee = await c.zoraFeeForAmount(1).then((f: { fee: BigNumber }) => f.fee);

    let totalRewards: BigNumber | undefined;
    try {
      totalRewards = await c["computeTotalReward(uint256)"](1);
    } catch {
      // Skip error for old version
    }
    try {
      totalRewards = await c["computeTotalReward(uint256,uint256)"](bn(10).pow(18), 1);
    } catch {
      // Skip error for old version
    }

    // Public sale
    if (saleDetails.publicSaleActive) {
      // price = on-chain-price + fee
      const price = bn(saleDetails.publicSalePrice).add(fee).toString();

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
            data:
              totalRewards == undefined
                ? {
                    // `purchase`
                    signature: "0xefef39a1",
                    params: [
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                    ],
                  }
                : {
                    // `mintWithRewards`
                    signature: "0x45368181",
                    params: [
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "comment",
                        abiType: "string",
                      },
                      {
                        kind: "referrer",
                        abiType: "address",
                      },
                    ],
                  },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price,
        maxMintsPerWallet: toSafeNumber(saleDetails.maxSalePurchasePerAddress),
        maxSupply: toSafeNumber(saleDetails.maxSupply),
        startTime: toSafeTimestamp(saleDetails.publicSaleStart),
        endTime: toSafeTimestamp(saleDetails.publicSaleEnd),
      });
    }

    // Presale
    if (saleDetails.presaleActive) {
      const merkleRoot = saleDetails.presaleMerkleRoot;
      if (!(await allowlistExists(merkleRoot))) {
        await axios
          .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
          .then(({ data }) => data)
          .then(
            async (data: { entries: { user: string; price: string; maxCanMint: number }[] }) => {
              return data.entries.map(
                (e) =>
                  ({
                    address: e.user,
                    maxMints: String(e.maxCanMint),
                    // price = on-chain-price
                    price: e.price,
                    // actualPrice = on-chain-price + fee
                    actualPrice: bn(e.price).add(fee).toString(),
                  } as AllowlistItem)
              );
            }
          )
          .then((items) => createAllowlist(merkleRoot, items));
      }

      results.push({
        collection,
        contract: collection,
        stage: "presale",
        kind: "allowlist",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data:
              totalRewards == undefined
                ? {
                    // `purchasePresale`
                    signature: "0x25024a2b",
                    params: [
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "bytes32[]",
                      },
                    ],
                  }
                : {
                    // `purchasePresaleWithRewards`
                    signature: "0xae6e7875",
                    params: [
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "bytes32[]",
                      },
                      {
                        kind: "comment",
                        abiType: "string",
                      },
                      {
                        kind: "referrer",
                        abiType: "address",
                      },
                    ],
                  },
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        maxSupply: toSafeNumber(saleDetails.maxSupply),
        startTime: toSafeTimestamp(saleDetails.presaleStart),
        endTime: toSafeTimestamp(saleDetails.presaleEnd),
        allowlistId: merkleRoot,
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

export const extractByCollectionERC1155 = async (
  collection: string,
  tokenId: string,
  minter?: string
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const c = new Contract(
    collection,
    new Interface([
      "function computeTotalReward(uint256 numTokens) view returns (uint256)",
      "function computeTotalReward(uint256 mintPrice, uint256 numTokens) view returns (uint256)",
      "function getPermissions(uint256 tokenId, address user) view returns (uint256)",
      "function permissions(uint256 tokenId, address user) view returns (uint256)",
      "function mintFee() external view returns(uint256)",
      `function getTokenInfo(uint256 tokenId) view returns (
        (
          string uri,
          uint256 maxSupply,
          uint256 totalMinted
        )
      )`,
    ]),
    baseProvider
  );

  try {
    let totalRewards: BigNumber | undefined;
    try {
      totalRewards = await c["computeTotalReward(uint256)"](1);
    } catch {
      // Skip error for old version
    }
    try {
      totalRewards = await c["computeTotalReward(uint256,uint256)"](bn(10).pow(18), 1);
    } catch {
      // Skip error for old version
    }

    const defaultMinters: string[] = minter ? [minter] : [];
    for (const factory of [
      Sdk.Zora.Addresses.ERC1155Factory[config.chainId],
      Sdk.Zora.Addresses.ERC1155FactoryV2[config.chainId],
    ]) {
      try {
        const zoraFactory = new Contract(
          factory,
          new Interface(["function defaultMinters() view returns (address[])"]),
          baseProvider
        );
        defaultMinters.push(...(await zoraFactory.defaultMinters()));
      } catch {
        // Skip errors
      }
    }

    // Some known minters
    for (const minter of [
      Sdk.Zora.Addresses.ERC1155ZoraMerkleMinter[config.chainId],
      Sdk.Zora.Addresses.ERC1155ZoraFixedPriceEMinter[config.chainId],
    ]) {
      if (minter) {
        defaultMinters.push(minter);
      }
    }

    for (const minter of defaultMinters) {
      // Try both `getPermissions` and `permissions` to cover as many versions as possible
      const permissions = await c
        .getPermissions(tokenId, minter)
        .catch(() => c.permissions(tokenId, minter));

      // Need to have mint permissions
      if (permissions.toNumber() === 4) {
        const s = new Contract(
          minter,
          new Interface(["function contractName() external view returns (string memory)"]),
          baseProvider
        );

        const contractName = await s.contractName();
        if (contractName === "Fixed Price Sale Strategy") {
          const fixedSale = new Contract(
            minter,
            new Interface([
              `function sale(address tokenContract, uint256 tokenId) view returns (
                (
                  uint64 saleStart,
                  uint64 saleEnd,
                  uint64 maxTokensPerAddress,
                  uint96 pricePerToken,
                  address fundsRecipient
                )
              )`,
            ]),
            baseProvider
          );

          const [saleConfig, tokenInfo, mintFee] = await Promise.all([
            fixedSale.sale(collection, tokenId),
            c.getTokenInfo(tokenId),
            c.mintFee(),
          ]);

          const price = saleConfig.pricePerToken.add(mintFee).toString();
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
                data:
                  totalRewards == undefined
                    ? {
                        // `mint`
                        signature: "0x731133e9",
                        params: [
                          {
                            kind: "unknown",
                            abiType: "address",
                            abiValue: minter.toLowerCase(),
                          },
                          {
                            kind: "unknown",
                            abiType: "uint256",
                            abiValue: tokenId,
                          },
                          {
                            kind: "quantity",
                            abiType: "uint256",
                          },
                          {
                            kind: "custom",
                            abiType: "bytes",
                          },
                        ],
                      }
                    : {
                        // `mintWithRewards`
                        signature: "0x9dbb844d",
                        params: [
                          {
                            kind: "unknown",
                            abiType: "address",
                            abiValue: minter.toLowerCase(),
                          },
                          {
                            kind: "unknown",
                            abiType: "uint256",
                            abiValue: tokenId,
                          },
                          {
                            kind: "quantity",
                            abiType: "uint256",
                          },
                          {
                            kind: "custom",
                            abiType: "bytes",
                          },
                          {
                            kind: "referrer",
                            abiType: "address",
                          },
                        ],
                      },
              },
              info: minter ? { minter } : undefined,
            },
            tokenId,
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price,
            maxMintsPerWallet: toSafeNumber(saleConfig.maxTokensPerAddress),
            maxSupply: toSafeNumber(tokenInfo.maxSupply),
            startTime: toSafeTimestamp(saleConfig.saleStart),
            endTime: toSafeTimestamp(saleConfig.saleEnd),
          });
        } else if (contractName === "Merkle Tree Sale Strategy") {
          const merkleSale = new Contract(
            minter,
            new Interface([
              `function sale(address tokenContract, uint256 tokenId) view returns (
                (
                  uint64 presaleStart,
                  uint64 presaleEnd,
                  address fundsRecipient,
                  bytes32 merkleRoot
                )
              )`,
            ]),
            baseProvider
          );

          const [saleConfig, tokenInfo, mintFee] = await Promise.all([
            merkleSale.sale(collection, tokenId),
            c.getTokenInfo(tokenId),
            c.mintFee(),
          ]);

          const merkleRoot = merkleSale.merkleRoot;
          if (!(await allowlistExists(merkleRoot))) {
            await axios
              .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
              .then(({ data }) => data)
              .then(
                async (data: {
                  entries: { user: string; price: string; maxCanMint: number }[];
                }) => {
                  return data.entries.map(
                    (e) =>
                      ({
                        address: e.user,
                        maxMints: String(e.maxCanMint),
                        // price = on-chain-price
                        price: e.price,
                        // actualPrice = on-chain-price + fee
                        actualPrice: bn(e.price).add(mintFee).toString(),
                      } as AllowlistItem)
                  );
                }
              )
              .then((items) => createAllowlist(merkleRoot, items));
          }

          results.push({
            collection,
            contract: collection,
            stage: "presale",
            kind: "allowlist",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: collection,
                data:
                  totalRewards == undefined
                    ? {
                        // `mint`
                        signature: "0x731133e9",
                        params: [
                          {
                            kind: "unknown",
                            abiType: "address",
                            abiValue: minter.toLowerCase(),
                          },
                          {
                            kind: "unknown",
                            abiType: "uint256",
                            abiValue: tokenId.toString(),
                          },
                          {
                            kind: "quantity",
                            abiType: "uint256",
                          },
                          {
                            kind: "allowlist",
                            abiType: "bytes",
                          },
                        ],
                      }
                    : {
                        // `mintWithRewards`
                        signature: "0x9dbb844d",
                        params: [
                          {
                            kind: "unknown",
                            abiType: "address",
                            abiValue: minter.toLowerCase(),
                          },
                          {
                            kind: "unknown",
                            abiType: "uint256",
                            abiValue: tokenId.toString(),
                          },
                          {
                            kind: "quantity",
                            abiType: "uint256",
                          },
                          {
                            kind: "allowlist",
                            abiType: "bytes",
                          },
                          {
                            kind: "referrer",
                            abiType: "address",
                          },
                        ],
                      },
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            maxSupply: toSafeNumber(tokenInfo.maxSupply),
            startTime: toSafeTimestamp(saleConfig.presaleStart),
            endTime: toSafeTimestamp(saleConfig.presaleEnd),
            allowlistId: merkleRoot,
          });
        } else if (contractName === "ERC20 Minter") {
          const erc20Minter = new Contract(
            minter,
            new Interface([
              `function sale(address tokenContract, uint256 tokenId) view returns (
                (
                  uint64 saleStart,
                  uint64 saleEnd,
                  uint64 maxTokensPerAddress,
                  uint96 pricePerToken,
                  address fundsRecipient,
                  address currency
                )
              )`,
            ]),
            baseProvider
          );

          const [saleConfig, tokenInfo] = await Promise.all([
            erc20Minter.sale(collection, tokenId),
            c.getTokenInfo(tokenId),
          ]);

          const currency = saleConfig.currency.toLowerCase();

          // No need to include the mint fee
          const price = saleConfig.pricePerToken.toString();

          results.push({
            collection,
            contract: collection,
            stage: "public-sale",
            kind: "public",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: minter,
                data: {
                  // `mint`
                  signature: "0xf54f216a",
                  params: [
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                    {
                      kind: "quantity",
                      abiType: "uint256",
                    },
                    {
                      kind: "unknown",
                      abiType: "address",
                      abiValue: collection,
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: tokenId,
                    },
                    {
                      kind: "price",
                      abiType: "uint256",
                    },
                    {
                      kind: "unknown",
                      abiType: "address",
                      abiValue: currency,
                    },
                    {
                      kind: "referrer",
                      abiType: "address",
                    },
                    {
                      kind: "comment",
                      abiType: "string",
                    },
                  ],
                },
              },
              info: minter ? { minter } : undefined,
            },
            tokenId,
            currency,
            price,
            maxMintsPerWallet: toSafeNumber(saleConfig.maxTokensPerAddress),
            maxSupply: toSafeNumber(tokenInfo.maxSupply),
            startTime: toSafeTimestamp(saleConfig.saleStart),
            endTime: toSafeTimestamp(saleConfig.saleEnd),
          });
        }

        break;
      }
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
  rootTx: Transaction
): Promise<CollectionMint[]> => {
  const nestedTxs: Transaction[] = [rootTx];

  const isMulticall = rootTx.data.startsWith("0xac9650d8");
  if (isMulticall) {
    try {
      const multicall = new Interface(["function multicall(bytes[] calls)"]).decodeFunctionData(
        "multicall",
        rootTx.data
      );

      for (const call of multicall.calls) {
        nestedTxs.push({
          ...rootTx,
          data: call,
        });
      }
    } catch {
      // Skip errors
    }
  }

  for (const tx of nestedTxs) {
    // ERC721
    if (
      [
        "0xefef39a1", // `purchase`
        "0x03ee2733", // `purchaseWithComment`
        "0x25024a2b", // `purchasePresale`
        "0x2e706b5a", // `purchasePresaleWithComment`
        "0x45368181", // `mintWithRewards`
        "0xae6e7875", // `purchasePresaleWithRewards`
      ].some((bytes4) => tx.data.startsWith(bytes4))
    ) {
      return extractByCollectionERC721(collection);
    }

    // ERC1155
    if (
      [
        "0x731133e9", // `mint`
        "0x359f1302", // `mint`
        "0x9dbb844d", // `mintWithRewards`
        "0xc9a05470", // `premint`
        "0xd904b94a", // `callSale`
        "0xf54f216a", // `ERC20Minter.mint`
      ].some((bytes4) => tx.data.startsWith(bytes4))
    ) {
      const iface = new Interface([
        "function mint(address minter, uint256 tokenId, uint256 quantity, bytes data)",
        "function mint(address minter, uint256 tokenId, uint256 quantity, address[] rewardsRecipients, bytes data)",
        "function mintWithRewards(address minter, uint256 tokenId, uint256 quantity, bytes minterArguments, address mintReferral)",
        "function premint((address, string, string) contractConfig, ((string, uint256, uint64, uint96, uint64, uint64, uint32, uint32, address, address), uint32 tokenId, uint32, bool) premintConfig, bytes signature, uint256 quantityToMint, string mintComment)",
        "function callSale(uint256 tokenId, address salesConfig, bytes data)",
        "function mint(address mintTo, uint256 quantity, address tokenAddress, uint256 tokenId, uint256 totalValue, address currency, address mintReferral, string comment)",
      ]);

      let tokenId: string;
      let minter: string | undefined;
      switch (tx.data.slice(0, 10)) {
        case "0x731133e9":
          tokenId = iface
            .decodeFunctionData(
              "mint(address minter, uint256 tokenId, uint256 quantity, bytes data)",
              tx.data
            )
            .tokenId.toString();
          break;

        case "0x359f1302":
          tokenId = iface
            .decodeFunctionData(
              "mint(address minter, uint256 tokenId, uint256 quantity, address[] rewardsRecipients, bytes data)",
              tx.data
            )
            .tokenId.toString();
          break;

        case "0x9dbb844d": {
          const parseArgs = iface.decodeFunctionData("mintWithRewards", tx.data);
          tokenId = parseArgs.tokenId.toString();
          minter = parseArgs.minter.toLowerCase();
          break;
        }

        case "0xd904b94a": {
          tokenId = iface.decodeFunctionData("callSale", tx.data).tokenId.toString();
          break;
        }

        case "0xf54f216a": {
          minter = tx.to;
          tokenId = iface
            .decodeFunctionData(
              "mint(address mintTo, uint256 quantity, address tokenAddress, uint256 tokenId, uint256 totalValue, address currency, address mintReferral, string comment)",
              tx.data
            )
            .tokenId.toString();
          break;
        }

        case "0xc9a05470":
          tokenId = String(iface.decodeFunctionData("premint", tx.data).premintConfig.tokenId);
          break;
      }

      return extractByCollectionERC1155(collection, tokenId!, minter);
    }
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

  const refresh = async (tokenId?: string, minter?: string) => {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = tokenId
      ? await extractByCollectionERC1155(collection, tokenId, minter)
      : await extractByCollectionERC721(collection);
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

  const kind = await getContractKind(collection);
  if (kind === "erc1155") {
    const tokenIds = await idb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
        LIMIT 1000
      `,
      {
        contract: toBuffer(collection),
      }
    );
    await Promise.all(tokenIds.map(async ({ token_id }) => refresh(token_id)));
  } else {
    await Promise.all(
      existingCollectionMints.map(async ({ tokenId, details }) =>
        refresh(tokenId, (details.info as Info | undefined)?.minter)
      )
    );
  }
};

type ProofValue = {
  proof: string[];
  user: string;
  price: string;
  maxCanMint: number;
};

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${collectionMint.tokenId}-${address}`;

  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(`https://allowlist.zora.co/allowed?user=${address}&root=${collectionMint.allowlistId}`)
      .then(({ data }: { data: ProofValue[] }) => {
        data[0].proof = data[0].proof.map((item) => `0x${item}`);
        return data[0];
      });

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
    }
  }

  return result;
};
