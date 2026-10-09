// Arm one PlanBook3 / enforcer V3 plan with Perpl 5429 bound, then three hostile redemptions on THAT plan.
//   bun run demo/v3-pivot-hostile-proof.ts
// Writes demo/runs/v3-pivot-hostile-<chainId>-<ts>.json (no secrets).
import fs from "node:fs";
import path from "node:path";
import { type Hex, createPublicClient, createWalletClient, decodeEventLog, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revertReason } from "../web/lib/chain";
import {
  TESTNET,
  abis,
  decodeDelegation,
  decodePerplPosition,
  decodeTranches,
  fillCalldata,
  lineReached,
  redeemCalldata,
  swapCalldata,
  tickToPrice,
  toTranches,
} from "../web/lib/plan";
import { FEES, createPlan, holdings, revokePlan } from "../web/lib/holder";
import { perplBindFromAnchor, PERPL_ANCHOR } from "../web/lib/perplAnchor";

const dir = path.dirname(new URL(import.meta.url).pathname);
const keysPath = path.join(dir, ".keys.json");
const keys = JSON.parse(fs.readFileSync(keysPath, "utf8")) as { holder: Hex; keeper: Hex; deployer?: Hex };
if (!keys.holder || !keys.keeper) {
  console.error("Missing demo/.keys.json fields: holder, keeper");
  process.exit(1);
}

const rpc = process.env.MONAD_TESTNET_RPC_URL ?? TESTNET.rpc;
const pub = createPublicClient({ transport: http(rpc) });
const chainId = await pub.getChainId();
const net = { ...TESTNET, rpc, chainId };
const chain = {
  id: chainId,
  name: "monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
} as const;
const holder = privateKeyToAccount(keys.holder);
const keeper = privateKeyToAccount(keys.keeper);
const keeperWallet = createWalletClient({ account: keeper, chain, transport: http(rpc) });
const ATTACK_GAS = 250_000n;

const perpl = perplBindFromAnchor();
if (perpl.accountId !== 5429n || Number(perpl.marketId) !== 10) {
  throw new Error(`Perpl anchor must be account 5429 market 10, got ${perpl.accountId} ${perpl.marketId}`);
}

async function receipt(hash: Hex) {
  return pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000 });
}

/** Only one enabled delegation may stay live on this holder or redeem hits ERC-1271 and never reaches the enforcer. */
async function revokeEnabledDelegations() {
  const api = process.env.KEEPER_API ?? "https://tripwire-three.vercel.app";
  try {
    const r = await fetch(`${api}/api/plans?holder=${holder.address}`);
    const body = (await r.json()) as { plans?: { delegation: Hex; delegationHash: Hex; revoked?: boolean }[] };
    for (const p of body.plans ?? []) {
      const d = decodeDelegation(p.delegation);
      const disabled = await pub.readContract({
        address: net.delegationManager,
        abi: abis.delegationManager,
        functionName: "disabledDelegations",
        args: [p.delegationHash],
      });
      if (disabled || p.revoked) continue;
      console.log(`revoking keeper-indexed plan ${p.delegationHash.slice(0, 10)}`);
      await revokePlan(net, holder, d, p.delegationHash);
    }
  } catch {
    console.log("keeper API revoke skipped");
  }
  const head = await pub.getBlockNumber();
  for (let from = net.planBookFromBlock; from <= head; from += 100n) {
    const to = from + 99n > head ? head : from + 99n;
    const logs = await pub.getLogs({ address: net.planBook, fromBlock: from, toBlock: to });
    for (const l of logs) {
      let ev;
      try {
        ev = decodeEventLog({ abi: abis.planBook, data: l.data, topics: l.topics });
      } catch {
        continue;
      }
      if (ev.eventName !== "PlanPosted") continue;
      if (ev.args.holder.toLowerCase() !== holder.address.toLowerCase()) continue;
      const d = decodeDelegation(ev.args.delegation);
      const h = ev.args.delegationHash as Hex;
      const disabled = await pub.readContract({
        address: net.delegationManager,
        abi: abis.delegationManager,
        functionName: "disabledDelegations",
        args: [h],
      });
      if (disabled) continue;
      console.log(`revoking PlanBook3 id ${ev.args.id}`);
      await revokePlan(net, holder, d, h);
    }
  }
}

async function fundIfNeeded(minMon: bigint) {
  const bal = await pub.getBalance({ address: holder.address });
  if (bal >= minMon) return null;
  if (!keys.deployer) throw new Error("holder underfunded and demo/.keys.json has no deployer key");
  const deployer = privateKeyToAccount(keys.deployer);
  const w = createWalletClient({ account: deployer, chain, transport: http(rpc) });
  const need = minMon - bal + 10n ** 15n;
  const hash = await w.sendTransaction({ to: holder.address, value: need, ...FEES });
  await receipt(hash);
  return hash;
}

// Stops far below spot so line attack hits Tripwire:above-line; enough tranches stay live for three attacks.
const plain = [
  { mon: "0.002", line: 0.001, floor: 0.0009 },
  { mon: "0.002", line: 0.0008, floor: 0.0007 },
  { mon: "0.001", line: 0.0005, floor: 0.0004 },
];
const expiresAt = Math.floor(Date.now() / 1000) + 120;

await fundIfNeeded(60n * 10n ** 16n); // ~0.06 MON for gas cap
await revokeEnabledDelegations();

const countBefore = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
const h0 = await holdings(net, holder.address);
console.log(`holder ${holder.address} mon=${formatEther(h0.mon)} wmon=${formatEther(h0.wmon)} planBook3 count before=${countBefore}`);

const armed = await createPlan(net, holder, plain, expiresAt, perpl, (s, tx) => console.log(s, tx ?? ""));

const countAfter = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
if (countAfter !== countBefore + 1n) throw new Error(`PlanBook3 count did not increment (${countBefore} -> ${countAfter})`);

let legacyPlanCount = 0;
for (const l of net.legacy) {
  legacyPlanCount += Number(await pub.readContract({ address: l.planBook, abi: abis.planBook, functionName: "count" }));
}
const planId = legacyPlanCount + Number(armed.planId);
const d = armed.signed;
const enforcer = d.caveats[0].enforcer;
if (enforcer.toLowerCase() !== net.enforcer.toLowerCase()) {
  throw new Error(`wrong enforcer ${enforcer}, want ${net.enforcer}`);
}
const bound = decodePerplPosition(d.caveats[0].terms, enforcer);
if (!bound || bound.accountId !== 5429n || Number(bound.marketId) !== 10) {
  throw new Error(`signed terms missing Perpl 5429/10: ${JSON.stringify(bound)}`);
}
const delegationHash = await pub.readContract({
  address: net.delegationManager,
  abi: abis.delegationManager,
  functionName: "getDelegationHash",
  args: [d],
});

const tick = Number(
  await pub.readContract({
    address: enforcer,
    abi: abis.enforcer,
    functionName: "monPriceTick",
    args: [net.pool, net.wmon, net.stable, net.twapSeconds],
  }),
);
console.log(`planId=${planId} (book id ${armed.planId}) arm=${armed.setupHash} tick=${tick} spot~${tickToPrice(tick)}`);

type AttackRow = { kind: string; hash: Hex; status: string; reason: string };
const attacks: AttackRow[] = [];

async function hostile(kind: "line" | "recipient" | "expiry") {
  const { recipient, tranches } = decodeTranches(d.caveats[0].terms, enforcer);
  const spent = await Promise.all(
    tranches.map((_, i) =>
      pub.readContract({ address: enforcer, abi: abis.enforcer, functionName: "spent", args: [delegationHash, BigInt(i)] }),
    ),
  );
  const live = tranches.map((t, i) => ({ t, i })).filter(({ i }) => !spent[i]);
  if (live.length === 0) throw new Error("no live tranche to attack");

  let data: Hex;
  if (kind === "line") {
    const above = live.find(({ t }) => !lineReached(t, tick));
    if (!above) throw new Error("every live line already crossed");
    data = fillCalldata(net, d, above.i);
  } else if (kind === "recipient") {
    const { t, i } = live[0];
    data = redeemCalldata(
      net,
      d,
      i,
      net.router,
      0n,
      swapCalldata(net, keeper.address, t.amountIn, (t.amountIn * t.minOutPerUnit) / 10n ** 18n + 1n),
    );
  } else {
    const exp = Number(BigInt(`0x${d.caveats[1].terms.slice(-32)}`));
    while (Math.floor(Date.now() / 1000) <= exp) {
      await new Promise((r) => setTimeout(r, 2_000));
    }
    data = fillCalldata(net, d, live[0].i);
  }

  const hash = await keeperWallet.sendTransaction({ to: net.delegationManager, data, gas: ATTACK_GAS, ...FEES });
  const rec = await receipt(hash);
  const reason = rec.status === "reverted" ? await revertReason(rpc, hash) : "DID NOT REVERT";
  if (rec.status !== "reverted") throw new Error(`${kind} did not revert: ${hash}`);
  attacks.push({ kind, hash, status: rec.status, reason });
  console.log(`${kind}: ${hash} ${reason}`);
}

await hostile("line");
await hostile("recipient");
await hostile("expiry");

const expect = {
  line: "Tripwire:above-line",
  recipient: "Tripwire:recipient",
  expiry: "TimestampEnforcer:expired-delegation",
};
for (const a of attacks) {
  const want = expect[a.kind as keyof typeof expect];
  if (!a.reason.includes(want)) throw new Error(`${a.kind} reason "${a.reason}" expected to include "${want}"`);
}

const artifact = {
  network: `Monad testnet ${chainId}`,
  enforcer: net.enforcer,
  planBook: net.planBook,
  planId,
  planBookLocalId: String(armed.planId),
  perplAccountId: "5429",
  perplMarketId: 10,
  perplPositionLots: PERPL_ANCHOR.positionLots,
  holder: holder.address,
  delegationHash,
  armTx: armed.setupHash,
  wrapTx: armed.wrapHash,
  attacks: Object.fromEntries(attacks.map((a) => [a.kind, { hash: a.hash, status: a.status, reason: a.reason }])),
};
const runPath = path.join(dir, "runs", `v3-pivot-hostile-${chainId}-${Date.now()}.json`);
fs.mkdirSync(path.dirname(runPath), { recursive: true });
fs.writeFileSync(runPath, JSON.stringify(artifact, null, 2));
console.log(runPath);
