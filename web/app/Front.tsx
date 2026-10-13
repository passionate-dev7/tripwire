"use client";
// The first screen: what tripwire is in one breath, the keeper's live record of refused cheats right under it, and
// the chain details a holder can open but never has to read. Every number here is read from the keeper's index
// (/api/recent) or the chain; nothing is typed in.
import type { Status } from "../lib/api";
import { PERPL_ANCHOR } from "../lib/perplAnchor";
import type { useTripwire } from "./useTripwire";
import { Check, TxLink, fmtPrice, short, useNet } from "./parts";

type T = ReturnType<typeof useTripwire>;

export function Hero() {
  return (
    <section aria-labelledby="claim" className="min-w-0">
      <h1 id="claim" className="max-w-[640px] text-[28px] font-medium leading-[1.15] tracking-[0.1px] text-ink sm:text-[36px]">
        A stop-loss on your MON that the bot can&apos;t break.
      </h1>
      <p className="mt-3 max-w-[600px] text-[16px] leading-7 text-body">
        Your MON stays in your wallet. A bot sells it only on your terms. Anything else, the chain refuses.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px] leading-5 text-ink">
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

export function ProofStrip({ t, onCheat }: { t: T; onCheat: () => void }) {
  const net = useNet();
  const tot = t.recent?.totals;
  const plans = t.recent?.plans ?? [];
  const holder = plans.find((p) => p.refused.length > 0);
  const latest = holder?.refused.at(-1);
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    onCheat();
  };
  const num = "num rounded-sm px-1 text-[28px] font-medium leading-9 text-ink underline decoration-hairline-strong decoration-1 underline-offset-[6px] hover:bg-surface-elevated hover:decoration-ink";
  return (
    <section aria-label="Live proof" className="min-w-0 rounded-[10px] border border-hairline bg-surface-card">
      <div className="px-4 pb-4 pt-4 sm:px-5">
        {tot ? (
          <>
            <p className="text-[17px] leading-[44px] text-ink sm:text-[18px]" data-testid="proof-totals">
              Our own keeper tried to cheat{" "}
              <a className={num} href="#refusals" onClick={go}>{tot.forbiddenSent}</a>{" "}
              times. The chain refused{" "}
              <a className={num} href="#refusals" onClick={go}>{tot.forbiddenReverted}</a>
              . It paid out{" "}
              <a className={num} href="#refusals" onClick={go}>{tot.forbiddenPaidOut}</a>.
            </p>
            <p className="mt-1 flex items-start gap-2 text-[13px] leading-5 text-mute">
              <Check className="mt-[3px] shrink-0 text-ink" />
              <span>
                Every attempt is a transaction on {net.name}. Meanwhile the keeper made {tot.sales} real sales across {tot.plans} plans, each to its holder at or above the floor.
              </span>
            </p>
          </>
        ) : t.recentError ? (
          <p className="text-[14px] leading-6 text-body">The keeper&apos;s record is not reachable right now: {t.recentError}. It reloads every few seconds.</p>
        ) : (
          <p className="text-[14px] leading-6 text-mute">Reading the keeper&apos;s record of refused sales.</p>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-[13px] leading-5 text-body">
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
            <p className="text-mute">Refusals appear here as the keeper tries them.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCheat}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-ink px-5 text-[14px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-ink hover:text-canvas active:scale-[0.97]"
        >
          Try to cheat
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
          {row("Plan enforcer", net.deployed ? link(net.enforcer) : "not deployed")}
          {row("Plan book", net.deployed ? link(net.planBook) : "not deployed")}
          {row("Spot price", s ? `${fmtPrice(s.spotPrice)} aUSD` : "reading")}
          {row("Mainnet MON", s?.mainnet ? `${fmtPrice(s.mainnet.price)} aUSD` : "reading")}
          {row("aUSD", "Agora's dollar on Monad")}
          <div data-perpl-account-id={PERPL_ANCHOR.accountId}>
            {row("Perpl hedge", `account ${PERPL_ANCHOR.accountId}, ${PERPL_ANCHOR.side} ${PERPL_ANCHOR.size} ${PERPL_ANCHOR.symbol} lots on Monad mainnet`)}
          </div>
        </dl>
      </details>
    </footer>
  );
}
