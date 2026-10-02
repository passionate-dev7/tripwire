import { describe, expect, test } from "bun:test";
import { createPublicClient, encodePacked, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TESTNET,
  abis,
  buildDelegation,
  decodeDelegation,
  decodeTranches,
  delegationDigest,
  encodeDelegation,
  floorToMinOutPerUnit,
  parseMon,
  planTotal,
  priceToTick,
  signDelegation,
  tickToPrice,
  toTranches,
} from "./plan";

const holder = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const keeper = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const pub = createPublicClient({ transport: http(TESTNET.rpc) });

describe("price units", () => {
  test("ticks round trip the price within one tick", () => {
    for (const p of [0.015, 0.0325, 0.0343, 0.05, 1.2]) {
      const t = priceToTick(p);
      expect(tickToPrice(t)).toBeLessThanOrEqual(p);
      expect(tickToPrice(t + 1)).toBeGreaterThan(p);
    }
  });
  test("the mainnet pool tick at the spike block maps to its price", () => {
    // spike: TWAP tick -310,022 at block 109,704,919 paid 34.2761 USDC for 1,000 MON
    expect(tickToPrice(-310022)).toBeCloseTo(0.0344, 3);
  });
  test("floor rounds up, never down", () => {
    expect(floorToMinOutPerUnit(0.03)).toBe(30000n);
    expect(floorToMinOutPerUnit(0.0300001)).toBe(30001n);
  });
  test("MON amounts parse exactly", () => {
    expect(parseMon("1")).toBe(10n ** 18n);
    expect(parseMon("0.25")).toBe(25n * 10n ** 16n);
    expect(() => parseMon("1e3")).toThrow();
    expect(() => parseMon("-1")).toThrow();
  });
  test("a floor above its line is refused", () => {
    expect(() => toTranches([{ mon: "1", line: 0.03, floor: 0.031 }])).toThrow();
    expect(() => toTranches([])).toThrow();
  });
});

describe("delegation", () => {
  const tranches = toTranches([
    { mon: "0.05", line: 0.033, floor: 0.03 },
    { mon: "0.03", line: 0.028, floor: 0.025 },
  ]);
  const d = buildDelegation(TESTNET, holder.address, keeper, tranches, 1_800_000_000, 7n);

  test("terms decode back to the plan", () => {
    const back = decodeTranches(d.caveats[0].terms);
    expect(back.recipient).toBe(holder.address);
    expect(back.tranches).toEqual(tranches);
    expect(planTotal(tranches)).toBe(parseMon("0.08"));
  });

  test("encode and decode are inverse", async () => {
    const signed = await signDelegation(TESTNET, holder, d);
    expect(decodeDelegation(encodeDelegation(signed))).toEqual(signed);
  });

  test("our digest is the one the live DelegationManager computes", async () => {
    const domain = await pub.readContract({ address: TESTNET.delegationManager, abi: abis.delegationManager, functionName: "getDomainHash" });
    const hash = await pub.readContract({ address: TESTNET.delegationManager, abi: abis.delegationManager, functionName: "getDelegationHash", args: [d] });
    const onchain = keccak256(encodePacked(["bytes2", "bytes32", "bytes32"], ["0x1901", domain, hash]));
    expect(delegationDigest(TESTNET, d)).toBe(onchain);
  }, 30_000);
});
