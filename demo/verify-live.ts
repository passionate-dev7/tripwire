// Proves one holder's plan on the live keeper, from the chain.
//   bun run demo/verify-live.ts <holder> [--attack]       KEEPER_API defaults to the mini's public URL
// For every plan of <holder>: each fill's receipt (success, sent by the keeper), the WMON the holder sold and the aUSD
// it received in that same transaction (Transfer logs, not balances that may have moved since), against the tranche's
// amount and floor; each unfilled tranche's line against the current MON price (the negative case: a line not crossed
// is not sold). With --attack, asks the keeper to turn hostile (floor, line, recipient) and reads each revert reason
// back from the chain by replaying the mined transaction. Appends everything to demo/runs/verify-<holder>.json.
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex, createPublicClient, decodeErrorResult, erc20Abi, formatUnits, http, parseEventLogs } from "viem";
import { TESTNET, abis, decodeDelegation, decodeTranches, lineReached, tickToPrice } from "../web/lib/plan";
import { revertReason as chainRevertReason } from "../web/lib/chain";

const holder = (process.argv[2] ?? "") as Address;
if (!/^0x[0-9a-fA-F]{40}$/.test(holder)) throw new Error("usage: verify-live.ts <holder> [--attack]");
const api = process.env.KEEPER_API ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/tripwire";
const net = TESTNET;
const pub = createPublicClient({ transport: http(net.rpc, { retryCount: 6, retryDelay: 700 }) });
const dir = path.dirname(new URL(import.meta.url).pathname);
const report: Record<string, unknown>[] = [];

const reason = (hash: Hex) => chainRevertReason(net.rpc, hash);

const twap = Number(await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "monPriceTick", args: [net.pool, net.wmon, net.stable, net.twapSeconds] }));
const { plans } = (await (await fetch(`${api}/api/plans?holder=${holder}`)).json()) as { plans: { id: number; delegationHash: Hex; delegation: Hex; postedTx: Hex; fills: { index: number; hash: Hex }[] }[] };
if (plans.length === 0) throw new Error(`no plans for ${holder}: an empty list proves nothing`);
let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures++; };

for (const p of plans) {
  const d = decodeDelegation(p.delegation);
  const { tranches, recipient } = decodeTranches(d.caveats[0].terms, d.caveats[0].enforcer);
  const posted = await pub.getTransactionReceipt({ hash: p.postedTx });
  check(posted.status === "success" && posted.from.toLowerCase() === holder.toLowerCase(), `plan #${p.id} posted by the holder in ${p.postedTx}`);
  check(recipient.toLowerCase() === holder.toLowerCase(), `plan #${p.id} pays only the holder`);
  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    const spent = await pub.readContract({ address: d.caveats[0].enforcer, abi: abis.enforcer, functionName: "spent", args: [p.delegationHash, BigInt(i)] });
    const fill = p.fills.find((f) => f.index === i);
    const row: Record<string, unknown> = { plan: p.id, tranche: i, line: tickToPrice(t.lineTick), floor: Number(t.minOutPerUnit) / 1e6, spent };
    if (fill) {
      const r = await pub.getTransactionReceipt({ hash: fill.hash });
      const transfers = parseEventLogs({ abi: erc20Abi, logs: r.logs, eventName: "Transfer" });
      const sold = transfers.filter((l) => l.address.toLowerCase() === net.wmon.toLowerCase() && l.args.from.toLowerCase() === holder.toLowerCase()).reduce((s, l) => s + l.args.value, 0n);
      const got = transfers.filter((l) => l.address.toLowerCase() === net.stable.toLowerCase() && l.args.to.toLowerCase() === holder.toLowerCase()).reduce((s, l) => s + l.args.value, 0n);
      const owed = (t.amountIn * t.minOutPerUnit) / 10n ** 18n;
      const filledAt = parseEventLogs({ abi: abis.enforcer, logs: r.logs, eventName: "TrancheFilled" })[0]?.args.priceTick;
      Object.assign(row, { fill: fill.hash, from: r.from, sold: String(sold), received: formatUnits(got, 6), floorOwed: formatUnits(owed, 6), priceAtFill: filledAt === undefined ? null : tickToPrice(Number(filledAt)) });
      check(r.status === "success" && r.from.toLowerCase() === net.keeper.toLowerCase(), `tranche ${i} filled by the keeper in ${fill.hash}`);
      check(sold === t.amountIn, `tranche ${i} sold exactly ${formatUnits(t.amountIn, 18)} WMON`);
      check(got >= owed, `tranche ${i} paid ${formatUnits(got, 6)} aUSD, floor ${formatUnits(owed, 6)}`);
      check(filledAt !== undefined && lineReached(t, Number(filledAt)), `tranche ${i} (${t.atOrAbove ? "target" : "stop"}) filled with its line reached`);
    } else {
      check(!spent, `tranche ${i} unspent and unsold`);
      if (!lineReached(t, twap)) check(!spent, `tranche ${i} (${t.atOrAbove ? "target" : "stop"}) not sold while MON ${tickToPrice(twap).toFixed(5)} has not reached its line ${tickToPrice(t.lineTick).toFixed(5)} (negative case)`);
    }
    report.push(row);
  }
  if (process.argv.includes("--attack")) {
    for (const kind of ["floor", "line", "recipient"]) {
      const a = (await (await fetch(`${api}/api/attack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: p.id, kind }) })).json()) as { hash?: Hex; error?: string };
      if (!a.hash) { console.log(`skip ${kind}: ${a.error}`); continue; }
      const r = await pub.waitForTransactionReceipt({ hash: a.hash, timeout: 60_000 });
      const why = r.status === "reverted" ? await reason(a.hash) : "DID NOT REVERT";
      report.push({ plan: p.id, attack: kind, hash: a.hash, status: r.status, reason: why });
      check(r.status === "reverted" && why.startsWith("Tripwire:"), `hostile ${kind}: ${a.hash} reverted ${why}`);
    }
  }
}
const out = path.join(dir, "runs", `verify-${holder.toLowerCase()}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), twapPrice: tickToPrice(twap), report }, null, 2));
console.log(`${failures === 0 ? "PASS" : `FAIL (${failures})`} ${out}`);
process.exit(failures === 0 ? 0 : 1);
