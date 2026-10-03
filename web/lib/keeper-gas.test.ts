import { expect, test } from "bun:test";
import { salesLeft } from "./keeper-gas";

const cost = String(470_000n * 110_000_000_000n); // 0.0517 MON per fill

test("the judge's 0.0348 MON keeper pays for zero sales; 1.5 MON pays for 29", () => {
  expect(salesLeft("34800000000000000", cost)).toBe(0);
  expect(salesLeft("1500000000000000000", cost)).toBe(29);
});

test("unknown inputs read as unknown, not zero", () => {
  expect(salesLeft(undefined, cost)).toBeNull();
  expect(salesLeft("1", "0")).toBeNull();
});
