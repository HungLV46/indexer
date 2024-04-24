import { config as dotEnvConfig } from "dotenv";

dotEnvConfig();

import { getSplitsAddress } from "../../utils/fee-split";
import { jest, describe, it, expect } from "@jest/globals";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import * as orderbookFee from "@/utils/orderbook-fee";

jest.setTimeout(1000 * 1000);

describe("Fee Split", () => {
  it("save-split-fee", async () => {
    const initilaConfig = await getSplitsAddress(
      "test",
      [
        {
          bps: 200,
          recipient: "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
        },
      ],
      {
        bps: 30,
        recipient: "0xeF37d6e83cE06503EC58b201ABa60232bFa0fd69",
      },
      AddressZero
    );

    await getSplitsAddress(
      "test",
      [
        {
          bps: 200,
          recipient: "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
        },
      ],
      {
        bps: 30,
        recipient: "0xeF37d6e83cE06503EC58b201ABa60232bFa0fd69",
      },
      Sdk.Common.Addresses.WNative[config.chainId]
    );

    const finalConfig = await getSplitsAddress(
      "test",
      [
        {
          bps: 200,
          recipient: "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
        },
      ],
      {
        bps: 30,
        recipient: "0xeF37d6e83cE06503EC58b201ABa60232bFa0fd69",
      },
      AddressZero
    );

    const changedConfig = await getSplitsAddress(
      "test",
      [
        {
          bps: 200,
          recipient: "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
        },
      ],
      {
        bps: 300,
        recipient: "0xeF37d6e83cE06503EC58b201ABa60232bFa0fd69",
      },
      AddressZero
    );
    expect(finalConfig?.tokens.includes(Sdk.Common.Addresses.WNative[config.chainId])).toBe(true);
    expect(initilaConfig?.address).toBe(finalConfig?.address);
    expect(initilaConfig?.address).not.toBe(changedConfig?.address);
  });

  it("single-split-fee", async () => {
    const params = {
      fee: ["300", "200"],
      feeRecipient: [
        "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
        "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe6",
      ],
      orderKind: "payment-processor-v2",
      orderbook: "reservoir",
    };

    await orderbookFee.attachOrderbookFee(params as unknown, "testkey");
    expect(params.fee.length).toBe(1);
  });
});
