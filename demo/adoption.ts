// Counts holders outside the team who posted a tripwire plan, read from PlanBook on Monad testnet.
//   bun run demo/adoption.ts [--min N]     exits 1 when fewer than N outside holders (the ledger criterion)
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http } from "viem";
import { TESTNET, abis } from "../web/lib/plan";

const team = new Set(
  fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "team-holders.txt"), "utf8")
    .split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l.startsWith("0x")),
);
const pub = createPublicClient({ transport: http(TESTNET.rpc, { retryCount: 6, retryDelay: 700 }) });
// every plan book: the current one and the legacy ones whose plans still count
const books = [TESTNET.planBook, ...TESTNET.legacy.map((l) => l.planBook)];
const counts: number[] = [];
for (const b of books) counts.push(Number(await pub.readContract({ address: b, abi: abis.planBook, functionName: "count" })));
const count = counts.reduce((a, b) => a + b, 0);
if (count === 0) throw new Error("PlanBook reads 0 plans: wrong address or chain, an empty book proves nothing");
// one read at a time: the public RPC allows 15 requests per second
const plans = [];
for (const [k, b] of books.entries()) {
  for (let i = 0; i < counts[k]; i++) {
    plans.push(await pub.readContract({ address: b, abi: abis.planBook, functionName: "plan", args: [BigInt(i)] }));
    await new Promise((r) => setTimeout(r, 120));
  }
}
const outside = [...new Set(plans.map((p) => p.holder.toLowerCase()).filter((h) => !team.has(h)))];
const teamSeen = new Set(plans.map((p) => p.holder.toLowerCase()).filter((h) => team.has(h)));
console.log(`plans ${count}, team holders ${teamSeen.size}, outside holders ${outside.length}${outside.length ? `: ${outside.join(", ")}` : ""}`);
const min = Number(process.argv[process.argv.indexOf("--min") + 1] ?? 0);
process.exit(process.argv.includes("--min") && outside.length < min ? 1 : 0);
