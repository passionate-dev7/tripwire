// Runs web/lib/holder.ts, the exact code the browser runs, against Monad testnet with a fresh local key in place of
// the passkey session: create a plan whose first line is already crossed, wait for the live keeper to sell it, revoke
// the rest, unwrap what is left. Every step is read back from chain.   bun run demo/holder-flow.ts
import fs from "node:fs";
import path from "node:path";
import { createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { TESTNET, abis, planTotal, toTranches } from "../web/lib/plan";
import { FEES, clients, createPlan, holdings, revokePlan, unwrap } from "../web/lib/holder";

const dir = path.dirname(new URL(import.meta.url).pathname);
const keysFile = path.join(dir, ".keys.json");
const keys = JSON.parse(fs.readFileSync(keysFile, "utf8")) as Record<string, Hex>;
const name = `flow-${Date.now()}`;
keys[name] = generatePrivateKey();
fs.writeFileSync(keysFile, JSON.stringify(keys), { mode: 0o600 });
const holder = privateKeyToAccount(keys[name]);
const { chain, pub } = clients(TESTNET);
const plain = [{ mon: "0.02", line: 0.036, floor: 0.03 }, { mon: "0.01", line: 0.02, floor: 0.019 }];
const total = planTotal(toTranches(plain));
const fund = await createWalletClient({ account: privateKeyToAccount(keys.deployer), chain, transport: http(TESTNET.rpc) }).sendTransaction({ to: holder.address, value: total + parseEther("0.12"), ...FEES });
await pub.waitForTransactionReceipt({ hash: fund });
console.log(`holder ${holder.address} funded ${fund}`);

const { perplBindFromAnchor } = await import("../web/lib/perplAnchor");
const res = await createPlan(TESTNET, holder, plain, Math.floor(Date.now() / 1000) + 86400, perplBindFromAnchor(), (s, h) =>
  console.log(`  ${s}${h ? ` ${h}` : ""}`),
);
const hash = await pub.readContract({ address: TESTNET.delegationManager, abi: abis.delegationManager, functionName: "getDelegationHash", args: [res.signed] });
console.log(`plan #${res.planId} delegation ${hash}`);

let sold = false;
for (let i = 0; i < 60 && !sold; i++) {
  sold = await pub.readContract({ address: TESTNET.enforcer, abi: abis.enforcer, functionName: "spent", args: [hash, 0n] });
  if (!sold) await new Promise((r) => setTimeout(r, 2000));
}
if (!sold) throw new Error("keeper did not sell tranche 0 in 120 s");
const h1 = await holdings(TESTNET, holder.address);
console.log(`keeper sold tranche 0: WMON ${formatEther(h1.wmon)}, aUSD ${Number(h1.stable) / 1e6}`);

const rev = await revokePlan(TESTNET, holder, res.signed, hash);
console.log(`revoked ${rev}`);
const un = await unwrap(TESTNET, holder, h1.wmon);
const h2 = await holdings(TESTNET, holder.address);
console.log(`unwrapped ${un}: WMON ${formatEther(h2.wmon)}, MON ${formatEther(h2.mon)}`);
if (h2.wmon !== 0n || h1.wmon !== parseEther("0.01")) throw new Error("post-conditions failed");
console.log("PASS");
