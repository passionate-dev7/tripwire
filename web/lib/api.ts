// The keeper's read API. In production the page and /api share an origin (Vercel's CDN rewrites /api/* to the testnet
// keeper and /api/mainnet/* to the mainnet keeper on the Mac mini, no functions); see apiBase in ./net for development.
// Every call asks currentNet() when it is made, so the same keeperApi serves whichever network the address names.
import type { Hex } from "viem";
import { apiBase, currentNet } from "./net";

const base = () => apiBase(currentNet());

export type MainnetRead = { price: number; tick: number; block: string; at: number } | null;
export type Status = {
  chainId: number; keeper: Hex; drip?: boolean; keeperGas: string; head: string; indexed: string; lastLoop: number; plans: number;
  loopError?: string | null; fillCost?: string; twapTick: number; twapPrice: number; spotTick: number; spotPrice: number; poolStable: string; twapSeconds: number; mainnet: MainnetRead;
};
export type Point = { t: number; twap: number; spot: number };
export type Fill = { index: number; hash: Hex; block: string; amountIn: string; minOut: string; priceTick: number; amountOut?: string | null };
export type RecentPlan = {
  plan: number; holder: Hex; postedTx: Hex;
  sales: { hash: Hex; index: number; amountIn: string; minOut: string; amountOut: string | null; priceTick: number }[];
  refused: { hash: Hex; attack: "line" | "floor" | "recipient" | "expiry"; reason: string }[];
};
export type Attack = { kind: "floor" | "line" | "recipient" | "expiry"; hash: Hex; status: string; reason: string };
export type TrancheView = { index: number; line: number; lineTick: number; mon: string; floorPerMon: number; atOrAbove?: boolean; spent: boolean };
export type PlanView = {
  id: number; holder: Hex; delegationHash: Hex; postedTx: Hex; delegation: Hex; revoked: boolean; expiresAt: number;
  tranches: TrancheView[]; fills: Fill[]; attacks: Attack[]; lastError: string | null;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${base()}${path}`, { cache: "no-store" });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
  return body as T;
}

export const keeperApi = {
  status: () => get<Status>("/status"),
  history: () => get<{ points: Point[] }>("/history"),
  plans: (holder: Hex) => get<{ plans: PlanView[] }>(`/plans?holder=${holder}`),
  recent: () => get<{ plans: RecentPlan[]; total: number; totals?: { plans: number; sales: number; forbiddenSent: number; forbiddenReverted: number; forbiddenPaidOut: number } }>("/recent"),
  drip: async (address: Hex): Promise<{ hash: Hex }> => {
    const r = await fetch(`${base()}/drip`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
    return body as { hash: Hex };
  },
  attack: async (planId: number, kind: Attack["kind"]): Promise<Attack> => {
    const r = await fetch(`${base()}/attack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, kind }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
    return body as Attack;
  },
};
