import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";

enum TransferSecurityLevel {
  Recommended,
  One,
  Two,
  Three,
  Four,
  Five,
  Six,
  Seven,
  Eight,
}

export type ERC721CV2Config = {
  transferValidator: string;
  transferSecurityLevel: TransferSecurityLevel;
  listId: string;
  blacklist: List;
  whitelist: List;
};

export type List = {
  accounts: string[];
  codeHashes: string[];
};

const getConfig = async (contract: string): Promise<ERC721CV2Config | undefined> => {
  try {
    const token = new Contract(
      contract,
      new Interface(["function getTransferValidator() view returns (address)"]),
      baseProvider
    );

    const transferValidatorAddress = await token
      .getTransferValidator()
      .then((address: string) => address.toLowerCase());

    const osCustomTransferValidator =
      Sdk.SeaportBase.Addresses.OpenSeaCustomTransferValidator[config.chainId];

    if (transferValidatorAddress === AddressZero) {
      // The collection doesn't use any transfer validator anymore
      await deleteConfig(contract);
    } else if (
      osCustomTransferValidator &&
      transferValidatorAddress === osCustomTransferValidator
    ) {
      // The collection uses OpenSea's custom transfer validator
      const slot = keccak256(["uint256", "uint256"], [contract, 2]);
      const rawResult = await baseProvider.getStorageAt(contract, slot);

      const listId = bn("0x" + rawResult.slice(-30)).toString();
      const policyBypassed = Boolean(bn("0x" + rawResult.slice(-32, -30)).toNumber());
      const blacklistBased = Boolean(bn("0x" + rawResult.slice(-34, -32)).toNumber());
      const directTransfersDisabled = Boolean(bn("0x" + rawResult.slice(-36, -34)).toNumber());
      const contractRecipientsDisabled = Boolean(bn("0x" + rawResult.slice(-38, -36)).toNumber());
      const signatureRegistrationRequired = Boolean(
        bn("0x" + rawResult.slice(-40, -38)).toNumber()
      );

      let transferSecurityLevel: TransferSecurityLevel;

      const [a, b, c, d, e] = [
        policyBypassed,
        blacklistBased,
        directTransfersDisabled,
        contractRecipientsDisabled,
        signatureRegistrationRequired,
      ];
      if (a && !b && !c && !d && !e) {
        transferSecurityLevel = TransferSecurityLevel.One;
      } else if (!a && b && !c && !d && !e) {
        transferSecurityLevel = TransferSecurityLevel.Two;
      } else if (!a && !b && !c && !d && !e) {
        transferSecurityLevel = TransferSecurityLevel.Three;
      } else if (!a && !b && c && !d && !e) {
        transferSecurityLevel = TransferSecurityLevel.Four;
      } else if (!a && !b && !c && d && !e) {
        transferSecurityLevel = TransferSecurityLevel.Five;
      } else if (!a && !b && !c && !d && e) {
        transferSecurityLevel = TransferSecurityLevel.Six;
      } else if (!a && !b && c && d && !e) {
        transferSecurityLevel = TransferSecurityLevel.Seven;
      } else if (!a && !b && c && !d && e) {
        transferSecurityLevel = TransferSecurityLevel.Eight;
      } else {
        throw new Error("Unreachable");
      }

      const transferValidator = new Contract(
        transferValidatorAddress,
        new Interface([
          "function getAuthorizerAccounts(uint120 listId) view returns (address[] accounts)",
        ]),
        baseProvider
      );
      const authorizers: string[] = await transferValidator.getAuthorizerAccounts(listId);

      // The below code is not correct, since only orders using the OpenSea zone are fillable
      // and not all orders using the OpenSea conduit. However this simple approach should be
      // enough for now.

      // Grant the OpenSea conduit if the authorizer
      const additionalContracts: string[] = [];
      if (
        authorizers.find(
          (authorizer) =>
            authorizer.toLowerCase() ===
            Sdk.SeaportBase.Addresses.OpenSeaV16SignedZone[config.chainId]
        )
      ) {
        additionalContracts.push(
          new Sdk.SeaportBase.ConduitController(config.chainId).deriveConduit(
            Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
          )
        );
      }

      return {
        transferValidator: transferValidatorAddress.toLowerCase(),
        transferSecurityLevel,
        listId,
        whitelist: await refreshWhitelist(transferValidatorAddress, listId, additionalContracts),
        blacklist: await refreshBlacklist(transferValidatorAddress, listId, additionalContracts),
      };
    } else {
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

      const securityPolicy = await transferValidator.getCollectionSecurityPolicyV2(contract);

      const listId = securityPolicy.listId.toString();

      return {
        transferValidator: transferValidatorAddress.toLowerCase(),
        transferSecurityLevel: securityPolicy.transferSecurityLevel,
        listId,
        whitelist: await refreshWhitelist(transferValidatorAddress, listId),
        blacklist: await refreshBlacklist(transferValidatorAddress, listId),
      };
    }
  } catch {
    // Skip errors
  }

  return undefined;
};

export const getConfigFromDb = async (contract: string): Promise<ERC721CV2Config | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        erc721c_v2_configs.*,
        erc721c_v2_lists.blacklist,
        erc721c_v2_lists.whitelist
      FROM erc721c_v2_configs
      LEFT JOIN erc721c_v2_lists
        ON erc721c_v2_configs.transfer_validator = erc721c_v2_lists.transfer_validator
        AND erc721c_v2_configs.list_id = erc721c_v2_lists.id
      WHERE erc721c_v2_configs.contract = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  if (!result) {
    return undefined;
  }

  return {
    transferValidator: fromBuffer(result.transfer_validator),
    transferSecurityLevel: result.transfer_security_level,
    listId: result.list_id,
    whitelist: result.whitelist ?? [],
    blacklist: result.blacklist ?? [],
  };
};

const deleteConfig = async (contract: string) => {
  await idb.none("DELETE FROM erc721c_v2_configs WHERE contract = $/contract/", {
    contract: toBuffer(contract),
  });
};

export const refreshConfig = async (contract: string) => {
  const config = await getConfig(contract);
  if (config) {
    await idb.none(
      `
        INSERT INTO erc721c_v2_configs (
          contract,
          transfer_validator,
          transfer_security_level,
          list_id
        ) VALUES (
          $/contract/,
          $/transferValidator/,
          $/transferSecurityLevel/,
          $/listId/
        )
        ON CONFLICT (contract)
        DO UPDATE SET
          transfer_validator = $/transferValidator/,
          transfer_security_level = $/transferSecurityLevel/,
          list_id = $/listId/,
          updated_at = now()
      `,
      {
        contract: toBuffer(contract),
        transferValidator: toBuffer(config.transferValidator),
        transferSecurityLevel: config.transferSecurityLevel,
        listId: config.listId,
      }
    );

    return config;
  }

  return undefined;
};

export const refreshWhitelist = async (
  transferValidator: string,
  id: string,
  contractsToAdd?: string[]
) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getWhitelistedAccounts(uint120 id) public view returns (address[])",
      "function getWhitelistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getWhitelistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getWhitelistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()))
    .catch(() => []);

  const whitelist = {
    accounts: [...accounts, ...(contractsToAdd ?? [])],
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_lists(
        transfer_validator,
        id,
        blacklist,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/blacklist:json/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        whitelist = $/whitelist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      blacklist: [],
      whitelist,
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
        AND erc721c_v2_configs.list_id = $/id/
        AND erc721c_v2_configs.transfer_security_level IN (0, 3, 4, 5, 6, 7, 8)
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
    }
  );

  // Invalid any orders relying on blacklisted operators
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        origin: "erc721c-v2",
        contract: fromBuffer(c.contract),
        whitelistedOperators: whitelist.accounts,
        status: "inactive",
      },
    }))
  );

  return whitelist;
};

export const refreshBlacklist = async (
  transferValidator: string,
  id: string,
  contractsToSkip?: string[]
) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getBlacklistedAccounts(uint120 id) public view returns (address[])",
      "function getBlacklistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getBlacklistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getBlacklistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()))
    .catch(() => []);

  const blacklist = {
    accounts: accounts.filter((account) => !(contractsToSkip ?? []).includes(account)),
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_lists(
        transfer_validator,
        id,
        blacklist,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/blacklist:json/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        blacklist = $/blacklist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      blacklist,
      whitelist: [],
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
        AND erc721c_v2_configs.list_id = $/id/
        AND erc721c_v2_configs.transfer_security_level IN (2)
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
    }
  );

  // Invalid any orders relying on blacklisted operators
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        origin: "erc721c-v2",
        contract: fromBuffer(c.contract),
        blacklistedOperators: blacklist.accounts,
        status: "inactive",
      },
    }))
  );

  return blacklist;
};

const getListByConfig = (
  config: ERC721CV2Config
): {
  whitelist?: string[];
  blacklist?: string[];
} => {
  switch (config.transferSecurityLevel) {
    // No restrictions
    case TransferSecurityLevel.One: {
      return {};
    }

    // Blacklist restrictions
    case TransferSecurityLevel.Two: {
      return {
        blacklist: config.blacklist.accounts,
      };
    }

    // Whitelist restrictions
    default: {
      return {
        whitelist: config.whitelist.accounts,
      };
    }
  }
};

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const config = await getConfigFromDb(contract);
  if (!config) {
    throw new Error("Missing config");
  }

  const { whitelist, blacklist } = getListByConfig(config);

  if (whitelist) {
    return whitelist.length ? operators.some((op) => !whitelist.includes(op)) : true;
  } else if (blacklist) {
    return blacklist.length ? operators.some((op) => blacklist.includes(op)) : false;
  } else {
    return false;
  }
};
