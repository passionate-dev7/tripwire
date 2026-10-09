// End to end on a real chain: a holder writes a plan, signs once, and a keeper (honest and hostile) acts on it.
//   bun run demo/e2e.ts [rpcUrl]            default https://testnet-rpc.monad.xyz
// Steps, each checked by receipt status and a post-condition read back from chain:
//   1. fund a fresh holder and a fresh keeper from the deployer (keys in demo/.keys.json, gitignored, never printed)
//   2. holder: one EIP-7702 transaction upgrades its address to MetaMask's stateless DeleGator and, in the same batch,
//      wraps the planned MON, approves the router for exactly the plan, and posts the plan to PlanBook
//   3. hostile keeper: a fill below the floor and a fill of a tranche whose line the price has not crossed, each sent
//      on chain with a fixed gas limit so the revert lands in a receipt; the revert reason is read back by replay
//   4. honest keeper: fills the tranche whose line is crossed; holder's WMON falls by exactly that tranche and the
//      holder's aUSD rises by at least its floor
// Writes every hash and reading to demo/runs/<chainId>-<time>.json.
import fs from "node:fs";
import path from "node:path";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  TESTNET,
  abis,
  buildDelegation,
  delegationDigest,
  fillCalldata,
  planTotal,
  redeemCalldata,
  setupCalldata,
  wrapCall,
  signDelegation,
  swapCalldata,
  tickToPrice,
  toTranches,
} from "../web/lib/plan";
import { revertReason as chainRevertReason } from "../web/lib/chain";

const dir = path.dirname(new URL(import.meta.url).pathname);
const rpc = process.argv[2] ?? TESTNET.rpc;
const keysFile = path.join(dir, ".keys.json");
const keys = JSON.parse(fs.readFileSync(keysFile, "utf8")) as Record<string, Hex>;
for (const k of ["holder", "keeper"]) keys[k] ??= generatePrivateKey();
fs.writeFileSync(keysFile, JSON.stringify(keys), { mode: 0o600 });

const deployer = privateKeyToAccount(keys.deployer);
const holder = privateKeyToAccount(keys.holder);
const keeper = privateKeyToAccount(keys.keeper);
const pub = createPublicClient({ transport: http(rpc) });
const chainId = await pub.getChainId();
const net = { ...TESTNET, rpc, chainId };
const chain = { id: chainId, name: "monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
const w = (a: typeof holder) => createWalletClient({ account: a, chain, transport: http(rpc) });
// Monad charges gas on the limit, and the sender must hold limit x fee cap up front. Testnet base fee is 100 gwei.
const FEES = { maxFeePerGas: 110_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n } as const;
const WRAP_GAS = 60_000n;
const SETUP_GAS = 330_000n;
const REDEEM_GAS = 500_000n;
const log: Record<string, unknown> = { chainId, rpc: rpc.includes("127.0.0.1") ? "anvil-fork" : rpc, holder: holder.address, keeper: keeper.address };
const out = path.join(dir, "runs", `${chainId}-${new Date().toISOString().replace(/[:.]/g, "-")}${rpc.includes("127.0.0.1") ? "-fork" : ""}.json`);
const save = () => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(log, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)); };

async function receipt(hash: Hex) {
  return pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000, retryCount: 10 });
}
const ausd = (a: Address) => pub.readContract({ address: net.stable, abi: erc20Abi, functionName: "balanceOf", args: [a] });
const wmonOf = (a: Address) => pub.readContract({ address: net.wmon, abi: abis.wmon, functionName: "balanceOf", args: [a] });
const priceTick = async () => Number(await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "monPriceTick", args: [net.pool, net.wmon, net.stable, net.twapSeconds] }));

/** Why a mined, reverted tx reverted: replay its call at the parent block and decode Error(string). */
const revertReason = (hash: Hex) => chainRevertReason(net.rpc, hash);

// ---------- 1. fund ----------
const PLAN = [
  // tranche 0: the line is above the market, so it is already crossed and fills now
  { mon: "0.02", line: 0.036, floor: 0.03 },
  // tranche 1: the line is far under the market; no keeper can fill it until MON falls there
  { mon: "0.01", line: 0.022, floor: 0.02 },
];
const tranches = toTranches(PLAN);
const total = planTotal(tranches);
const holderNeeds = total + (WRAP_GAS + SETUP_GAS) * FEES.maxFeePerGas + parseEther("0.005");
const keeperNeeds = 4n * REDEEM_GAS * FEES.maxFeePerGas + parseEther("0.005");
for (const [who, need] of [[holder.address, holderNeeds], [keeper.address, keeperNeeds]] as const) {
  const have = await pub.getBalance({ address: who });
  if (have < need) {
    const h = await w(deployer).sendTransaction({ to: who, value: need - have, ...FEES });
    const r = await receipt(h);
    if (r.status !== "success") throw new Error(`funding ${who} failed`);
    log[`fund ${who}`] = h;
  }
}
console.log(`holder ${holder.address} ${formatEther(await pub.getBalance({ address: holder.address }))} MON, keeper ${keeper.address} ${formatEther(await pub.getBalance({ address: keeper.address }))} MON`);

// ---------- 2. holder signs once and sets up in one transaction ----------
const t0 = await priceTick();
log.priceAtStart = tickToPrice(t0);
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
const { perplBindFromAnchor } = await import("../web/lib/perplAnchor");
const perpl = perplBindFromAnchor();
const unsigned = buildDelegation(net, holder.address, keeper.address, tranches, expiresAt, BigInt(Date.now()), perpl);
const signed = await signDelegation(net, holder, unsigned);
const hashOnchain = await pub.readContract({ address: net.delegationManager, abi: abis.delegationManager, functionName: "getDelegationHash", args: [signed] });
log.delegationHash = hashOnchain;
log.digest = delegationDigest(net, signed);

// Monad reserve rule: an account under 10 MON can spend value only while undelegated, so wrap first, alone.
const preCode = await pub.getCode({ address: holder.address });
if (preCode && preCode !== "0x" && (await pub.getBalance({ address: holder.address })) < parseEther("10") + total) {
  throw new Error("holder is already delegated and under 10 MON: Monad's reserve rule blocks the wrap; use a fresh holder");
}
const wrapHash = await w(holder).sendTransaction({ ...wrapCall(net, total), gas: WRAP_GAS, ...FEES });
const wrapped = await receipt(wrapHash);
log.wrap = { hash: wrapHash, status: wrapped.status, gasUsed: wrapped.gasUsed };
save();
if (wrapped.status !== "success" || (await wmonOf(holder.address)) < total) throw new Error(`wrap failed ${wrapHash}`);
console.log(`wrap ${wrapHash}: ${formatEther(total)} MON to WMON`);
const wPre = await wmonOf(holder.address);
const aPre = await ausd(holder.address);
// leave the k = 3 block execution lag behind before the transaction that carries the delegation
const wrapBlock = wrapped.blockNumber;
while ((await pub.getBlockNumber()) < wrapBlock + 4n) await new Promise((r) => setTimeout(r, 400));

const authorization = await w(holder).signAuthorization({ contractAddress: net.statelessDeleGator, executor: "self" });
const countBefore = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
const setupHash = await w(holder).sendTransaction({
  to: holder.address,
  data: setupCalldata(net, signed, total),
  authorizationList: [authorization],
  gas: SETUP_GAS,
  ...FEES,
});
const setup = await receipt(setupHash);
log.setup = { hash: setupHash, status: setup.status, gasUsed: setup.gasUsed };
const code = await pub.getCode({ address: holder.address });
const countAfter = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
const allowance = await pub.readContract({ address: net.wmon, abi: abis.wmon, functionName: "allowance", args: [holder.address, net.router] });
log.setupReadback = { code, planCount: [countBefore, countAfter], wmon: await wmonOf(holder.address), allowance };
save();
if (setup.status !== "success") throw new Error(`setup reverted ${setupHash}`);
if (!code?.toLowerCase().startsWith(`0xef0100${net.statelessDeleGator.slice(2).toLowerCase()}`)) throw new Error(`holder not delegated: ${code}`);
if (countAfter !== countBefore + 1n) throw new Error("plan not posted");
if ((await wmonOf(holder.address)) < total || allowance !== total) throw new Error("wrap or approval missing");
console.log(`setup ${setupHash}: 7702 delegated, plan #${countBefore} posted, ${formatEther(total)} WMON approved to the router`);

// ---------- 3 and 4 against the live keeper (KEEPER_API set): the script never holds the keeper key ----------
const api = process.env.KEEPER_API;
if (api) {
  const planId = Number(countBefore);
  let seen = false;
  for (let i = 0; i < 90 && !seen; i++) {
    const r = (await (await fetch(`${api}/api/plans?holder=${holder.address}`)).json()) as { plans: { id: number }[] };
    seen = r.plans.some((p) => p.id === planId);
    if (!seen) await new Promise((res) => setTimeout(res, 2000));
  }
  if (!seen) throw new Error("keeper never indexed the plan");
  // the keeper fills tranche 0 on its own (its line is above the market); wait for the chain to say so
  let filled = false;
  for (let i = 0; i < 90 && !filled; i++) {
    filled = await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "spent", args: [hashOnchain, 0n] });
    if (!filled) await new Promise((res) => setTimeout(res, 2000));
  }
  if (!filled) throw new Error("keeper did not fill tranche 0 within 180 s");
  const view = (await (await fetch(`${api}/api/plans?holder=${holder.address}`)).json()) as { plans: { id: number; fills: { index: number; hash: Hex }[] }[] };
  const fill = view.plans.find((p) => p.id === planId)?.fills.find((f) => f.index === 0);
  if (!fill) throw new Error("fill not in keeper index");
  const fr = await receipt(fill.hash);
  const w1 = await wmonOf(holder.address);
  const a1 = await ausd(holder.address);
  const floorOwed = (tranches[0].amountIn * tranches[0].minOutPerUnit) / 10n ** 18n;
  log.fill = { hash: fill.hash, status: fr.status, from: (await pub.getTransaction({ hash: fill.hash })).from, wmonSold: wPre - w1, ausdReceived: a1 - aPre };
  save();
  if (fr.status !== "success" || wPre - w1 !== tranches[0].amountIn || a1 - aPre < floorOwed) throw new Error("fill post-conditions failed");
  console.log(`keeper fill ${fill.hash}: sold ${formatEther(wPre - w1)} WMON for ${formatUnits(a1 - aPre, 6)} aUSD (floor ${formatUnits(floorOwed, 6)})`);

  for (const kind of ["floor", "line", "recipient"]) {
    const a = (await (await fetch(`${api}/api/attack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, kind }) })).json()) as { hash: Hex; reason: string; error?: string };
    if (a.error) throw new Error(`attack ${kind}: ${a.error}`);
    const r = await receipt(a.hash);
    const reason = r.status === "reverted" ? await revertReason(a.hash) : "DID NOT REVERT";
    log[`hostile ${kind}`] = { hash: a.hash, status: r.status, reason, keeperSaid: a.reason };
    save();
    console.log(`hostile ${kind}: ${a.hash} ${r.status} ${reason}`);
    if (r.status !== "reverted") throw new Error(`hostile ${kind} was not stopped`);
  }
  const w2 = await wmonOf(holder.address);
  const a2 = await ausd(holder.address);
  if (w2 !== w1 || a2 !== a1) throw new Error("a hostile call moved funds");
  const spent1 = await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "spent", args: [hashOnchain, 1n] });
  if (spent1) throw new Error("tranche 1 sold before its line");
  log.negative = { tranche1Spent: spent1, wmonHeld: w2, priceTick: await priceTick(), tranche1LineTick: tranches[1].lineTick };
  save();
  console.log(`run log: ${out}`);
  process.exit(0);
}

// ---------- 3. hostile keeper ----------
const hostile = async (label: string, data: Hex) => {
  const h = await w(keeper).sendTransaction({ to: net.delegationManager, data, gas: REDEEM_GAS, ...FEES });
  const r = await receipt(h);
  const reason = r.status === "reverted" ? await revertReason(h) : "DID NOT REVERT";
  log[label] = { hash: h, status: r.status, reason };
  save();
  console.log(`${label}: ${h} ${r.status} ${reason}`);
  if (r.status !== "reverted") throw new Error(`${label} was not stopped`);
  return reason;
};
const w0 = await wmonOf(holder.address);
const a0 = await ausd(holder.address);
const belowFloor = await hostile(
  "hostile: tranche 0 for half its floor",
  redeemCalldata(net, signed, 0, net.router, 0n, swapCalldata(net, holder.address, tranches[0].amountIn, (tranches[0].amountIn * tranches[0].minOutPerUnit) / 2n / 10n ** 18n)),
);
const aboveLine = await hostile("hostile: tranche 1 before its line is crossed", fillCalldata(net, signed, 1));
const toKeeper = await hostile(
  "hostile: tranche 0 paid to the keeper",
  redeemCalldata(net, signed, 0, net.router, 0n, swapCalldata(net, keeper.address, tranches[0].amountIn, (tranches[0].amountIn * tranches[0].minOutPerUnit) / 10n ** 18n + 1n)),
);
if (belowFloor !== "Tripwire:min-out" || aboveLine !== "Tripwire:above-line" || toKeeper !== "Tripwire:recipient") throw new Error("unexpected revert reasons");
if ((await wmonOf(holder.address)) !== w0 || (await ausd(holder.address)) !== a0) throw new Error("a hostile call moved funds");

// ---------- 4. honest keeper fills the crossed tranche ----------
const fillHash = await w(keeper).sendTransaction({ to: net.delegationManager, data: fillCalldata(net, signed, 0), gas: REDEEM_GAS, ...FEES });
const fill = await receipt(fillHash);
const w1 = await wmonOf(holder.address);
const a1 = await ausd(holder.address);
const spent0 = await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "spent", args: [hashOnchain, 0n] });
const spent1 = await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "spent", args: [hashOnchain, 1n] });
log.fill = { hash: fillHash, status: fill.status, gasUsed: fill.gasUsed, wmonSold: w0 - w1, ausdReceived: a1 - a0, spent: [spent0, spent1], keeperAusd: await ausd(keeper.address) };
save();
const floorOwed = (tranches[0].amountIn * tranches[0].minOutPerUnit) / 10n ** 18n;
if (fill.status !== "success") throw new Error(`fill reverted ${fillHash}`);
if (w0 - w1 !== tranches[0].amountIn) throw new Error("sold a different amount than the tranche");
if (a1 - a0 < floorOwed) throw new Error("paid below the floor");
if (!spent0 || spent1) throw new Error("spent bits wrong");
console.log(`fill ${fillHash}: sold ${formatEther(w0 - w1)} WMON for ${formatUnits(a1 - a0, 6)} aUSD (floor ${formatUnits(floorOwed, 6)}); tranche 1 untouched`);
console.log(`run log: ${out}`);
