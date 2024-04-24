import { ChainIdToAddress, Network } from "../utils";

export const SplitMain: ChainIdToAddress = {
  [Network.Ethereum]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.EthereumSepolia]: "0x54e4a6014d36c381fc43b7e24a1492f556139a6f",
  [Network.Optimism]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Polygon]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Base]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Arbitrum]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Avalanche]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Zora]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
  [Network.Blast]: "0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee",
};

export const SplitWallet: ChainIdToAddress = {
  [Network.Ethereum]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.EthereumSepolia]: "0x5133d74b4ba8e0a7805a2a14bb50c9e23f50bcc9",
  [Network.Optimism]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Polygon]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Base]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Arbitrum]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Avalanche]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Zora]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
  [Network.Blast]: "0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33",
};

export const getInitCode = (network: Network) =>
  `0x3d605d80600a3d3981f336603057343d52307f830d2d700a97af574b186c80d40429385d24241565b08a7c559ba283a964d9b160203da23d3df35b3d3d3d3d363d3d37363d73${SplitWallet[
    network
  ].slice(2)}5af43d3d93803e605b57fd5bf3`;

export const SplitWalletInitCode: ChainIdToAddress = {
  [Network.Ethereum]: getInitCode(Network.Ethereum),
  [Network.EthereumSepolia]: getInitCode(Network.EthereumSepolia),
  [Network.Optimism]: getInitCode(Network.Optimism),
  [Network.Polygon]: getInitCode(Network.Polygon),
  [Network.Base]: getInitCode(Network.Base),
  [Network.Arbitrum]: getInitCode(Network.Arbitrum),
  [Network.Avalanche]: getInitCode(Network.Avalanche),
  [Network.Zora]: getInitCode(Network.Zora),
  [Network.Blast]: getInitCode(Network.Blast),
};
