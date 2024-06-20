import { ChainIdToAddress, Network } from "../utils";

export const Exchange: ChainIdToAddress = {
  [Network.Ethereum]: "0x6170b3c3a54c3d8c854934cbc314ed479b2b29a3",
  [Network.EthereumGoerli]: "0xd8be3e8a8648c4547f06e607174bac36f5684756",
  [Network.Polygon]: "0x3634e984ba0373cfa178986fd19f03ba4dd8e469",
  [Network.EvmosTestnet]: "0xE49a78aafcAFA57a7795B42A68b7b02D7f481baC",
  [Network.AuraTestnet]: "0x3ca4841C584afd6fa1AB248cE0F4876d1CEBd09C",
  [Network.AuraSerenity]: "0xc3A73d1b9870FEdDb782237aa8AF50167a5016A9",
  [Network.AuraEuphoria]: "0xA371d16fFDF669bB8A5A005D9e3476B41db756b2",
  [Network.AuraXstasy]: "0xFfC170cF1F6cDF421877793d1b8A9a13ead49e0e",
};

export const AuctionHouse: ChainIdToAddress = {
  [Network.Ethereum]: "0xe468ce99444174bd3bbbed09209577d25d1ad673",
};

export const ModuleManager: ChainIdToAddress = {
  [Network.Ethereum]: "0x850a7c6fe2cf48eea1393554c8a3ba23f20cc401",
  [Network.EthereumGoerli]: "0x9458e29713b98bf452ee9b2c099289f533a5f377",
  [Network.Polygon]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
  [Network.EvmosTestnet]: "0x6779178Ba139A61890A0B05a15045dF2ED0ae2dd",
  [Network.AuraTestnet]: "0x6B1Cc558DA2f0d909aD16FA29F2D74bF7A8cA6B4",
  [Network.AuraSerenity]: "0x072e1b72e39aa018de54091CF6625dBDf227b3B4",
  [Network.AuraEuphoria]: "0xcdDe41b8F12182F7D25d1A2f35ADdA971Aa58FcA",
  [Network.AuraXstasy]: "0x6FD4720cBe77f0c7bbE8263938f38e77D9efEE6A",
};

export const Erc721TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
  [Network.EthereumGoerli]: "0xd1adaf05575295710de1145c3c9427c364a70a7f",
  [Network.Polygon]: "0xce6cef2a9028e1c3b21647ae3b4251038109f42a",
  [Network.EvmosTestnet]: "0x7a56178610624943aeDF11Ce7b7C9d991aFBCc36",
  [Network.AuraTestnet]: "0x9f075Deab9a7433f0A5541d235a57db1cA491E0a",
  [Network.AuraSerenity]: "0x6944F3183F54757a8deaC2aEb9d4D3d64cb985f1",
  [Network.AuraEuphoria]: "0x364Fe4DcB58363fa1a298207B5Ed54F875835aBf",
  [Network.AuraXstasy]: "0xD43f62921bE6d42fe87a0336841431cfFd57F0Eb",
};

export const Erc20TransferHelper: ChainIdToAddress = {
  [Network.Ethereum]: "0xcca379fdf4beda63c4bb0e2a3179ae62c8716794",
  [Network.EthereumGoerli]: "0x53172d999a299198a935f9e424f9f8544e3d4292",
  [Network.Polygon]: "0x909e9efe4d87d1a6018c2065ae642b6d0447bc91",
  [Network.EvmosTestnet]: "0xE30E6Fb2c7f2A24a770cfa7E2c31a989D24AC616",
  [Network.AuraTestnet]: "0xbeA9f83Dc816f0Df3F7fB43a288BE9fF211C3E7A",
  [Network.AuraSerenity]: "0x71B65250BF5ED67321D318A3a7dB46c7616fa154",
  [Network.AuraEuphoria]: "0xBB1dEE78eF86cdBe3ea92cA4ab60D3895d875d0f",
  [Network.AuraXstasy]: "0xbF3B5f77aBE83eE878cA0205a8b9A59d2AF256F7",
};

export const ERC1155Factory: ChainIdToAddress = {
  [Network.Ethereum]: "0xa6c5f2de915240270dac655152c3f6a91748cb85",
  [Network.Optimism]: "0x78b524931e9d847c40bcbf225c25e154a7b05fda",
  [Network.Zora]: "0x35ca784918bf11692708c1d530691704aacea95e",
};

export const ERC1155FactoryV2: ChainIdToAddress = {
  [Network.Ethereum]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Optimism]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
  [Network.Zora]: "0x777777c338d93e2c7adf08d102d45ca7cc4ed021",
};

export const OfferOmnibus: ChainIdToAddress = {
  [Network.AuraTestnet]: "0x14511dEfE1fbc147b7364d3A5A3ED1179bd0c707",
  // [Network.AuraSerenity]: "0xc3A73d1b9870FEdDb782237aa8AF50167a5016A9",
  // [Network.AuraEuphoria]: "0xA371d16fFDF669bB8A5A005D9e3476B41db756b2",
  // [Network.AuraXstasy]: "0xc4Aa652A09f27184A98A37a6b35b7b3C91f6f830",
};
