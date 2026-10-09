// Three hostile redemptions the operator demo requires: sell above the line, pay someone else, fire after expiry.
// Network: Monad testnet (chainId 10143), same TripwirePlanEnforcer bytecode as production deploy.
//   bun run demo/risk-hostile-three.ts [keeperApiBase]
// Uses the live keeper API for line and recipient when KEEPER_API or arg is set; always runs expiry locally with demo keys.
import fs from "node:fs";
import path from "node:path";
import { type Hex, createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { revertReason } from "../web/lib/chain";
import {
  TESTNET,
  abis,
  buildDelegation,
  fillCalldata,
  redeemCalldata,
  signDelegation,
  swapCalldata,
  toTranches,
} from "../web/lib/plan";

const api = process.argv[2] ?? process.env.KEEPER_API ?? "https://tripwire-three.vercel.app";
const rpc = process.env.MONAD_TESTNET_RPC_URL ?? TESTNET.rpc;
const pub = createPublicClient({ transport: http(rpc) });
const chainId = await pub.getChainId();
const net = { ...TESTNET, rpc, chainId };
const chain = { id: chainId, name: "monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
const FEES = { maxFeePerGas: 110_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n } as const;
const REDEEM_GAS = 500_000n;

const keysPath = path.join(path.dirname(new URL(import.meta.url).pathname), ".keys.json");
const keys = JSON.parse(fs.readFileSync(keysPath, "utf8")) as { keeper: Hex; holder: Hex };
const keeper = privateKeyToAccount(keys.keeper);
const holder = privateKeyToAccount(keys.holder);
const w = createWalletClient({ account: keeper, chain, transport: http(rpc) });

async function receipt(hash: Hex) {
  return pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000 });
}

const out: Record<string, { network: string; command: string; hash: Hex; status: string; reason: string }> = {};

async function attackApi(planId: number, kind: string) {
  const r = await fetch(`${api}/api/attack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId, kind }),
  });
  const body = (await r.json()) as { hash?: Hex; reason?: string; error?: string };
  if (body.error) throw new Error(`${kind}: ${body.error}`);
  if (!body.hash) throw new Error(`${kind}: no hash`);
  const rec = await receipt(body.hash);
  const reason = rec.status === "reverted" ? await revertReason(rpc, body.hash) : "DID NOT REVERT";
  if (rec.status !== "reverted") throw new Error(`${kind} was not stopped: ${body.hash}`);
  out[kind] = {
    network: `Monad testnet ${chainId}`,
    command: `curl -sf -X POST ${api}/api/attack -d '{"planId":${planId},"kind":"${kind}"}'`,
    hash: body.hash,
    status: rec.status,
    reason,
  };
  console.log(`${kind}: ${body.hash} ${reason}`);
}

const recent = (await (await fetch(`${api}/api/recent`)).json()) as { plans: { plan: number }[] };
const planId = recent.plans.at(-1)?.plan;
if (planId === undefined) throw new Error("no indexed plan on keeper");
await attackApi(planId, "line");
await attackApi(planId, "recipient");

const tranches = toTranches([{ mon: "0.001", line: 0.05, floor: 0.04 }]);
const expiresAt = Math.floor(Date.now() / 1000) - 120;
const { perplBindFromAnchor } = await import("../web/lib/perplAnchor");
const signed = await signDelegation(
  net,
  holder,
  buildDelegation(net, holder.address, keeper.address, tranches, expiresAt, 99n, perplBindFromAnchor()),
);
const expiryHash = await w.sendTransaction({ to: net.delegationManager, data: fillCalldata(net, signed, 0), gas: REDEEM_GAS, ...FEES });
const expiryRec = await receipt(expiryHash);
const expiryReason = expiryRec.status === "reverted" ? await revertReason(rpc, expiryHash) : "DID NOT REVERT";
if (expiryRec.status !== "reverted") throw new Error(`expiry was not stopped: ${expiryHash}`);
out.expiry = {
  network: `Monad testnet ${chainId}`,
  command: `bun run demo/risk-hostile-three.ts (local fill after expiresAt=${expiresAt})`,
  hash: expiryHash,
  status: expiryRec.status,
  reason: expiryReason,
};
console.log(`expiry: ${expiryHash} ${expiryReason}`);

const runPath = path.join(path.dirname(new URL(import.meta.url).pathname), "runs", `risk-hostile-three-${chainId}-${Date.now()}.json`);
fs.mkdirSync(path.dirname(runPath), { recursive: true });
fs.writeFileSync(runPath, JSON.stringify(out, null, 2));
console.log(runPath);
