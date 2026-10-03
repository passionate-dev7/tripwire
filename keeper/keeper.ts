// tripwire keeper: watches every posted plan and fills a tranche once the MON price is at or below its line.
//   bun run keeper/keeper.ts            (launchd on the Mac mini: keeper/com.tripwire.keeper.plist)
// It holds no judgment the chain does not check. Every fill is a DelegationManager redemption that the plan's
// enforcer re-checks on chain: line, floor, amount, recipient, once per tranche. The keeper key only pays gas.
//
// State comes from the chain, indexed once: PlanPosted and TrancheFilled are read forward in 100-block windows
// (the public RPC's eth_getLogs cap) from the plan book's deploy block, and the cursor is kept in keeper/state.json.
// Nothing scans logs in a request path: the HTTP API serves what the loop already indexed.
//   GET  /api/status                  keeper address, chain head, indexed block, MON price (TWAP and spot), plan count
//   GET  /api/plans?holder=0x...      that holder's plans, each tranche's state, fills with hashes
//   POST /api/attack {planId, kind}   the keeper turns hostile on purpose: it sends a redemption the plan forbids
//                                     (kind: floor | line | recipient), on chain, so the holder sees the enforcer's
//                                     revert in a real receipt. One per plan and kind.
import fs from "node:fs";
import path from "node:path";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  erc20Abi,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MAINNET_VENUE,
  TESTNET,
  abis,
  lineReached,
  decodeDelegation,
  decodeTranches,
  fillCalldata,
  redeemCalldata,
  swapCalldata,
  tickToPrice,
  type Delegation,
} from "../web/lib/plan";
import { revertReason as chainRevertReason } from "../web/lib/chain";

const here = path.dirname(new URL(import.meta.url).pathname);
const net = { ...TESTNET, rpc: process.env.MONAD_TESTNET_RPC_URL ?? TESTNET.rpc };
const keyFile = process.env.TRIPWIRE_KEEPER_KEY_FILE ?? path.join(process.env.HOME ?? "", ".config/tripwire/keeper.json");
const keyRing = JSON.parse(fs.readFileSync(keyFile, "utf8")) as { keeper: Hex; drip?: Hex };
const keeper = privateKeyToAccount(keyRing.keeper);
// A separate wallet that gives a brand-new passkey account enough testnet MON to arm a small plan. It never signs plans.
const dripper = keyRing.drip ? privateKeyToAccount(keyRing.drip) : null;
if (keeper.address.toLowerCase() !== net.keeper.toLowerCase()) {
  throw new Error(`key file holds ${keeper.address}, plans name ${net.keeper} as their keeper`);
}
const chain = { id: net.chainId, name: net.name, nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [net.rpc] } } } as const;
const pub = createPublicClient({ chain, transport: http(net.rpc, { retryCount: 4 }) });
const wallet = createWalletClient({ account: keeper, chain, transport: http(net.rpc) });
const FEES = { maxFeePerGas: 110_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n } as const;
// Monad prices cold state access above Ethereum: a fill estimates ~407k gas on testnet against 289k on an anvil fork.
// Fills are sized from Monad's own estimate; hostile calls revert inside the enforcer before the swap.
const ATTACK_GAS = 250_000n;
const PORT = Number(process.env.PORT ?? 8787);
const WINDOW = 100n;
const LOOP_MS = 2_000;

type Fill = { index: number; hash: Hex; block: string; amountIn: string; minOut: string; priceTick: number; amountOut?: string };
type Attack = { kind: string; hash: Hex; status: string; reason: string };
type PlanRow = { id: number; holder: Address; delegationHash: Hex; postedTx: Hex; delegation: Hex; fills: Fill[]; attacks: Attack[]; lastError?: string };
type Point = { t: number; twap: number; spot: number };
type State = { cursor: string; plans: PlanRow[]; history?: Point[] };

const stateFile = path.join(here, "state.json");
const state: State = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : { cursor: String(net.planBookFromBlock), plans: [] };
const persist = () => {
  fs.writeFileSync(stateFile + ".tmp", JSON.stringify(state, null, 2));
  fs.renameSync(stateFile + ".tmp", stateFile);
};
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const revertReason = (hash: Hex) => chainRevertReason(net.rpc, hash);

// ---------- index ----------

const BOOKS = [net.planBook, ...net.legacy.map((l) => l.planBook)];
const ENFORCERS = [net.enforcer, ...net.legacy.map((l) => l.enforcer)];
// the legacy plan book takes no new plans, so its count is fixed; read once at start
let legacyCount = 0;
for (const l of net.legacy) legacyCount += Number(await pub.readContract({ address: l.planBook, abi: abis.planBook, functionName: "count" }));

/** What the holder actually received in a sale: the stablecoin Transfer logs to the holder in that receipt. */
async function received(hash: Hex, holder: string): Promise<string> {
  const r = await pub.getTransactionReceipt({ hash });
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let sum = 0n;
  for (const l of r.logs) {
    if (l.address.toLowerCase() !== net.stable.toLowerCase() || l.topics[0] !== TRANSFER) continue;
    if (`0x${l.topics[2]!.slice(26)}`.toLowerCase() === holder.toLowerCase()) sum += BigInt(l.data);
  }
  return String(sum);
}

async function index(head: bigint) {
  let from = BigInt(state.cursor);
  while (from <= head) {
    const to = from + WINDOW - 1n > head ? head : from + WINDOW - 1n;
    const [posted, filled] = await Promise.all([
      pub.getLogs({ address: BOOKS, fromBlock: from, toBlock: to }),
      pub.getLogs({ address: ENFORCERS, fromBlock: from, toBlock: to }),
    ]);
    for (const l of posted) {
      const ev = decodeEventLog({ abi: abis.planBook, data: l.data, topics: l.topics });
      if (ev.eventName !== "PlanPosted") continue;
      // ids restart in each plan book; plans after the first book continue its numbering
      const legacy = net.legacy.some((x) => x.planBook.toLowerCase() === l.address.toLowerCase());
      const id = legacy ? Number(ev.args.id) : legacyCount + Number(ev.args.id);
      if (state.plans.some((p) => p.id === id)) continue;
      state.plans.push({ id, holder: ev.args.holder, delegationHash: ev.args.delegationHash, postedTx: l.transactionHash!, delegation: ev.args.delegation, fills: [], attacks: [] });
      log(`plan #${id} from ${ev.args.holder}`);
    }
    for (const l of filled) {
      const ev = decodeEventLog({ abi: abis.enforcer, data: l.data, topics: l.topics });
      if (ev.eventName !== "TrancheFilled") continue;
      const plan = state.plans.find((p) => p.delegationHash === ev.args.delegationHash);
      if (!plan || plan.fills.some((f) => f.hash === l.transactionHash)) continue;
      plan.fills.push({ index: Number(ev.args.index), hash: l.transactionHash!, block: String(l.blockNumber), amountIn: String(ev.args.amountIn), minOut: String(ev.args.amountOutMinimum), priceTick: Number(ev.args.priceTick), amountOut: await received(l.transactionHash!, ev.args.recipient) });
    }
    state.cursor = String(to + 1n);
    from = to + 1n;
  }
  persist();
}

// ---------- price history (testnet pool) and the real MON price (mainnet pool, read only) ----------

const HISTORY_EVERY_MS = 15_000;
const HISTORY_KEEP = (24 * 3600 * 1000) / HISTORY_EVERY_MS;
state.history ??= [];
const mainnet = createPublicClient({ transport: http(MAINNET_VENUE.rpc, { retryCount: 3 }) });
let mainnetRead: { price: number; tick: number; block: string; at: number } | null = null;

async function spotTick(): Promise<number> {
  const s0 = await pub.readContract({ address: net.pool, abi: abis.pool, functionName: "slot0" });
  return net.wmon.toLowerCase() < net.stable.toLowerCase() ? Number(s0[1]) : -Number(s0[1]);
}

async function sample(twap: number) {
  const last = state.history!.at(-1);
  if (last && Date.now() - last.t < HISTORY_EVERY_MS) return;
  state.history!.push({ t: Date.now(), twap, spot: await spotTick() });
  if (state.history!.length > HISTORY_KEEP) state.history!.splice(0, state.history!.length - HISTORY_KEEP);
}

/** 60 s TWAP of Monad mainnet's WMON/USDC 0.3% pool, where WMON is token0, so the raw tick is the MON price tick. */
async function readMainnet() {
  if (mainnetRead && Date.now() - mainnetRead.at < 60_000) return;
  try {
    const [cum] = await mainnet.readContract({ address: MAINNET_VENUE.pool, abi: [{ type: "function", name: "observe", stateMutability: "view", inputs: [{ type: "uint32[]" }], outputs: [{ type: "int56[]" }, { type: "uint160[]" }] }] as const, functionName: "observe", args: [[60, 0]] });
    const tick = Math.floor(Number(cum[1] - cum[0]) / 60);
    mainnetRead = { price: tickToPrice(tick), tick, block: String(await mainnet.getBlockNumber()), at: Date.now() };
  } catch (e) {
    log(`mainnet read: ${String((e as Error).message).split("\n")[0]}`);
  }
}

// ---------- fill ----------

const priceTick = async () => Number(await pub.readContract({ address: net.enforcer, abi: abis.enforcer, functionName: "monPriceTick", args: [net.pool, net.wmon, net.stable, net.twapSeconds] }));

async function tryFill(plan: PlanRow, d: Delegation, tick: number) {
  const { tranches } = decodeTranches(d.caveats[0].terms, d.caveats[0].enforcer);
  const expiry = Number(BigInt(`0x${d.caveats[1].terms.slice(-32)}`));
  if (expiry * 1000 < Date.now()) return;
  if (await pub.readContract({ address: net.delegationManager, abi: abis.delegationManager, functionName: "disabledDelegations", args: [plan.delegationHash] })) return;
  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    if (!lineReached(t, tick)) continue;
    if (await pub.readContract({ address: d.caveats[0].enforcer, abi: abis.enforcer, functionName: "spent", args: [plan.delegationHash, BigInt(i)] })) continue;
    const data = fillCalldata(net, d, i);
    let gas: bigint;
    try {
      gas = ((await pub.estimateGas({ account: keeper.address, to: net.delegationManager, data })) * 12n) / 10n;
    } catch (e) {
      plan.lastError = `tranche ${i} preflight: ${String((e as Error).message).split("\n")[0].slice(0, 160)}`;
      continue; // line crossed but the chain would refuse it (balance moved, floor not reachable): never send a doomed tx
    }
    const hash = await wallet.sendTransaction({ to: net.delegationManager, data, gas, ...FEES });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 });
    log(`plan #${plan.id} tranche ${i}: ${hash} ${r.status}`);
    if (r.status !== "success") plan.lastError = `tranche ${i}: ${hash} reverted ${await revertReason(hash)}`;
    else plan.lastError = undefined;
  }
}

let lastLoop = 0;
let loopError: string | null = null;
let loops = 0;
/** What one fill costs the keeper up front: Monad charges the gas limit (the estimate plus 20%, about 470k) at the fee cap. */
const FILL_COST = 470_000n * FEES.maxFeePerGas;
// Snapshots the API serves: computed here, in the loop, so no request ever waits on (or fails with) the public RPC.
let statusSnap: Record<string, unknown> | null = null;
const viewSnap = new Map<number, Awaited<ReturnType<typeof planView>>>();

async function snapshot(head: bigint, twap: number) {
  const [slot0, gas, poolStable] = await Promise.all([
    pub.readContract({ address: net.pool, abi: abis.pool, functionName: "slot0" }),
    pub.getBalance({ address: keeper.address }),
    pub.readContract({ address: net.stable, abi: erc20Abi, functionName: "balanceOf", args: [net.pool] }),
  ]);
  const spotTick = net.wmon.toLowerCase() < net.stable.toLowerCase() ? Number(slot0[1]) : -Number(slot0[1]);
  statusSnap = { chainId: net.chainId, keeper: keeper.address, keeperGas: String(gas), head: String(head), indexed: String(BigInt(state.cursor) - 1n), plans: state.plans.length, twapTick: twap, twapPrice: tickToPrice(twap), spotTick, spotPrice: tickToPrice(spotTick), poolStable: String(poolStable), twapSeconds: net.twapSeconds, readAt: Date.now() };
}

async function loop() {
  for (const p of state.plans) for (const f of p.fills) if (f.amountOut === undefined) f.amountOut = await received(f.hash, p.holder).catch(() => undefined);
  for (;;) {
    try {
      const head = await pub.getBlockNumber();
      await index(head);
      const tick = await priceTick();
      await sample(tick);
      await readMainnet();
      await snapshot(head, tick);
      // one plan's failed send (no gas, RPC error) must not stop the other plans, the views, or the heartbeat
      for (const plan of state.plans) {
        try {
          await tryFill(plan, decodeDelegation(plan.delegation), tick);
        } catch (e) {
          plan.lastError = `fill: ${String((e as Error).message).split("\n")[0].slice(0, 160)}`;
          log(`plan #${plan.id}: ${plan.lastError}`);
        }
      }
      if (loops++ % 3 === 0) for (const plan of state.plans) viewSnap.set(plan.id, await planView(plan));
      persist();
      lastLoop = Date.now();
      loopError = null;
    } catch (e) {
      loopError = String((e as Error).message).split("\n")[0].slice(0, 200);
      log(`loop: ${loopError}`);
    }
    await new Promise((r) => setTimeout(r, LOOP_MS));
  }
}

// ---------- hostile on purpose ----------

async function attack(planId: number, kind: string): Promise<Attack> {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) throw new Error("no such plan");
  const prior = plan.attacks.find((a) => a.kind === kind);
  if (prior) return prior;
  const d = decodeDelegation(plan.delegation);
  const { recipient, tranches } = decodeTranches(d.caveats[0].terms, d.caveats[0].enforcer);
  const tick = await priceTick();
  const spent = await Promise.all(tranches.map((_, i) => pub.readContract({ address: d.caveats[0].enforcer, abi: abis.enforcer, functionName: "spent", args: [plan.delegationHash, BigInt(i)] })));
  // Attack a tranche that is still live, so the revert shows the guard named by `kind`, not "already spent".
  const live = tranches.map((t, i) => ({ t, i })).filter(({ i }) => !spent[i]);
  if (live.length === 0) throw new Error("every tranche is already sold, so there is nothing left to attack");
  let data: Hex;
  if (kind === "floor") {
    const { t, i } = live[0];
    data = redeemCalldata(net, d, i, net.router, 0n, swapCalldata(net, recipient, t.amountIn, (t.amountIn * t.minOutPerUnit) / 2n / 10n ** 18n));
  } else if (kind === "recipient") {
    const { t, i } = live[0];
    data = redeemCalldata(net, d, i, net.router, 0n, swapCalldata(net, keeper.address, t.amountIn, (t.amountIn * t.minOutPerUnit) / 10n ** 18n + 1n));
  } else if (kind === "line") {
    const above = live.find(({ t }) => !lineReached(t, tick));
    if (!above) throw new Error("every live line is already crossed, so there is no early sale to attempt");
    data = fillCalldata(net, d, above.i);
  } else throw new Error("kind is floor, line or recipient");
  if ((await pub.getBalance({ address: keeper.address })) < ATTACK_GAS * FEES.maxFeePerGas + parseEther("0.002")) throw new Error("keeper is out of testnet gas");
  const hash = await wallet.sendTransaction({ to: net.delegationManager, data, gas: ATTACK_GAS, ...FEES });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 });
  const a: Attack = { kind, hash, status: r.status, reason: r.status === "reverted" ? await revertReason(hash) : "DID NOT REVERT" };
  plan.attacks.push(a);
  persist();
  log(`attack ${kind} on plan #${planId}: ${hash} ${a.status} ${a.reason}`);
  return a;
}

// ---------- testnet MON drip for empty passkey accounts ----------

const DRIP = parseEther("0.1");
const DRIP_PER_IP_DAY = 10;
const DRIP_PER_DAY = 30;
const dripped = new Set<string>();
const dripLog: { at: number; ip: string }[] = [];

async function drip(address: string, ip: string) {
  if (!dripper) throw new Error("drip is off on this keeper");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("address=0x... required");
  const day = Date.now() - 86_400_000;
  while (dripLog.length && dripLog[0].at < day) dripLog.shift();
  if (dripped.has(address.toLowerCase())) throw new Error("This passkey already got testnet MON from tripwire.");
  if (dripLog.filter((d) => d.ip === ip).length >= DRIP_PER_IP_DAY) throw new Error("This network has used its testnet MON for today. faucet.monad.xyz sends more.");
  if (dripLog.length >= DRIP_PER_DAY) throw new Error("Today's testnet MON from tripwire is used up. faucet.monad.xyz sends more.");
  if ((await pub.getBalance({ address: address as `0x${string}` })) > 0n) throw new Error("This passkey already holds MON, so it can arm a plan now.");
  if ((await pub.getCode({ address: address as `0x${string}` })) && (await pub.getCode({ address: address as `0x${string}` })) !== "0x") throw new Error("Only a fresh passkey account gets testnet MON from tripwire.");
  dripped.add(address.toLowerCase());
  dripLog.push({ at: Date.now(), ip });
  const w = createWalletClient({ account: dripper, chain, transport: http(net.rpc) });
  const hash = await w.sendTransaction({ to: address as `0x${string}`, value: DRIP, ...FEES });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 });
  log(`drip ${address} ${hash} ${r.status}`);
  if (r.status !== "success") throw new Error(`drip reverted ${hash}`);
  return { hash, amount: String(DRIP) };
}

// ---------- API ----------

async function planView(p: PlanRow) {
  const d = decodeDelegation(p.delegation);
  const { tranches } = decodeTranches(d.caveats[0].terms, d.caveats[0].enforcer);
  const spent = await Promise.all(tranches.map((_, i) => pub.readContract({ address: d.caveats[0].enforcer, abi: abis.enforcer, functionName: "spent", args: [p.delegationHash, BigInt(i)] })));
  const revoked = await pub.readContract({ address: net.delegationManager, abi: abis.delegationManager, functionName: "disabledDelegations", args: [p.delegationHash] });
  return {
    id: p.id, holder: p.holder, delegationHash: p.delegationHash, postedTx: p.postedTx, delegation: p.delegation, revoked,
    expiresAt: Number(BigInt(`0x${d.caveats[1].terms.slice(-32)}`)),
    tranches: tranches.map((t, i) => ({ index: i, line: tickToPrice(t.lineTick), lineTick: t.lineTick, mon: String(t.amountIn), floorPerMon: Number(t.minOutPerUnit) / 1e6, atOrAbove: t.atOrAbove, spent: spent[i] })),
    fills: p.fills, attacks: p.attacks, lastError: p.lastError ?? null,
  };
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === "/api/status") {
        if (!statusSnap) return json({ error: "keeper is starting" }, 503);
        return json({ ...statusSnap, lastLoop, loopError, fillCost: String(FILL_COST), mainnet: mainnetRead });
      }
      if (url.pathname === "/api/recent") {
        // one row per plan, newest first: its sales (with what the holder actually received) and every refused call
        const plans = [...state.plans].sort((a, b) => b.id - a.id).slice(0, 6).map((p) => ({
          plan: p.id,
          holder: p.holder,
          postedTx: p.postedTx,
          sales: p.fills.map((f) => ({ hash: f.hash, index: f.index, amountIn: f.amountIn, minOut: f.minOut, amountOut: f.amountOut ?? null, priceTick: f.priceTick })),
          refused: p.attacks.filter((a) => a.status === "reverted").map((a) => ({ hash: a.hash, attack: a.kind, reason: a.reason })),
        }));
        const attempts = state.plans.flatMap((p) => p.attacks);
        const totals = {
          plans: state.plans.length,
          sales: state.plans.reduce((n, p) => n + p.fills.length, 0),
          forbiddenSent: attempts.length,
          forbiddenReverted: attempts.filter((a) => a.status === "reverted").length,
          forbiddenPaidOut: attempts.filter((a) => a.status !== "reverted").length,
        };
        return json({ plans, total: state.plans.length, totals });
      }
      if (url.pathname === "/api/history") {
        return json({ points: state.history ?? [] });
      }
      if (url.pathname === "/api/plans") {
        const holder = (url.searchParams.get("holder") ?? "").toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(holder)) return json({ error: "holder=0x... required" }, 400);
        const mine = state.plans.filter((p) => p.holder.toLowerCase() === holder);
        // cached views carry the latest fills and attacks from the index; a plan posted since the last snapshot is read once
        return json({ plans: await Promise.all(mine.map(async (p) => { const v = viewSnap.get(p.id) ?? (await planView(p)); return { ...v, fills: p.fills, attacks: p.attacks, lastError: p.lastError ?? null }; })) });
      }
      if (url.pathname === "/api/drip" && req.method === "POST") {
        const { address } = (await req.json()) as { address: string };
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
        return json(await drip(String(address), ip));
      }
      if (url.pathname === "/api/attack" && req.method === "POST") {
        const { planId, kind } = (await req.json()) as { planId: number; kind: string };
        return json(await attack(Number(planId), String(kind)));
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String((e as Error).message).split("\n")[0] }, 400);
    }
  },
});
log(`keeper ${keeper.address} on ${net.name}, api :${PORT}, indexing from ${state.cursor}`);
loop();
