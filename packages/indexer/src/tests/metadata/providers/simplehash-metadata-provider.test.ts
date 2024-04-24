import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { simplehashMetadataProvider } from "@/metadata/providers/simplehash-metadata-provider";

jest.setTimeout(1000 * 1000);

describe("Metadata - Providers - Simplehash", () => {
  it("parseToken - Handle nft storage link", async () => {
    const tokenMetadata = await simplehashMetadataProvider.parseToken(
      {
        extra_metadata: {
          image_original_url: null,
          animation_original_url: null,
          metadata_original_url: null,
          attributes: null,
          media: null,
        },
        image_url:
          "https://bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm.ipfs.nftstorage.link/0.gif?ext=gif",
      },
      "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
      "12345"
    );

    expect(tokenMetadata).toEqual(
      expect.objectContaining({
        imageUrl:
          "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm/0.gif?ext=gif",
      })
    );
  });

  it("parseToken - Handle non nft storage link", async () => {
    const tokenMetadata = await simplehashMetadataProvider.parseToken(
      {
        extra_metadata: {
          image_original_url: null,
          animation_original_url: null,
          metadata_original_url: null,
          attributes: null,
          media: null,
        },
        image_url:
          "https://bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm.ipfs.not.nftstorage.link/0.gif?ext=gif",
      },
      "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
      "12345"
    );

    expect(tokenMetadata).toEqual(
      expect.not.objectContaining({
        imageUrl:
          "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm/0.gif?ext=gif",
      })
    );
  });
});
