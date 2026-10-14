"use client";
// The first screen: what tripwire is in one breath, the keeper's live record of refused cheats right under it, and
// the chain details a holder can open but never has to read. Every number here is read from the keeper's index
// (/api/recent) or the chain; nothing is typed in.
import { useEffect, useState } from "react";
import type { Status } from "../lib/api";
import { apiBase } from "../lib/net";
import { TESTNET, type Net } from "../lib/plan";
import { PERPL_ANCHOR } from "../lib/perplAnchor";
import type { useTripwire } from "./useTripwire";
import { Card, Check, Fact, TxLink, fmtPrice, short, useNet } from "./parts";

type T = ReturnType<typeof useTripwire>;

export function Hero() {
  return (
    <section aria-labelledby="claim" className="min-w-0">
      <h1 id="claim" className="max-w-[640px] text-[28px] font-medium leading-[1.15] tracking-[0.1px] text-ink sm:text-[36px]">
        Let a bot sell for you. The chain makes sure it can only make the sale you signed.
      </h1>
      <p className="mt-2 max-w-[600px] text-[14px] leading-6 text-body sm:mt-3 sm:text-[16px] sm:leading-7">
        A new kind of permission: your price line, floor, amount and payout address are written into what you sign, and Monad checks every sale against them. Stop-losses, take-profits and staged exits, up to sixteen sales in one signature, and your MON never leaves your wallet.
      </p>
      <ul className="mt-4 hidden flex-wrap gap-x-5 gap-y-2 text-[14px] leading-5 text-ink sm:flex">
        {["Only at your line", "Never under your floor", "Only to your address", "Only until your end date"].map((rule) => (
          <li key={rule} className="flex items-center gap-1.5">
            <Check className="shrink-0 text-body" />
            {rule}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TRIED: Record<string, string> = {
  line: "sell before MON reached the line",
  floor: "sell for less than the floor",
  recipient: "pay the proceeds to itself",
  expiry: "sell after the plan expired",
};

/** The mainnet deployment as a status row: what is live, at which address, from which block, each linked to the explorer. */
function LiveRow({ net }: { net: Net }) {
  const addr = (a: string) => a.toLowerCase();
  const link = (path: string, text: string) => (
    <a className="num underline decoration-hairline-strong underline-offset-4 hover:text-ink hover:decoration-ink" href={`${net.explorer}/${path}`} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
  const item = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline gap-2">
      <dt className="text-mute">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] leading-5" aria-label={`Live on ${net.name}`}>
      {item("Plan enforcer", link(`address/${net.enforcer}`, short(addr(net.enforcer))))}
      {item("Plan book", link(`address/${net.planBook}`, short(addr(net.planBook))))}
      {item("From block", link(`block/${net.planBookFromBlock}`, net.planBookFromBlock.toString()))}
    </dl>
  );
}

/** The testnet keeper's record, read from its own API while the page is on mainnet. */
function useTestnetRecord(enabled: boolean) {
  const [state, setState] = useState<{ sent: number; reverted: number; paid: number } | { error: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`${apiBase(TESTNET)}/recent`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok || !b.totals) throw new Error(b.error ?? `keeper ${r.status}`);
        if (live) setState({ sent: b.totals.forbiddenSent, reverted: b.totals.forbiddenReverted, paid: b.totals.forbiddenPaidOut });
      })
      .catch((e: Error) => live && setState({ error: e.message }));
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

function Figure({ n, label, tone = "text-ink", onGo }: { n: number; label: string; tone?: string; onGo: (e: React.MouseEvent) => void }) {
  return (
    <a href="#refusals" onClick={onGo} className="group -mx-1 min-w-0 rounded-md px-1 transition-colors duration-150 hover:bg-surface-elevated">
      <div className={`num text-[48px] font-medium leading-[52px] ${tone}`}>{n}</div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-mute group-hover:text-body">{label}</div>
    </a>
  );
}

export function ProofStrip({ t, onCheat }: { t: T; onCheat: () => void }) {
  const net = useNet();
  const tot = t.recent?.totals;
  const plans = t.recent?.plans ?? [];
  const holder = plans.find((p) => p.refused.length > 0);
  const latest = holder?.refused.at(-1);
  const first = !!tot && tot.plans === 0;
  const testnet = useTestnetRecord(first && net.key === "mainnet");
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    onCheat();
  };
  return (
    <section aria-label="Live proof" className="min-w-0 rounded-[10px] border border-hairline bg-surface-card">
      <div className="px-4 pb-4 pt-4 sm:px-5">
        {first ? (
          <div data-testid="proof-first">
            <p className="flex items-center gap-2 text-[17px] leading-7 text-ink sm:text-[18px]">
              <Check className="shrink-0" />
              Live on {net.name}
            </p>
            {net.deployed && <LiveRow net={net} />}
            {net.key === "mainnet" && (
              <p className="num mt-3 border-t border-hairline pt-3 text-[13px] leading-5 text-body">
                {testnet === null ? (
                  "Reading the testnet record"
                ) : "error" in testnet ? (
                  `The testnet record is not reachable right now: ${testnet.error}`
                ) : (
                  <>
                    Testnet record: <span className="text-ink">{testnet.reverted}/{testnet.sent}</span> forbidden sales refused, <span className="text-ink">{testnet.paid}</span> paid out.{" "}
                    <a className="font-sans text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink" href="?net=testnet&view=watch">See it on Watch</a>
                  </>
                )}
              </p>
            )}
          </div>
        ) : tot ? (
          <div data-testid="proof-totals">
            <p className="text-[13px] leading-5 text-body">Our own keeper tried to cheat on {net.name}</p>
            <div className="mt-2 flex gap-x-8 sm:gap-x-12">
              <Figure n={tot.forbiddenSent} label="tried" onGo={go} />
              <Figure n={tot.forbiddenReverted} label="refused" onGo={go} />
              <Figure n={tot.forbiddenPaidOut} label="paid out" tone="text-line" onGo={go} />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-mute">
              Every attempt is a mined transaction.
              <span className="hidden sm:inline"> The keeper also made {tot.sales} real {tot.sales === 1 ? "sale" : "sales"} across {tot.plans} {tot.plans === 1 ? "plan" : "plans"}, each at or above its floor.</span>
            </p>
          </div>
        ) : t.recentError ? (
          <p className="text-[14px] leading-6 text-body">The keeper&apos;s record is not reachable right now: {t.recentError}. It reloads every few seconds.</p>
        ) : (
          <p className="text-[14px] leading-6 text-mute">Reading the keeper&apos;s record of refused sales.</p>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="hidden min-w-0 text-[13px] leading-5 text-body sm:block">
          {holder && latest ? (
            <>
              <p>
                <span className="text-mute">Latest refusal.</span> On plan {holder.plan} the keeper tried to {TRIED[latest.attack] ?? latest.attack}.
              </p>
              <p className="flex flex-wrap items-center gap-x-3">
                <span>The chain answered <span className="num whitespace-nowrap text-ink">{latest.reason}</span></span>
                <TxLink hash={latest.hash} label={`tx ${short(latest.hash, 8)}`} />
              </p>
            </>
          ) : (
            <p className="text-mute">{first ? "Sign one line and a floor, then press Try to cheat and read the chain's refusal." : "Refusals appear here as the keeper tries them."}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCheat}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-ink hover:text-canvas active:scale-[0.97]"
        >
          {first ? "Set your plan" : "Try to cheat"}
          <span aria-hidden>&rarr;</span>
        </button>
      </div>
    </section>
  );
}

export function ChainDetails({ s }: { s: Status | null | undefined }) {
  const net = useNet();
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-t border-hairline py-2 first:border-t-0">
      <dt className="text-mute">{k}</dt>
      <dd className="num text-right text-body">{v}</dd>
    </div>
  );
  const link = (a: string) => (
    <a className="underline decoration-hairline-strong underline-offset-4 hover:text-ink" href={`${net.explorer}/address/${a}`} target="_blank" rel="noreferrer">
      {short(a)}
    </a>
  );
  return (
    <footer className="mx-auto max-w-[1240px] px-4 pb-16 pt-2 lg:px-6">
      <details className="group rounded-[10px] border border-hairline bg-surface">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[13px] text-body hover:text-ink [&::-webkit-details-marker]:hidden">
          <span>Chain details</span>
          <span className="text-mute transition-transform duration-150 group-open:rotate-90" aria-hidden>&rsaquo;</span>
        </summary>
        <dl className="px-4 pb-2 text-[13px]">
          {row("Network", `${net.name}, chain ${net.chainId}`)}
          {row("Latest block", s ? Number(s.head).toLocaleString("en-US") : "reading")}
          {row("Pool", <>WMON/{net.stableSymbol}, Uniswap V3 0.3%, {link(net.pool)}</>)}
          {row("Keeper", link(net.keeper))}
          {row("Plan enforcer", net.deployed ? link(net.enforcer) : "coming online")}
          {row("Plan book", net.deployed ? link(net.planBook) : "coming online")}
          {row("Spot price", s ? `${fmtPrice(s.spotPrice)} ${net.stableSymbol}` : "reading")}
          {net.key === "testnet" && row("Mainnet MON price, for reference", s?.mainnet ? `${fmtPrice(s.mainnet.price)} USDC` : "reading")}
          {net.key === "testnet" && row("aUSD", "Agora's dollar on Monad")}
          <div data-perpl-account-id={PERPL_ANCHOR.accountId}>
            {row("Perpl hedge", `account ${PERPL_ANCHOR.accountId}, ${PERPL_ANCHOR.side} ${PERPL_ANCHOR.size} ${PERPL_ANCHOR.symbol} lots on Monad mainnet`)}
          </div>
        </dl>
      </details>
    </footer>
  );
}

/** Shown instead of the plan screens while a network is coming online: reads and signing start once its enforcer and
 * plan book addresses are in its deployment file. */
export function ComingOnline({ net }: { net: Net }) {
  const link = (a: string) => (
    <a className="underline decoration-hairline-strong underline-offset-4 hover:text-ink" href={`${net.explorer}/address/${a}`} target="_blank" rel="noreferrer">
      {short(a)}
    </a>
  );
  return (
    <section aria-labelledby="coming" className="mx-auto flex max-w-[560px] flex-col gap-6 py-6 lg:py-12" data-testid="coming-online">
      <div>
        <h1 id="coming" className="text-[28px] font-medium leading-[1.15] tracking-[0.1px] text-ink sm:text-[36px]">
          {net.name} is coming online.
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-body">
          The plan enforcer and plan book are going live on chain {net.chainId}. Plans open here the moment both are on chain, so a signature only ever points at contracts that exist.
        </p>
      </div>
      <Card title="Where plans will sell">
        <Fact label="Network">{net.name}, chain {net.chainId}</Fact>
        <Fact label="Pool">WMON/{net.stableSymbol}, Uniswap V3 0.3%, {link(net.pool)}</Fact>
        <Fact label="Router">{link(net.router)}</Fact>
        <Fact label="Plan enforcer">going live</Fact>
        <Fact label="Plan book">going live</Fact>
      </Card>
      <div className="flex flex-col gap-2">
        <a href="?net=testnet" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-ink text-[15px] font-medium text-canvas transition-opacity duration-150 ease-out hover:opacity-90">
          Try the full flow on Monad testnet
        </a>
        <p className="text-[12px] leading-5 text-mute">Same plan, same enforcer, same refusals, with free testnet MON.</p>
      </div>
    </section>
  );
}
