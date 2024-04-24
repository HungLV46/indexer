import { getCreate2Address } from "@ethersproject/address";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";

import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer, bn } from "@/common/utils";
import { config } from "@/config/index";

type Fee = {
  recipient: string;
  bps: number;
};

type RequiredPaymentSplitData = {
  address: string;
  apiKey: string;
  fees: Fee[];
};

type OptionalPaymentSplitData = {
  isDeployed?: boolean;
  lastDistributionTime?: number;
  createdAt?: number;
  updatedAt?: number;
};

type PaymentSplit = RequiredPaymentSplitData & OptionalPaymentSplitData;

const MAX_BPS = 1e6;

export const supportsPaymentSplits = () =>
  Boolean(Sdk.ZeroExSplits.Addresses.SplitMain[config.chainId]);

export const generatePaymentSplit = async (apiKey: string, originalFee: Fee, reservoirFee: Fee) => {
  try {
    const totalBps = originalFee.bps + reservoirFee.bps;

    // Adjust the total fee percentages to relative fee percentages needed for payment splits
    const splitFees: Fee[] = [];
    for (const fee of [originalFee, reservoirFee]) {
      splitFees.push({
        recipient: fee.recipient,
        bps: Math.round((fee.bps / totalBps) * MAX_BPS),
      });
    }

    // Fix any precision issues by granting the recipient of `originalFee` additional bps units
    const totalSplitFeesBps = splitFees.map((f) => f.bps).reduce((a, b) => a + b);
    if (totalSplitFeesBps < MAX_BPS) {
      splitFees[0].bps += MAX_BPS - totalSplitFeesBps;
    }

    // Just for safety
    if (totalSplitFeesBps !== MAX_BPS) {
      throw new Error("Sum of fees should be exactly 1000000");
    }

    // Sort by recipient
    splitFees.sort((a, b) => (bn(a.recipient).gt(bn(b.recipient)) ? 0 : -1));

    const splitHash = keccak256(
      ["address[]", "uint32[]", "uint32"],
      [splitFees.map((f) => f.recipient), splitFees.map((f) => f.bps), 0]
    );
    const splitAddress = getCreate2Address(
      Sdk.ZeroExSplits.Addresses.SplitMain[config.chainId],
      splitHash,
      keccak256(["bytes"], [Sdk.ZeroExSplits.Addresses.SplitWalletInitCode[config.chainId]])
    );

    let existingSplit = await getPaymentSplitFromDb(splitAddress);
    if (!existingSplit) {
      await savePaymentSplit({
        address: splitAddress,
        apiKey,
        fees: splitFees,
      });

      existingSplit = await getPaymentSplitFromDb(splitAddress);
    }

    return existingSplit;
  } catch {
    // Skip errors
  }

  return undefined;
};

export const getPaymentSplitFromDb = async (address: string): Promise<PaymentSplit | undefined> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        payment_splits.address,
        payment_splits.api_key,
        payment_splits.is_deployed,
        payment_splits_recipients.recipient,
        payment_splits_recipients.amount_bps,
        extract(epoch FROM payment_splits.last_distribution_time) AS last_distribution_time,
        extract(epoch FROM payment_splits.created_at) AS created_at,
        extract(epoch FROM payment_splits.updated_at) AS updated_at
      FROM payment_splits
      JOIN payment_splits_recipients
        ON payment_splits.address = payment_splits_recipients.payment_split_address
      WHERE payment_splits.address = $/address/
    `,
    { address: toBuffer(address) }
  );
  if (!results.length) {
    return undefined;
  }

  return {
    address,
    fees: results.map((r) => ({
      recipient: fromBuffer(r.recipient),
      bps: r.amount_bps,
    })),
    apiKey: results[0].api_key,
    isDeployed: results[0].is_deployed,
    lastDistributionTime: results[0].last_distribution_time,
    createdAt: results[0].created_at,
    updatedAt: results[0].updated_at,
  };
};

export const savePaymentSplit = async (paymentSplit: RequiredPaymentSplitData) => {
  const columns = new pgp.helpers.ColumnSet(["payment_split_address", "recipient", "amount_bps"], {
    table: "payment_splits_recipients",
  });

  await idb.none(
    `
      INSERT INTO payment_splits(
        address,
        api_key
      ) VALUES (
        $/address/,
        $/apiKey/
      ) ON CONFLICT DO NOTHING;
      ${
        pgp.helpers.insert(
          paymentSplit.fees.map((f) => ({
            payment_split_address: toBuffer(paymentSplit.address),
            recipient: toBuffer(f.recipient),
            amount_bps: f.bps,
          })),
          columns
        ) + " ON CONFLICT DO NOTHING"
      }
    `,
    {
      address: toBuffer(paymentSplit.address),
      apiKey: paymentSplit.apiKey,
    }
  );
};
