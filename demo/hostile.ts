// The keeper tries to fill one chosen tranche of a holder's plan now, exactly as signed, and reports what the chain
// said. Use it on a tranche whose line has not been reached to watch the enforcer refuse it.
//   bun run demo/hostile.ts <holder> <tranche index>        (keeper key from demo/.keys.json, never printed)
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FEES, clients } from "../web/lib/holder";
import { revertReason } from "../web/lib/chain";
import { TESTNET, decodeDelegation, decodeTranches, fillCalldata, lineReached, abis } from "../web/lib/plan";

const [holder, idx] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(holder ?? "") || !/^\d+$/.test(idx ?? "")) throw new Error("usage: hostile.ts <holder> <tranche index>");
const keys = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), ".keys.json"), "utf8")) as { keeper: Hex };
const keeper = privateKeyToAccount(keys.keeper);
const { chain, pub } = clients(TESTNET);
const { plans } = await (await fetch(`https://tripwire-three.vercel.app/api/plans?holder=${holder}`)).json() as { plans: { id: number; delegation: Hex }[] };
const plan = plans.at(-1);
if (!plan) throw new Error("no plan for that holder");
const d = decodeDelegation(plan.delegation);
const t = decodeTranches(d.caveats[0].terms, d.caveats[0].enforcer).tranches[Number(idx)];
const tick = Number(await pub.readContract({ address: d.caveats[0].enforcer as Address, abi: abis.enforcer, functionName: "monPriceTick", args: [TESTNET.pool, TESTNET.wmon, TESTNET.stable, TESTNET.twapSeconds] }));
console.log(`plan ${plan.id} tranche ${idx}: ${t.atOrAbove ? "target" : "stop"}, line reached: ${lineReached(t, tick)}`);
const hash = await createWalletClient({ account: keeper, chain, transport: http(TESTNET.rpc) }).sendTransaction({ to: TESTNET.delegationManager, data: fillCalldata(TESTNET, d, Number(idx)), gas: 250_000n, ...FEES });
const r = await pub.waitForTransactionReceipt({ hash });
console.log(`${hash} ${r.status}${r.status === "reverted" ? ` ${await revertReason(TESTNET.rpc, hash)}` : ""}`);
