// Pure helpers for the bounded holder lifecycle proof.
// No network, no keys, no side effects. The runner (prove-holder-lifecycle.ts)
// owns all chain and keeper access; this module only pins the exact terms and
// checks that a signed delegation carries them back exactly.
import type { Address } from "viem";
import {
  type Delegation,
  type PlainTranche,
  decodeTranches,
  floorToMinOutPerUnit,
  parseMon,
  priceToTick,
} from "../web/lib/plan";

/** The only holder this proof may act for, already persisted in demo/.keys.json. */
export const EXPECTED_HOLDER =
  "0xd661b663c2e9fc4f7a07563de9fb97ca345fb05d" as Address;
export const EXPECTED_CHAIN_ID = 10143;
/** The one plan this proof may create: 0.01 MON of existing WMON, no wrapping. */
export const LIFECYCLE_TERMS: PlainTranche[] = [
  { mon: "0.005", line: 0.029, floor: 0.028, up: true },
  { mon: "0.005", line: 0.02, floor: 0.019 },
];
/** Default read index for fills. The runner never POSTs to hostile endpoints. */
export const LIVE_KEEPER_API =
  "https://teslas-mac-mini.tail57f771.ts.net:10000/tripwire";

export type NamedAssertion = { name: string; ok: boolean; detail?: string };

/** Stablecoin base units owed for `amountIn` at `minOutPerUnit`, rounded down. */
export function floorOwed(amountIn: bigint, minOutPerUnit: bigint): bigint {
  return (amountIn * minOutPerUnit) / 10n ** 18n;
}

/** Throws unless the signed delegation pays `holder` and carries `plain`
 * back exactly: recipient, amount, direction, line tick and floor per tranche. */
export function assertSignedTermsMatch(
  signed: Delegation,
  plain: PlainTranche[],
  holder: Address,
): void {
  const { recipient, tranches } = decodeTranches(
    signed.caveats[0].terms,
    signed.caveats[0].enforcer,
  );
  if (recipient.toLowerCase() !== holder.toLowerCase()) {
    throw new Error(
      `recipient ${recipient} is not the holder ${holder}`,
    );
  }
  if (tranches.length !== plain.length) {
    throw new Error(
      `tranche count ${tranches.length} is not ${plain.length}`,
    );
  }
  for (let i = 0; i < plain.length; i++) {
    const p = plain[i];
    const t = tranches[i];
    const wantAmount = parseMon(p.mon);
    if (t.amountIn !== wantAmount) {
      throw new Error(
        `tranche ${i} amount ${t.amountIn} is not ${wantAmount}`,
      );
    }
    const wantDir = p.up === true;
    if (t.atOrAbove !== wantDir) {
      throw new Error(
        `tranche ${i} direction atOrAbove=${t.atOrAbove} is not ${wantDir}`,
      );
    }
    const wantTick = priceToTick(p.line);
    if (t.lineTick !== wantTick) {
      throw new Error(
        `tranche ${i} line tick ${t.lineTick} is not ${wantTick}`,
      );
    }
    const wantFloor = floorToMinOutPerUnit(p.floor);
    if (t.minOutPerUnit !== wantFloor) {
      throw new Error(
        `tranche ${i} floor ${t.minOutPerUnit} is not ${wantFloor}`,
      );
    }
  }
}
