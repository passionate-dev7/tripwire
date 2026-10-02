"use client";
// Everything the screens read and do. Chain reads come from Monad directly (holdings); the keeper's index supplies
// plans, fills, history and its heartbeat. Every action returns the transaction it sent; nothing is shown as done
// until its receipt and post-condition have been read (lib/holder.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex, LocalAccount } from "viem";
import { type Attack, type PlanView, type Point, type Status, keeperApi } from "../lib/api";
import { type Holdings, createPlan, holdings, revokePlan, unwrap } from "../lib/holder";
import { createPasskeyAccount, signInWithPasskey } from "../lib/passkey";
import { TESTNET, type PlainTranche, decodeDelegation } from "../lib/plan";
import { revertReason } from "../lib/chain";

export type Step = { label: string; hash?: Hex };
const net = TESTNET;

function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[]): { data: T | null; error: string | null; at: number } {
  const [state, set] = useState<{ data: T | null; error: string | null; at: number }>({ data: null, error: null, at: 0 });
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const data = await fn();
        if (live) set({ data, error: null, at: Date.now() });
      } catch (e) {
        if (live) set((s) => ({ ...s, error: (e as Error).message }));
      }
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      live = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useTripwire() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<Record<string, Attack & { chainReason?: string }>>({});
  const nonce = useRef(0);
  const [refresh, setRefresh] = useState(0);

  const status = usePoll<Status>(keeperApi.status, 4000, []);
  const history = usePoll<{ points: Point[] }>(keeperApi.history, 15000, []);
  const mine = usePoll<{ plans: PlanView[] } | null>(async () => (account ? keeperApi.plans(account.address) : null), 4000, [account?.address, refresh]);
  const recent = usePoll(keeperApi.recent, 8000, []);
  // the newest plan on chain, shown read-only to anyone not signed in
  const latestHolder = recent.data?.plans.find((p) => p.sales.length || p.refused.length)?.holder ?? null;
  const publicPlans = usePoll<{ plans: PlanView[] } | null>(async () => (latestHolder && !account ? keeperApi.plans(latestHolder) : null), 8000, [latestHolder, account?.address]);
  const held = usePoll<Holdings | null>(async () => (account ? holdings(net, account.address) : null), 5000, [account?.address, refresh]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const cause = (e as { cause?: { name?: string; message?: string } }).cause;
      setError(`${String((e as Error).message).split("\n")[0]}${cause?.message ? ` (${cause.name ?? "cause"}: ${cause.message})` : ""}`);
    } finally {
      setBusy(null);
      setRefresh((r) => r + 1);
    }
  }, []);

  const signIn = () => run("Signing in", async () => setAccount((await signInWithPasskey()).account));
  const create = (name: string) => run("Creating your passkey", async () => setAccount((await createPasskeyAccount(name)).account));

  const arm = (plain: PlainTranche[], expiresAt: number) =>
    run("Arming", async () => {
      if (!account) throw new Error("Sign in with your passkey first.");
      const id = ++nonce.current;
      setSteps([]);
      await createPlan(net, account, plain, expiresAt, (label, hash) => {
        if (id === nonce.current) setSteps((s) => [...s, { label, hash }]);
      });
    });

  const revoke = (p: PlanView) =>
    run(`Revoking plan ${p.id}`, async () => {
      if (!account) throw new Error("Sign in with your passkey first.");
      const tx = await revokePlan(net, account, decodeDelegation(p.delegation), p.delegationHash);
      setSteps([{ label: `Plan ${p.id} revoked`, hash: tx }]);
    });

  const takeBack = (amount: bigint) =>
    run("Unwrapping", async () => {
      if (!account) throw new Error("Sign in with your passkey first.");
      const tx = await unwrap(net, account, amount);
      setSteps([{ label: "WMON turned back into MON", hash: tx }]);
    });

  const drip = () =>
    run("Getting testnet MON", async () => {
      if (!account) throw new Error("Sign in with your passkey first.");
      const r = await keeperApi.drip(account.address);
      setSteps([{ label: "0.1 testnet MON received", hash: r.hash }]);
    });

  /** Ask the keeper to break the plan on purpose, then read the revert from the chain ourselves. */
  const cheat = (p: PlanView, kind: Attack["kind"]) =>
    run(`Keeper tries: ${kind}`, async () => {
      const a = await keeperApi.attack(p.id, kind);
      const chainReason = a.status === "reverted" ? await revertReason(net.rpc, a.hash) : "did not revert";
      setAttacks((m) => ({ ...m, [`${p.id}:${kind}`]: { ...a, chainReason } }));
    });

  return {
    net,
    account,
    status,
    history,
    plans: mine.data?.plans ?? [],
    plansLoaded: mine.at > 0,
    holdings: held.data,
    recent: recent.data,
    publicPlan: publicPlans.data?.plans.find((p) => p.fills.length || p.attacks.length) ?? null,
    busy,
    steps,
    error,
    attacks,
    drip,
    signIn,
    create,
    arm,
    revoke,
    takeBack,
    cheat,
  };
}
