// Finds one real open Perpl position on Monad mainnet (Exchange view calls only).
//   cd web && MONAD_RPC_URL=https://rpc1.monad.xyz bun ../demo/fetch-perpl-anchor.ts
import fs from "node:fs";
import path from "node:path";
import { type Address, createPublicClient, http, type Abi } from "viem";
import officialAbiJson from "../web/lib/exchange-official.abi.json";
import { NETWORKS } from "../web/lib/perpl";
import { readPosition } from "../web/lib/readPosition";

const officialAbi = officialAbiJson as Abi;
const rpc = process.env.MONAD_RPC_URL ?? process.env.MONAD_MAINNET_RPC ?? NETWORKS.mainnet.rpc;
const client = createPublicClient({ transport: http(rpc, { retryCount: 5, retryDelay: 400 }) });
const exchange = NETWORKS.mainnet.exchange;
const markets = NETWORKS.mainnet.markets;

const numAccounts = (await client.readContract({
  address: exchange,
  abi: officialAbi,
  functionName: "numberOfAccounts",
})) as bigint;

export type PerplAnchorFile = {
  network: "mainnet";
  chainId: 143;
  exchange: Address;
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

let anchor: PerplAnchorFile | null = null;

for (let id = numAccounts; id > 0n && !anchor; id--) {
  const info = (await client.readContract({
    address: exchange,
    abi: officialAbi,
    functionName: "getAccountById",
    args: [id],
  })) as { accountAddr: Address };
  const owner = info.accountAddr;
  for (const marketId of markets) {
    const pos = await readPosition(owner, marketId, { network: "mainnet", client });
    if (!pos) continue;
    const raw = (await client.readContract({
      address: exchange,
      abi: officialAbi,
      functionName: "getPositionV2",
      args: [BigInt(marketId), id],
    })) as readonly [{ lotLNS: bigint }, bigint, boolean];
    anchor = {
      network: "mainnet",
      chainId: 143,
      exchange,
      accountId: id.toString(),
      marketId,
      positionLots: raw[0].lotLNS.toString(),
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      markPrice: pos.markPrice,
      fetchedAt: new Date().toISOString(),
    };
    break;
  }
}

if (!anchor) throw new Error("no open Perpl position on mainnet");

const outPath =
  process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), "../web/lib/perpl-anchor.json");
fs.writeFileSync(outPath, JSON.stringify(anchor, null, 2));
console.log(JSON.stringify(anchor));
