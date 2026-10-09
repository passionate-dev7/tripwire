// Arm on PlanBook4 (matching Perpl V3 enforcer), then three hostile redemptions with decoded revert reasons.
//   bun run demo/v3-hostile-proof.ts
import fs from "node:fs";
import path from "node:path";
import {
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revertReason } from "../web/lib/chain";
import {
  TESTNET,
  abis,
  decodePerplPosition,
  fillCalldata,
  redeemCalldata,
  swapCalldata,
  toTranches,
} from "../web/lib/plan";
import { perplBindFromAnchor } from "../web/lib/perplAnchor";
import { FEES } from "../web/lib/holder";

const dir = path.dirname(new URL(import.meta.url).pathname);
const keys = JSON.parse(fs.readFileSync(path.join(dir, ".keys.json"), "utf8")) as Record<string, Hex>;
if (!keys.deployer || !keys.keeper) {
  console.error("demo/.keys.json needs deployer and keeper");
  process.exit(1);
}
if (!keys.holder) {
  console.error("demo/.keys.json missing holder");
  process.exit(1);
}

const rpc = process.env.MONAD_TESTNET_RPC_URL ?? TESTNET.rpc;
const pub = createPublicClient({ transport: http(rpc) });
const chain = {
  id: 10143,
  name: "monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
} as const;
const deployer = privateKeyToAccount(keys.deployer);
const keeper = privateKeyToAccount(keys.keeper);
const holder = privateKeyToAccount(keys.holder);
const perpl = perplBindFromAnchor();
if (perpl.accountId !== 5429n || Number(perpl.marketId) !== 10) throw new Error("Perpl anchor must be 5429 / 10");

const REDEEM_GAS = 500_000n;
const WRAP_GAS = 60_000n;
const SETUP_GAS = 330_000n;
const PLAN = [
  { mon: "0.002", line: 0.05, floor: 0.04 },
  { mon: "0.002", line: 0.001, floor: 0.0009 },
];
const tranches = toTranches(PLAN);
const expiresAt = Math.floor(Date.now() / 1000) + 180;

async function receipt(hash: Hex) {
  return pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000 });
}

const countBefore = await pub.readContract({ address: TESTNET.planBook, abi: abis.planBook, functionName: "count" });

const w = (acc: typeof holder) => createWalletClient({ account: acc, chain, transport: http(rpc) });
const { createPlan } = await import("../web/lib/holder.ts");

const setupGas = (60_000n + 420_000n) * FEES.maxFeePerGas;
let hBal = await pub.getBalance({ address: holder.address });
if (hBal < setupGas + parseEther("0.01")) {
  const h = await w(deployer).sendTransaction({ to: holder.address, value: setupGas + parseEther("0.05") - hBal, ...FEES });
  await receipt(h);
}

const armed = await createPlan(TESTNET, holder, PLAN, expiresAt, perpl, (s, tx) => console.log(s, tx ?? ""));
const signed = armed.signed;
const setupHash = armed.setupHash;
const countAfter = await pub.readContract({ address: TESTNET.planBook, abi: abis.planBook, functionName: "count" });
if (countAfter !== countBefore + 1n) throw new Error("PlanBook4 count did not increment");

let legacy = 0;
for (const l of TESTNET.legacy) {
  legacy += Number(await pub.readContract({ address: l.planBook, abi: abis.planBook, functionName: "count" }));
}
const planId = legacy + Number(armed.planId);
const delegationHash = await pub.readContract({
  address: TESTNET.delegationManager,
  abi: abis.delegationManager,
  functionName: "getDelegationHash",
  args: [signed],
});

const hostile = async (label: string, data: Hex) => {
  const hash = await w(keeper).sendTransaction({ to: TESTNET.delegationManager, data, gas: REDEEM_GAS, ...FEES });
  const r = await receipt(hash);
  const reason = r.status === "reverted" ? await revertReason(rpc, hash) : "DID NOT REVERT";
  console.log(`${label}: ${hash} ${reason}`);
  if (r.status !== "reverted") throw new Error(`${label} was not stopped`);
  return { hash, reason, status: r.status };
};

const w0 = await pub.readContract({ address: TESTNET.wmon, abi: abis.wmon, functionName: "balanceOf", args: [holder.address] });
const line = await hostile("line", fillCalldata(TESTNET, signed, 1));
const recipient = await hostile(
  "recipient",
  redeemCalldata(
    TESTNET,
    signed,
    0,
    TESTNET.router,
    0n,
    swapCalldata(TESTNET, keeper.address, tranches[0].amountIn, (tranches[0].amountIn * tranches[0].minOutPerUnit) / 10n ** 18n + 1n),
  ),
);
while (Math.floor(Date.now() / 1000) <= expiresAt) await new Promise((r) => setTimeout(r, 2_000));
const expiry = await hostile("expiry", fillCalldata(TESTNET, signed, 0));

for (const [k, want] of [
  ["line", "Tripwire:above-line"],
  ["recipient", "Tripwire:recipient"],
  ["expiry", "TimestampEnforcer:expired-delegation"],
] as const) {
  const got = { line, recipient, expiry }[k].reason;
  if (!got.includes(want)) throw new Error(`${k} got "${got}" expected "${want}"`);
}
const w1 = await pub.readContract({ address: TESTNET.wmon, abi: abis.wmon, functionName: "balanceOf", args: [holder.address] });
if (w1 !== w0) throw new Error("hostile calls moved WMON");

const artifact = {
  network: "Monad testnet 10143",
  enforcer: TESTNET.enforcer,
  planBook: TESTNET.planBook,
  planId,
  planBookLocalId: String(countBefore),
  perplAccountId: "5429",
  perplMarketId: 10,
  holder: holder.address,
  delegationHash,
  armTx: setupHash,
  wrapTx: armed.wrapHash,
  attacks: { line, recipient, expiry },
};
const runPath = path.join(dir, "runs", `v3-pivot-hostile-10143-${Date.now()}.json`);
fs.writeFileSync(runPath, JSON.stringify(artifact, null, 2));
console.log(runPath);
