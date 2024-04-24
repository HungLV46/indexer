import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByCollectionERC1155,
  extractByCollectionERC721,
  extractByTx,
} from "../../orderbook/mints/calldata/detector/zora";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { generateCollectionMintTxData } from "@/orderbook/mints/calldata";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import { MintDetails } from "@reservoir0x/sdk/dist/router/v6/types";

jest.setTimeout(1000 * 1000);

describe("Mints - Zora", () => {
  it("erc1155-public-sale", async () => {
    const collection = `0xafd7b9edc5827f7e39dcd425d8de8d4e1cb292c1`;
    const infos = await extractByCollectionERC1155(collection, "0");
    expect(infos.length).not.toBe(0);
  });

  it("erc721-sale-reward", async () => {
    // goerli
    const collection = `0x6C5D3A872d3B38C1b0fF1fde12Bf2f34297AddCe`;
    const infos = await extractByCollectionERC721(collection);
    expect(infos.length).not.toBe(0);
  });

  it("erc1155-sale-reward", async () => {
    const collection = `0x60d35A892110705a09a7385efF144575F8f5D4cE`;
    const infos = await extractByCollectionERC1155(collection, "1");
    expect(infos.length).not.toBe(0);
    expect(infos[0]?.details.tx.data.signature).toBe("0x9dbb844d");
  });

  it("erc1155-new-case", async () => {
    const collection = `0xbafd92d5e08ddcbf238e96c6c7fe60c53fbbd72f`;
    const transcation = await utils.fetchTransaction(
      "0x0675019757d038516fc479db53d1311719afe0b2df5bccd52eec99c8cbed03eb"
    );
    const infos = await extractByTx(collection, transcation);
    // console.log("infos", infos)
    expect(infos.length).not.toBe(0);
    expect(infos[0]?.details.tx.data.signature).toBe("0x9dbb844d");
  });

  it("multicall", async () => {
    const collection = `0x48f4724fabf58f710c1f97632a93399e441d8ceb`;
    const transcation = await utils.fetchTransaction(
      "0xad0b13a1acac2d99ffaa9d79ea3f8df21e72dc86c03926a1c7a381ec444a72b0"
    );
    const infos = await extractByTx(collection, transcation);
    // console.log("infos", infos)
    expect(infos.length).not.toBe(0);
    expect(infos[0]?.details.tx.data.signature).toBe("0x9dbb844d");
  });

  it("erc20-minter", async () => {
    const collection = `0x953a677ace4d7cd92d39f489ed7ae29f0e7c12e1`;
    const minter = "0xd5c0d17ccb9071d27a4f7ed8255f59989b9aee0d";
    const transcation = await utils.fetchTransaction(
      "0xe2c59c6def4939d62b0336dc80ee6bfe8c3c5392b4f0110cb7e5bf1e270f84db"
    );
    const collectionMints = await extractByTx(collection, transcation);
    // console.log("infos", collectionMints);
    const router = new Sdk.RouterV6.Router(config.chainId, baseProvider);
    expect(collectionMints.length).not.toBe(0);
    const mintDetails: MintDetails[] = [];
    for (const collectionMint of collectionMints) {
      const { txData } = await generateCollectionMintTxData(collectionMint, minter, 1);
      mintDetails.push({
        orderId: String(Math.random()),
        txData,
        fees: [],
        token: collectionMint.contract,
        quantity: 1,
        comment: "",
        currency: collectionMint.currency,
        price: collectionMint.price,
      });
      expect(txData.value).toBe(undefined);
    }
    const mintsResult = await router.fillMintsTx(mintDetails, minter);
    for (const { approvals } of mintsResult.txs) {
      // ERC20 mint requires approvals
      expect(approvals.length).not.toBe(0);
    }
    expect(collectionMints[0]?.details.tx.data.signature).toBe("0xf54f216a");
  });
});
