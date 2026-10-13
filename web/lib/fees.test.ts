import { expect, test } from "bun:test";
import { FEE_PRIORITY, feeCap, liveFees } from "./fees";

test("the cap clears Monad's 102 gwei price with headroom, and the old fixed 110 gwei cap does not", () => {
  expect(feeCap(102_000_000_000n)).toBe(153_000_000_000n);
  expect(feeCap(102_000_000_000n)).toBeGreaterThan(110_000_000_000n);
  expect(feeCap(104_000_000_000n)).toBeGreaterThan(104_000_000_000n + FEE_PRIORITY);
});

test("fees follow the chain's gas price read at call time", async () => {
  let price = 102_000_000_000n;
  const pub = { getGasPrice: async () => price };
  expect((await liveFees(pub)).maxFeePerGas).toBe(153_000_000_000n);
  price = 130_000_000_000n;
  expect(await liveFees(pub)).toEqual({ maxFeePerGas: 195_000_000_000n, maxPriorityFeePerGas: FEE_PRIORITY });
});
