// Bounded real lifecycle proof for the persisted testnet holder.
//   KEEPER_API=... bun run demo/prove-holder-lifecycle.ts
// Uses only the already persisted holder key in demo/.keys.json. It never
// prints or serializes key material, never creates keys, never funds, never
// deploys, never touches mainnet, and never calls hostile or attack endpoints.
// Flow: revoke this holder's enabled prior plan, arm one two tranche plan
// from existing WMON, watch the live keeper fill the crossed target, confirm
// the uncrossed stop stays unfilled, revoke, and write a sanitized artifact.
import fs from "node:fs";
import path from "node:path";
import {
  type Address,
  type Hex,
  formatEther,
  formatUnits,
  parseEther,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  TESTNET,
  abis,
  decodeDelegation,
  lineReached,
  planTotal,
  tickToPrice,
  toTranches,
} from "../web/lib/plan";
import {
  SETUP_GAS_BUDGET,
  clients,
  createPlan,
  holdings,
  revokePlan,
} from "../web/lib/holder";
import {
  EXPECTED_CHAIN_ID,
  EXPECTED_HOLDER,
  LIFECYCLE_TERMS,
  LIVE_KEEPER_API,
  floorOwed,
  type NamedAssertion,
  assertSignedTermsMatch,
} from "./lifecycle-proof";

const FILL_WAIT_MS = 180_000;
const NEGATIVE_MS = 48_000;
const POST_REVOKE_MS = 10_000;
const POLL_MS = 3_000;
const EXPECTED_WMON = parseEther("0.01");
const TRANCHE_WMON = parseEther("0.005");

type KeeperFill = { index: number; hash: Hex };
type KeeperPlan = {
  id: number;
  holder: Address;
  delegationHash: Hex;
  postedTx: Hex;
  delegation: Hex;
  revoked: boolean;
  fills: KeeperFill[];
};

const dir = path.dirname(new URL(import.meta.url).pathname);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lower = (h: string) => h.toLowerCase();
const wei = (v: bigint) => v.toString();

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const assertions: NamedAssertion[] = [];
  const artifact: Record<string, unknown> = {
    startedAt,
    chainId: EXPECTED_CHAIN_ID,
    holder: EXPECTED_HOLDER,
    keeper: TESTNET.keeper,
    keeperApi: process.env.KEEPER_API ?? LIVE_KEEPER_API,
    terms: LIFECYCLE_TERMS,
  };
  const writeArtifact = () => {
    artifact.finishedAt = new Date().toISOString();
    artifact.assertions = assertions;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const out = path.join(dir, "runs", `lifecycle-10143-${stamp}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        artifact,
        (_, v) => (typeof v === "bigint" ? wei(v) : v),
        2,
      ),
    );
    console.log(`artifact ${out}`);
  };
  const need = (ok: boolean, name: string, detail?: string) => {
    assertions.push({ name, ok, detail });
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
    if (!ok) throw new Error(`assertion failed: ${name}${detail ? ` (${detail})` : ""}`);
  };

  try {
    const net = TESTNET;
    const api = process.env.KEEPER_API ?? LIVE_KEEPER_API;
    const keys = JSON.parse(
      fs.readFileSync(path.join(dir, ".keys.json"), "utf8"),
    ) as Record<string, Hex>;
    if (!keys.holder) throw new Error("no persisted holder key in demo/.keys.json");
    const account = privateKeyToAccount(keys.holder);
    const holder = account.address;
    const holderLower = lower(holder);
    need(
      holderLower === lower(EXPECTED_HOLDER),
      "holder key resolves to the persisted holder",
      holder,
    );

    const { pub } = clients(net);
    const chainId = await pub.getChainId();
    need(chainId === EXPECTED_CHAIN_ID, "connected to Monad testnet", `chainId ${chainId}`);

    const owners = fs.readFileSync(path.join(dir, "owners.log"), "utf8");
    need(
      owners
        .split("\n")
        .some((l) => lower(l).includes(holderLower) && lower(l).includes("gas top-up")),
      "holder gas top-up is logged in demo/owners.log",
    );

    const pre = await holdings(net, holder);
    need(pre.wmon === EXPECTED_WMON, "holder holds exactly 0.01 WMON", `${formatEther(pre.wmon)} WMON`);
    need(pre.mon >= SETUP_GAS_BUDGET, "native balance covers setup gas", `${formatEther(pre.mon)} MON`);

    const tranches = toTranches(LIFECYCLE_TERMS);
    const total = planTotal(tranches);
    need(total === EXPECTED_WMON, "plan totals exactly 0.01 MON", `${formatEther(total)} MON`);
    need(total <= pre.wmon, "planned amount covered by existing WMON");

    const tick = Number(
      await pub.readContract({
        address: net.enforcer,
        abi: abis.enforcer,
        functionName: "monPriceTick",
        args: [net.pool, net.wmon, net.stable, net.twapSeconds],
      }),
    );
    artifact.priceBefore = { tick, price: tickToPrice(tick) };
    need(lineReached(tranches[0], tick), "target line already crossed", `price ${tickToPrice(tick)} line ${LIFECYCLE_TERMS[0].line}`);
    need(!lineReached(tranches[1], tick), "stop line not crossed", `price ${tickToPrice(tick)} line ${LIFECYCLE_TERMS[1].line}`);

    const keeperPlans = async (): Promise<KeeperPlan[]> => {
      const r = await fetch(`${api}/api/plans?holder=${holder}`);
      const body = (await r.json()) as { plans?: KeeperPlan[]; error?: string };
      if (!r.ok) throw new Error(`keeper plans: ${body.error ?? r.status}`);
      return body.plans ?? [];
    };

    // Revoke this holder's enabled prior plans first. Nothing else is touched.
    const priorRevoked: { id: number; delegationHash: Hex; revokeTx: Hex; status: string }[] = [];
    for (const p of await keeperPlans()) {
      if (lower(p.holder) !== holderLower) continue;
      if (lower(decodeDelegation(p.delegation).delegator) !== holderLower) continue;
      const disabled = await pub.readContract({
        address: net.delegationManager,
        abi: abis.delegationManager,
        functionName: "disabledDelegations",
        args: [p.delegationHash],
      });
      if (disabled) continue;
      const revokeTx = await revokePlan(net, account, decodeDelegation(p.delegation), p.delegationHash);
      const receipt = await pub.getTransactionReceipt({ hash: revokeTx });
      need(receipt.status === "success", "prior revoke receipt succeeded", `${p.id} ${revokeTx}`);
      const off = await pub.readContract({
        address: net.delegationManager,
        abi: abis.delegationManager,
        functionName: "disabledDelegations",
        args: [p.delegationHash],
      });
      need(off === true, "prior plan delegation disabled", `${p.id}`);
      priorRevoked.push({ id: p.id, delegationHash: p.delegationHash, revokeTx, status: receipt.status });
    }
    artifact.priorRevoked = priorRevoked;

    const countBefore = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const { perplBindFromAnchor } = await import("../web/lib/perplAnchor");
    const res = await createPlan(net, account, LIFECYCLE_TERMS, expiresAt, perplBindFromAnchor(), (s, h) =>
      console.log(`  ${s}${h ? ` ${h}` : ""}`),
    );
    need(res.wrapHash === null, "setup wrapped no MON");
    const setupReceipt = await pub.getTransactionReceipt({ hash: res.setupHash });
    need(setupReceipt.status === "success", "setup receipt succeeded", res.setupHash);
    const countAfter = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
    need(countAfter === countBefore + 1n, "PlanBook count increments by exactly one", `${countBefore} to ${countAfter}`);
    const ids = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "plansOf", args: [holder] });
    need(ids.some((id) => id === res.planId), "plansOf includes the new plan", `plan ${res.planId}`);
    const readBack = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "plan", args: [res.planId] });
    const delegationHash = await pub.readContract({
      address: net.delegationManager,
      abi: abis.delegationManager,
      functionName: "getDelegationHash",
      args: [res.signed],
    });
    need(lower(readBack.holder) === holderLower, "PlanBook read-back holder matches", readBack.holder);
    need(lower(readBack.keeper) === lower(TESTNET.keeper), "PlanBook read-back keeper matches", readBack.keeper);
    need(lower(readBack.delegationHash) === lower(delegationHash), "PlanBook read-back delegation hash matches", delegationHash);
    try {
      assertSignedTermsMatch(res.signed, LIFECYCLE_TERMS, holder);
      need(true, "signed terms match both tranches exactly");
    } catch (e) {
      need(false, "signed terms match both tranches exactly", String((e as Error).message).slice(0, 200));
    }
    const atSetup = await holdings(net, holder);
    artifact.newPlan = {
      planId: wei(res.planId),
      delegationHash,
      setupTx: res.setupHash,
      setupStatus: setupReceipt.status,
      wrapTx: res.wrapHash,
      expiresAt,
      countBefore: wei(countBefore),
      countAfter: wei(countAfter),
    };

    // Wait at most 180 seconds for the crossed target to be spent and indexed.
    const deadline = Date.now() + FILL_WAIT_MS;
    let fillHash: Hex | null = null;
    let spent0 = false;
    for (;;) {
      spent0 = await pub.readContract({
        address: net.enforcer,
        abi: abis.enforcer,
        functionName: "spent",
        args: [delegationHash, 0n],
      });
      const entry = (await keeperPlans()).find((p) => lower(p.delegationHash) === lower(delegationHash));
      fillHash = entry?.fills.find((f) => f.index === 0)?.hash ?? null;
      if (spent0 && fillHash) break;
      if (Date.now() >= deadline) break;
      await sleep(POLL_MS);
    }
    need(spent0, "tranche 0 spent within 180 seconds");
    need(fillHash !== null, "tranche 0 fill indexed by the keeper API");
    const fillReceipt = await pub.getTransactionReceipt({ hash: fillHash as Hex });
    need(fillReceipt.status === "success", "fill receipt succeeded", fillHash as string);
    need(lower(fillReceipt.from) === lower(TESTNET.keeper), "fill sender is the testnet keeper", fillReceipt.from);
    const filledEvents = parseEventLogs({ abi: abis.enforcer, logs: fillReceipt.logs, eventName: "TrancheFilled" });
    const filledEvent = filledEvents.find((e) => lower(String(e.args.delegationHash)) === lower(delegationHash));
    need(!!filledEvent, "TrancheFilled for the new delegation is on chain", fillHash as string);
    need(filledEvent?.args.index === 0n, "fill event is tranche 0");
    need(filledEvent?.args.amountIn === tranches[0].amountIn, "fill event carries the exact WMON tranche amount", wei(tranches[0].amountIn));
    need(lower(String(filledEvent?.args.recipient)) === holderLower, "fill event pays the holder");
    const afterFill = await holdings(net, holder);
    need(atSetup.wmon - afterFill.wmon === TRANCHE_WMON, "holder WMON falls by exactly 0.005", `${formatEther(atSetup.wmon - afterFill.wmon)} WMON`);
    const owed = floorOwed(tranches[0].amountIn, tranches[0].minOutPerUnit);
    need(afterFill.stable - atSetup.stable >= owed, "holder stablecoin meets the signed floor", `${formatUnits(afterFill.stable - atSetup.stable, net.stableDecimals)} aUSD floor ${formatUnits(owed, net.stableDecimals)}`);
    artifact.fill = {
      hash: fillHash,
      status: fillReceipt.status,
      from: fillReceipt.from,
      priceTick: filledEvent?.args.priceTick === undefined ? null : Number(filledEvent.args.priceTick),
      wmonDelta: wei(atSetup.wmon - afterFill.wmon),
      stableDelta: formatUnits(afterFill.stable - atSetup.stable, net.stableDecimals),
      floorOwed: formatUnits(owed, net.stableDecimals),
      balances: { wmon: wei(afterFill.wmon), stable: wei(afterFill.stable), mon: wei(afterFill.mon) },
    };

    // Negative case: at least 45 seconds with a bounded poll, tranche 1 untouched.
    const negStart = Date.now();
    for (;;) {
      const spent1 = await pub.readContract({
        address: net.enforcer,
        abi: abis.enforcer,
        functionName: "spent",
        args: [delegationHash, 1n],
      });
      if (spent1) need(false, "tranche 1 spent bit stays false during the negative window");
      if (Date.now() - negStart >= NEGATIVE_MS) break;
      await sleep(POLL_MS);
    }
    const negEntry = (await keeperPlans()).find((p) => lower(p.delegationHash) === lower(delegationHash));
    need(!negEntry?.fills.some((f) => f.index === 1), "no tranche 1 fill in the keeper API");
    const negHold = await holdings(net, holder);
    need(negHold.wmon === afterFill.wmon && negHold.stable === afterFill.stable, "holder balances unchanged while the stop waits");
    artifact.negativeWindow = {
      observedMs: Date.now() - negStart,
      spent1: false,
      fills: negEntry?.fills ?? [],
      balances: { wmon: wei(negHold.wmon), stable: wei(negHold.stable), mon: wei(negHold.mon) },
    };

    const revokeTx = await revokePlan(net, account, res.signed, delegationHash);
    const revokeReceipt = await pub.getTransactionReceipt({ hash: revokeTx });
    need(revokeReceipt.status === "success", "revoke receipt succeeded", revokeTx);
    const disabled = await pub.readContract({
      address: net.delegationManager,
      abi: abis.delegationManager,
      functionName: "disabledDelegations",
      args: [delegationHash],
    });
    need(disabled === true, "new plan delegation disabled", revokeTx);
    const preQuiet = await holdings(net, holder);
    await sleep(POST_REVOKE_MS);
    const spent1After = await pub.readContract({
      address: net.enforcer,
      abi: abis.enforcer,
      functionName: "spent",
      args: [delegationHash, 1n],
    });
    const quietEntry = (await keeperPlans()).find((p) => lower(p.delegationHash) === lower(delegationHash));
    const quietHold = await holdings(net, holder);
    need(spent1After === false, "no later fill after revoke");
    need(
      (quietEntry?.fills.length ?? 0) === (negEntry?.fills.length ?? 0),
      "keeper fill list unchanged after revoke",
    );
    need(quietHold.wmon === preQuiet.wmon && quietHold.stable === preQuiet.stable, "balances unchanged after revoke");
    artifact.revoke = {
      revokeTx,
      status: revokeReceipt.status,
      balances: { wmon: wei(quietHold.wmon), stable: wei(quietHold.stable), mon: wei(quietHold.mon) },
    };

    writeArtifact();
    console.log("PASS");
  } catch (e) {
    try {
      const dir2 = path.dirname(new URL(import.meta.url).pathname);
      artifact.finishedAt = new Date().toISOString();
      artifact.error = String(e instanceof Error ? e.message : e).slice(0, 300);
      artifact.assertions = assertions;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const out = path.join(dir2, "runs", `lifecycle-10143-${stamp}.json`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(artifact, (_, v) => (typeof v === "bigint" ? wei(v) : v), 2));
      console.log(`artifact ${out}`);
    } catch {
      // artifact write is best effort on failure
    }
    console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    process.exit(1);
  }
}

await main();
