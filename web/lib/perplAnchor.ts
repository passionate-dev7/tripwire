import anchorFile from "./perpl-anchor.json";
import type { PerplPositionBind } from "./plan";

export type PerplAnchor = {
  network: "mainnet";
  chainId: 143;
  exchange: string;
  accountId: string;
  marketId: number;
  positionLots: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  fetchedAt: string;
};

export const PERPL_ANCHOR = anchorFile as PerplAnchor;

export function perplBindFromAnchor(a: PerplAnchor = PERPL_ANCHOR): PerplPositionBind {
  const positionLots = BigInt(a.positionLots);
  if (BigInt(a.accountId) === 0n || positionLots === 0n) {
    throw new Error("Perpl anchor file is missing a live position id.");
  }
  return {
    accountId: BigInt(a.accountId),
    marketId: BigInt(a.marketId),
    positionLots,
    symbol: a.symbol,
    side: a.side,
    size: a.size,
  };
}
