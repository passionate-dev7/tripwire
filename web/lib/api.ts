// The keeper's read API. In production the page and /api share an origin (Vercel's CDN rewrites /api/* to the
// keeper on the Mac mini, no functions); in development NEXT_PUBLIC_KEEPER_API points at the keeper directly.
import type { Hex } from "viem";

const BASE = process.env.NEXT_PUBLIC_KEEPER_API ?? "";

export type MainnetRead = { price: number; tick: number; block: string; at: number } | null;
export type Status = {
  chainId: number; keeper: Hex; keeperGas: string; head: string; indexed: string; lastLoop: number; plans: number;
  twapTick: number; twapPrice: number; spotTick: number; spotPrice: number; poolStable: string; twapSeconds: number; mainnet: MainnetRead;
};
export type Point = { t: number; twap: number; spot: number };
export type Fill = { index: number; hash: Hex; block: string; amountIn: string; minOut: string; priceTick: number };
export type Attack = { kind: "floor" | "line" | "recipient"; hash: Hex; status: string; reason: string };
export type TrancheView = { index: number; line: number; lineTick: number; mon: string; floorPerMon: number; spent: boolean };
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
  attack: async (planId: number, kind: Attack["kind"]): Promise<Attack> => {
    const r = await fetch(`${BASE}/api/attack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, kind }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `keeper ${r.status}`);
    return body as Attack;
  },
};
