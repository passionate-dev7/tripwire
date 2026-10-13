"use client";
// Everything the screens read and do. Chain reads come from Monad directly (holdings); the keeper's index supplies
// plans, fills, history and its heartbeat. Every action returns the transaction it sent; nothing is shown as done
// until its receipt and post-condition have been read (lib/holder.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex, LocalAccount } from "viem";
import { type Attack, type PlanView, type Point, type Status, keeperApi } from "../lib/api";
import { type Holdings, createPlan, holdings, revokePlan, revokedOnChain, unwrap } from "../lib/holder";
import { createPasskeyAccount, signInWithPasskey } from "../lib/passkey";
import { type PlainTranche, decodeDelegation } from "../lib/plan";
import { revertReason } from "../lib/chain";
import { useNet } from "./parts";

export type Step = { label: string; hash?: Hex };

function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[], enabled = true): { data: T | null; error: string | null; at: number } {
  const [state, set] = useState<{ data: T | null; error: string | null; at: number }>({ data: null, error: null, at: 0 });
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, ...deps]);
  return state;
}

export function useTripwire() {
  // The address names the network, and a static export only knows it after mount: nothing is fetched or signed before
  // that, and nothing on a network whose contracts are not deployed (their addresses are the zero address).
  const net = useNet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const live = mounted && net.deployed;
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<Record<string, Attack & { chainReason?: string }>>({});
  const nonce = useRef(0);
  const [refresh, setRefresh] = useState(0);

  const status = usePoll<Status>(keeperApi.status, 4000, [net.key], live);
  const history = usePoll<{ points: Point[] }>(keeperApi.history, 15000, [net.key], live);
  // A revoke is read from the DelegationManager as well: the keeper's snapshot of a plan can trail it.
  const mine = usePoll<{ plans: PlanView[] } | null>(async () => {
    if (!account) return null;
    const { plans } = await keeperApi.plans(account.address);
    return { plans: await Promise.all(plans.map(async (p) => (p.revoked ? p : { ...p, revoked: await revokedOnChain(net, p.delegationHash) }))) };
  }, 4000, [account?.address, refresh, net.key], live);
  const recent = usePoll(keeperApi.recent, 8000, [net.key], live);
  // the newest plan on chain, shown read-only to anyone not signed in
  // the newest plan that carries refused calls, so the proof never disappears when someone arms a fresh plan
  const latestHolder = recent.data?.plans.find((p) => p.refused.length > 0)?.holder ?? null;
  const publicPlans = usePoll<{ plans: PlanView[] } | null>(async () => (latestHolder && !account ? keeperApi.plans(latestHolder) : null), 8000, [latestHolder, account?.address, net.key], live);
  const held = usePoll<Holdings | null>(async () => (account ? holdings(net, account.address) : null), 5000, [account?.address, refresh, net.key], live);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      if (!net.deployed) throw new Error(`${net.name} contracts are coming online. Nothing can be signed there yet.`);
      await fn();
    } catch (e) {
      const cause = (e as { cause?: { name?: string; message?: string } }).cause;
      setError(`${String((e as Error).message).split("\n")[0]}${cause?.message ? ` (${cause.name ?? "cause"}: ${cause.message})` : ""}`);
    } finally {
      setBusy(null);
      setRefresh((r) => r + 1);
    }
  }, [net]);

  const signIn = () => run("Signing in", async () => setAccount((await signInWithPasskey()).account));
  const create = (name: string) => run("Creating your passkey", async () => setAccount((await createPasskeyAccount(name)).account));

  const arm = (plain: PlainTranche[], expiresAt: number) =>
    run("Arming", async () => {
      if (!account) throw new Error("Sign in with your passkey first.");
      const id = ++nonce.current;
      setSteps([]);
      const { perplBindFromAnchor } = await import("../lib/perplAnchor");
      await createPlan(net, account, plain, expiresAt, perplBindFromAnchor(), (label, hash) => {
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
      if (net.key !== "testnet") throw new Error("Testnet MON is only sent on Monad testnet.");
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
    recentError: recent.error,
    publicPlan: [...(publicPlans.data?.plans ?? [])].reverse().find((p) => p.attacks.length > 0) ?? null,
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
