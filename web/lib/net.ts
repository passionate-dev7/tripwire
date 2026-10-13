// Which network the page is on, and where that network's keeper API lives.
// `?net=mainnet` in the address wins, then the build's NEXT_PUBLIC_TRIPWIRE_NET, then testnet. The page is a static
// export, so the server render always sees the build default; read currentNet() after mount to see the address.
import { MAINNET, TESTNET, type Net } from "./plan";

export function netFrom(search: string, buildDefault?: string): Net {
  const known = (v: string | null | undefined) => (v === "mainnet" || v === "testnet" ? v : undefined);
  const asked = known(new URLSearchParams(search).get("net")) ?? known(buildDefault);
  return asked === "mainnet" ? MAINNET : TESTNET;
}

export function currentNet(): Net {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return netFrom(search, process.env.NEXT_PUBLIC_TRIPWIRE_NET);
}

/** Prefix of the keeper's routes for a net. Deployed, Vercel rewrites /api/mainnet/* to the mainnet keeper and /api/* to
 * the testnet one. In development NEXT_PUBLIC_KEEPER_API and NEXT_PUBLIC_KEEPER_API_MAINNET name each keeper directly. */
export function apiBase(net: Net): string {
  const testnet = process.env.NEXT_PUBLIC_KEEPER_API ?? "";
  if (net.key === "testnet") return `${testnet}/api`;
  const mainnet = process.env.NEXT_PUBLIC_KEEPER_API_MAINNET;
  return mainnet === undefined ? `${testnet}/api/mainnet` : `${mainnet}/api`;
}
