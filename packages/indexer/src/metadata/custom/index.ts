/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { config } from "@/config/index";
import * as yugaLabs from "./yuga-labs";
import * as bridgeToBase from "./bridge-to-base";
import * as mintTest from "./mint-test";
import * as azuki from "./azuki";
import * as veeFriends from "./vee-friends";

const customCollection: { [key: string]: any } = {};
const custom: { [key: string]: any } = {};
const customTokenURI: { [key: string]: any } = {};

export const hasCustomCollectionHandler = (contract: string) =>
  Boolean(customCollection[`${config.chainId},${contract}`]);

export const hasCustomHandler = (contract: string) =>
  Boolean(custom[`${config.chainId},${contract}`]);

export const hasCustomTokenUriHandler = (contract: string) =>
  Boolean(customTokenURI[`${config.chainId},${contract}`]);

// All of the below methods assume the caller ensured that a custom
// handler exists (eg. via calling the above check methods)

export const customHandleCollection = async (token: any) =>
  customCollection[`${config.chainId},${token.contract}`].fetchCollection(token);

export const customHandleToken = async (token: any) =>
  custom[`${config.chainId},${token.contract}`].fetchToken(token);
export const customHandleContractTokens = async (contract: string, continuation: string) =>
  custom[`${config.chainId},${contract}`].fetchContractTokens(null, continuation);

export const customFetchTokenUriMetadata = async (token: any, uri: string) =>
  customTokenURI[`${config.chainId},${token.contract}`].fetchTokenUriMetadata(token, uri);

////////////////
// Custom Tokens
////////////////

// Yuga Labs
customTokenURI["1,0xe012baf811cf9c05c408e879c399960d1f305903"] = yugaLabs;
customTokenURI["1,0x60e4d786628fea6478f785a6d7e704777c86a7c6"] = yugaLabs;

// Bridge to Base
custom["8453,0xea2a41c02fa86a4901826615f9796e603c6a4491"] = bridgeToBase;

// Mint test
custom["999,0xe6a65c982ffa589a934fa93ab59e6e9646f25763"] = mintTest;

// Azuki
customTokenURI["137,0xc1c2144b3e4e22f4205545e965f52ebc77a1c952"] = azuki;
customTokenURI["137,0xa45b6fb131e9fae666898a64be132e1a78fb7394"] = azuki;
customTokenURI["137,0xa81ac7a8b848ad22e80a1078b5a47f646c1c4510"] = azuki;

// Vee Friends
customTokenURI["11155111,0x901f7cfc8a99a5978a766ddc1c790a6623f3940b"] = veeFriends;
