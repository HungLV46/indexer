import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { idb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";

import * as v1 from "@/utils/erc721c/v1";
import * as v2 from "@/utils/erc721c/v2";

export { v1, v2 };

export const refreshConfig = async (contract: string) => {
  const version = await getVersion(contract);
  version === "v1" ? await v1.refreshConfig(contract) : await v2.refreshConfig(contract);
};

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const v1Config = await v1.getConfigFromDb(contract);
  if (v1Config) {
    return v1.checkMarketplaceIsFiltered(contract, operators);
  }

  const v2Config = await v2.getConfigFromDb(contract);
  if (v2Config) {
    return v2.checkMarketplaceIsFiltered(contract, operators);
  }

  return false;
};

export const getVersion = async (contract: string) => {
  const token = new Contract(
    contract,
    new Interface(["function getTransferValidator() view returns (address)"]),
    baseProvider
  );

  // We assume all collections pointing to a validator which has returns a
  // valid response from the `getCollectionSecurityPolicyV2` method are on
  // the ERC721c v2 standard, everything else defaulting to v1.
  const transferValidatorAddress = await token.getTransferValidator();
  const transferValidator = new Contract(
    transferValidatorAddress,
    new Interface([
      `
        function getCollectionSecurityPolicyV2(address collection) view returns (
          uint8 transferSecurityLevel,
          uint120 listId
        )
      `,
    ]),
    baseProvider
  );
  try {
    await transferValidator.getCollectionSecurityPolicyV2(contract);
    return "v2";
  } catch {
    // Skip errors
  }

  return "v1";
};

export const isVerifiedEOA = async (transferValidator: string, address: string) => {
  const result = await idb.oneOrNone(
    `
      SELECT
        1
      FROM erc721c_verified_eoas
      WHERE erc721c_verified_eoas.transfer_validator = $/transferValidator/
        AND erc721c_verified_eoas.address = $/address/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      address: toBuffer(address),
    }
  );
  return Boolean(result);
};

export const saveVerifiedEOA = async (transferValidator: string, address: string) =>
  idb.none(
    `
      INSERT INTO erc721c_verified_eoas(
        transfer_validator,
        address
      ) VALUES (
        $/transferValidator/,
        $/address/
      ) ON CONFLICT DO NOTHING
    `,
    {
      transferValidator: toBuffer(transferValidator),
      address: toBuffer(address),
    }
  );
