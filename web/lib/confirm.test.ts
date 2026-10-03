import { expect, test } from "bun:test";
import { confirmed } from "./confirm";

test("a read that is stale for two polls still confirms", async () => {
  let calls = 0;
  const r = await confirmed(async () => ++calls, (n) => n >= 3, 2_000, 5);
  expect(r).toEqual({ ok: true, value: 3 });
});

test("a read that never holds gives up with the last value", async () => {
  const r = await confirmed(async () => 0, (n) => n > 0, 30, 5);
  expect(r.ok).toBe(false);
});

test("a read that throws twice (RPC rejects under load) is retried", async () => {
  let calls = 0;
  const r = await confirmed(async () => { if (++calls < 3) throw new Error("RPC Request failed."); return calls; }, (n) => n === 3, 2_000, 5);
  expect(r).toEqual({ ok: true, value: 3 });
});

test("a read that always throws raises its error at the deadline", async () => {
  await expect(confirmed(async () => { throw new Error("down"); }, () => true, 30, 5)).rejects.toThrow("down");
});
