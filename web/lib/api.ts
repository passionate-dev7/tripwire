// The keeper's read API. In production the page and /api share an origin (Vercel's CDN rewrites /api/* to the
// keeper on the Mac mini, no functions); in development NEXT_PUBLIC_KEEPER_API points at the keeper directly.
import type { Hex } from "viem";

const BASE = process.env.NEXT_PUBLIC_KEEPER_API ?? "";

export type MainnetRead = { price: number; tick: number; block: string; at: number } | null;
export type Status = {
  chainId: number; keeper: Hex; keeperGas: string; head: string; indexed: string; lastLoop: number; plans: number;
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
  const r = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
  return body as T;
}

export const keeperApi = {
  status: () => get<Status>("/api/status"),
  history: () => get<{ points: Point[] }>("/api/history"),
  plans: (holder: Hex) => get<{ plans: PlanView[] }>(`/api/plans?holder=${holder}`),
  recent: () => get<{ plans: RecentPlan[]; total: number; totals?: { plans: number; sales: number; forbiddenSent: number; forbiddenReverted: number; forbiddenPaidOut: number } }>("/api/recent"),
  drip: async (address: Hex): Promise<{ hash: Hex }> => {
    const r = await fetch(`${BASE}/api/drip`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
    return body as { hash: Hex };
  },
  attack: async (planId: number, kind: Attack["kind"]): Promise<Attack> => {
    const r = await fetch(`${BASE}/api/attack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, kind }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
    return body as Attack;
  },
};
