// What a holder's browser does on chain, each step confirmed by its receipt and a post-condition read back.
// The signer is the holder's own account (a Mera passkey session); nothing here holds a key.
import {
  type Address,
  type Hex,
  type LocalAccount,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseEther,
} from "viem";
import {
  type Delegation,
  type Net,
  type PlainTranche,
  abis,
  buildDelegation,
  planTotal,
  setupCalldata,
  signDelegation,
  toTranches,
  wrapCall,
} from "./plan";

// Testnet base fee is 100 gwei. Monad charges the full gas limit, and the sender must hold limit x cap up front.
export const FEES = { maxFeePerGas: 110_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n } as const;
/** Monad keeps this much in an account that has delegated its code; below it, MON value cannot leave in a 7702 tx. */
export const RESERVE = parseEther("10");

export function clients(net: Net) {
  const chain = {
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [net.rpc] } },
  } as const;
  return { chain, pub: createPublicClient({ chain, transport: http(net.rpc, { retryCount: 4 }) }) };
}

export type Holdings = { mon: bigint; wmon: bigint; stable: bigint; allowance: bigint; delegated: boolean; delegatedTo: Address | null };

export async function holdings(net: Net, holder: Address): Promise<Holdings> {
  const { pub } = clients(net);
  const [mon, wmon, stable, allowance, code] = await Promise.all([
    pub.getBalance({ address: holder }),
    pub.readContract({ address: net.wmon, abi: abis.wmon, functionName: "balanceOf", args: [holder] }),
    pub.readContract({ address: net.stable, abi: erc20Abi, functionName: "balanceOf", args: [holder] }),
    pub.readContract({ address: net.wmon, abi: abis.wmon, functionName: "allowance", args: [holder, net.router] }),
    pub.getCode({ address: holder }),
  ]);
  const delegatedTo = code && code.startsWith("0xef0100") ? (`0x${code.slice(8, 48)}` as Address) : null;
  return { mon, wmon, stable, allowance, delegated: delegatedTo !== null, delegatedTo };
}

/** Why this holder cannot set this plan up right now, or null. Gas is counted at the cap Monad will reserve. */
export function setupBlocker(h: Holdings, total: bigint, gasBudget: bigint): string | null {
  const toWrap = total > h.wmon ? total - h.wmon : 0n;
  if (h.mon < toWrap + gasBudget) {
    return `This plan needs ${fmt(toWrap + gasBudget)} MON (${fmt(toWrap)} to set aside, ${fmt(gasBudget)} for gas). The account holds ${fmt(h.mon)}.`;
  }
  if (toWrap > 0n && h.delegated && h.mon - toWrap < RESERVE) {
    return "This account already runs tripwire and holds under 10 MON, so Monad will not let MON leave it in a delegated account. Top up above 10 MON, or set the plan from a fresh passkey.";
  }
  return null;
}

const fmt = (wei: bigint) => (Number(wei) / 1e18).toFixed(4).replace(/\.?0+$/, "");

export const SETUP_GAS_BUDGET = (60_000n + 420_000n) * FEES.maxFeePerGas;

export type Progress = (step: string, hash?: Hex) => void;

/** Sign the plan, then set it up: wrap (only what is missing), then one 7702 transaction that approves and posts. */
export async function createPlan(
  net: Net,
  account: LocalAccount,
  plain: PlainTranche[],
  expiresAt: number,
  onStep: Progress,
): Promise<{ signed: Delegation; wrapHash: Hex | null; setupHash: Hex; planId: bigint }> {
  const { chain, pub } = clients(net);
  const wallet = createWalletClient({ account, chain, transport: http(net.rpc) });
  const tranches = toTranches(plain, net.stableDecimals);
  const total = planTotal(tranches);
  const before = await holdings(net, account.address);
  const blocker = setupBlocker(before, total, SETUP_GAS_BUDGET);
  if (blocker) throw new Error(blocker);

  onStep("Signing the plan");
  const signed = await signDelegation(net, account, buildDelegation(net, account.address, net.keeper, tranches, expiresAt, BigInt(Date.now())));

  let wrapHash: Hex | null = null;
  const toWrap = total > before.wmon ? total - before.wmon : 0n;
  if (toWrap > 0n) {
    onStep("Setting aside MON as WMON");
    const call = wrapCall(net, toWrap);
    const gas = ((await pub.estimateGas({ account: account.address, ...call })) * 13n) / 10n;
    wrapHash = await wallet.sendTransaction({ ...call, gas, ...FEES });
    const r = await pub.waitForTransactionReceipt({ hash: wrapHash, timeout: 60_000, pollingInterval: 800 });
    if (r.status !== "success") throw new Error(`Setting aside MON failed (${wrapHash}).`);
    onStep("MON set aside", wrapHash);
    // the delegation transaction must come after Monad's 3-block execution lag has passed the wrap
    while ((await pub.getBlockNumber()) < r.blockNumber + 4n) await new Promise((res) => setTimeout(res, 400));
  }

  onStep("Arming the plan");
  const authorizationList =
    before.delegatedTo?.toLowerCase() === net.statelessDeleGator.toLowerCase()
      ? undefined
      : [await wallet.signAuthorization({ contractAddress: net.statelessDeleGator, executor: "self" })];
  const data = setupCalldata(net, signed, before.allowance + total);
  const countBefore = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "count" });
  const gas = ((await pub.estimateGas({ account: account.address, to: account.address, data, authorizationList })) * 13n) / 10n;
  const setupHash = await wallet.sendTransaction({ to: account.address, data, authorizationList, gas, ...FEES });
  const r = await pub.waitForTransactionReceipt({ hash: setupHash, timeout: 60_000, pollingInterval: 800 });
  if (r.status !== "success") throw new Error(`Arming the plan failed (${setupHash}).`);
  const after = await holdings(net, account.address);
  const mine = await pub.readContract({ address: net.planBook, abi: abis.planBook, functionName: "plansOf", args: [account.address] });
  const planId = mine.at(-1);
  if (!after.delegated || after.allowance < total || planId === undefined || planId < countBefore) {
    throw new Error(`The transaction landed but the plan did not read back (${setupHash}).`);
  }
  onStep("Plan armed", setupHash);
  return { signed, wrapHash, setupHash, planId };
}

/** Disable the plan's delegation at the DelegationManager; read back that it is disabled. */
export async function revokePlan(net: Net, account: LocalAccount, signed: Delegation, hash: Hex): Promise<Hex> {
  const { chain, pub } = clients(net);
  const wallet = createWalletClient({ account, chain, transport: http(net.rpc) });
  const data = encodeFunctionData({ abi: abis.delegationManager, functionName: "disableDelegation", args: [signed] });
  const gas = ((await pub.estimateGas({ account: account.address, to: net.delegationManager, data })) * 13n) / 10n;
  const tx = await wallet.sendTransaction({ to: net.delegationManager, data, gas, ...FEES });
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 60_000, pollingInterval: 800 });
  const off = await pub.readContract({ address: net.delegationManager, abi: abis.delegationManager, functionName: "disabledDelegations", args: [hash] });
  if (r.status !== "success" || !off) throw new Error(`Revoke not confirmed (${tx}). The plan is still armed.`);
  return tx;
}

/** Turn set-aside WMON back into MON. */
export async function unwrap(net: Net, account: LocalAccount, amount: bigint): Promise<Hex> {
  const { chain, pub } = clients(net);
  const wallet = createWalletClient({ account, chain, transport: http(net.rpc) });
  const data = encodeFunctionData({ abi: abis.wmon, functionName: "withdraw", args: [amount] });
  const gas = ((await pub.estimateGas({ account: account.address, to: net.wmon, data })) * 13n) / 10n;
  const tx = await wallet.sendTransaction({ to: net.wmon, data, gas, ...FEES });
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 60_000, pollingInterval: 800 });
  if (r.status !== "success") throw new Error(`Unwrap failed (${tx}).`);
  return tx;
}
