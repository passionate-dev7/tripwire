// Focused unit test for demo/lifecycle-proof.ts. Pure, no network, no keys.
import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  TESTNET,
  buildDelegation,
  toTranches,
} from "../web/lib/plan";
import { perplBindFromAnchor } from "../web/lib/perplAnchor";

const PERPL = perplBindFromAnchor();
import {
  EXPECTED_HOLDER,
  LIFECYCLE_TERMS,
  assertSignedTermsMatch,
  floorOwed,
} from "./lifecycle-proof";

const keeper = TESTNET.keeper;
const tranches = toTranches(LIFECYCLE_TERMS);
const signed = buildDelegation(TESTNET, EXPECTED_HOLDER, keeper, tranches, 1_800_000_000, 7n, PERPL);

describe("assertSignedTermsMatch", () => {
  test("passes on identical signed terms", () => {
    expect(() => assertSignedTermsMatch(signed, LIFECYCLE_TERMS, EXPECTED_HOLDER)).not.toThrow();
  });

  test("fails when the amount is mutated", () => {
    const mutated = buildDelegation(
      TESTNET,
      EXPECTED_HOLDER,
      keeper,
      toTranches([{ ...LIFECYCLE_TERMS[0], mon: "0.006" }, LIFECYCLE_TERMS[1]]),
      1_800_000_000,
      7n,
      PERPL,
    );
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });

  test("fails when the recipient is mutated", () => {
    const stranger = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    const mutated = buildDelegation(TESTNET, stranger, keeper, tranches, 1_800_000_000, 7n, PERPL);
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });

  test("fails when the tranche direction is mutated", () => {
    const mutated = buildDelegation(
      TESTNET,
      EXPECTED_HOLDER,
      keeper,
      toTranches([{ ...LIFECYCLE_TERMS[0], up: false }, LIFECYCLE_TERMS[1]]),
      1_800_000_000,
      7n,
      PERPL,
    );
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });

  test("fails when the line is mutated", () => {
    const mutated = buildDelegation(
      TESTNET,
      EXPECTED_HOLDER,
      keeper,
      toTranches([{ ...LIFECYCLE_TERMS[0], line: 0.03 }, LIFECYCLE_TERMS[1]]),
      1_800_000_000,
      7n,
      PERPL,
    );
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });

  test("fails when the floor is mutated", () => {
    const mutated = buildDelegation(
      TESTNET,
      EXPECTED_HOLDER,
      keeper,
      toTranches([{ ...LIFECYCLE_TERMS[0], floor: 0.027 }, LIFECYCLE_TERMS[1]]),
      1_800_000_000,
      7n,
      PERPL,
    );
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });

  test("fails when the signed tranche count differs", () => {
    expect(() => assertSignedTermsMatch(signed, [LIFECYCLE_TERMS[0]], EXPECTED_HOLDER)).toThrow();
  });

  test("fails when Perpl account id does not match the live anchor", () => {
    const mutated = buildDelegation(TESTNET, EXPECTED_HOLDER, keeper, tranches, 1_800_000_000, 7n, {
      accountId: 1n,
      marketId: 10n,
      positionLots: 5753n,
    });
    expect(() => assertSignedTermsMatch(mutated, LIFECYCLE_TERMS, EXPECTED_HOLDER)).toThrow();
  });
});

describe("floorOwed", () => {
  test("rounds stablecoin proceeds down to base units", () => {
    expect(floorOwed(500_000_000_000_000_000n, 1_000_001n)).toBe(500_000n);
  });
});
