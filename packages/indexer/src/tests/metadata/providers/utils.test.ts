import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { normalizeLink } from "@/metadata/providers/utils";

jest.setTimeout(1000 * 1000);

describe("Metadata - Providers - Utils", () => {
  it("normalizeLink - Handle valid link", async () => {
    const normalizedLink = normalizeLink("https://test.link/0.gif?ext=gif");

    expect(normalizedLink).toEqual("https://test.link/0.gif?ext=gif");
  });

  it("normalizeLink - Handle 'ipfs://' link", async () => {
    const normalizedLink = normalizeLink(
      "ipfs://bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm"
    );

    expect(normalizedLink).toEqual(
      "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm"
    );
  });

  it("normalizeLink - Handle 'ipfs/' link", async () => {
    const normalizedLink = normalizeLink(
      "ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm"
    );

    expect(normalizedLink).toEqual(
      "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm"
    );
  });

  it("normalizeLink - Handle link with white spaces", async () => {
    const normalizedLink = normalizeLink(" https://test.link/0.gif?ext=gif ");

    expect(normalizedLink).toEqual("https://test.link/0.gif?ext=gif");
  });

  it("normalizeLink - Handle null link value", async () => {
    const normalizedLink = normalizeLink("null");

    expect(normalizedLink).toEqual("");
  });

  it("normalizeLink - Handle '/' prefix link", async () => {
    const normalizedLink = normalizeLink(
      "/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm"
    );

    expect(normalizedLink).toEqual("");
  });

  it("normalizeLink - Handle nft storage link", async () => {
    const normalizedLink = normalizeLink(
      "https://bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm.ipfs.nftstorage.link/0.gif?ext=gif"
    );

    expect(normalizedLink).toEqual(
      "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm/0.gif?ext=gif"
    );
  });

  it("normalizeLink - Handle nft storage link", async () => {
    const normalizedLink = normalizeLink(
      "https://bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm.ipfs.nftstorage.link/0.gif?ext=gif"
    );

    expect(normalizedLink).toEqual(
      "https://ipfs.io/ipfs/bafybeifbpjx5p4c2xh4jd4ixpnayodejskgpk5jsqgc73uvb2hrynqhbm/0.gif?ext=gif"
    );
  });
});
