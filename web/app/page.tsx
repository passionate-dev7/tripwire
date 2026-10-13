"use client";
// One page, two tabs (Plan, Watch). Reading order, at 1440 and at 390: the claim, the keeper's live record of refused
// cheats, the plan ticket with its sign step, then the chart and the on chain record. At 1440 the ticket sits in the
// right column beside all of it.
import { useEffect, useMemo, useState } from "react";
import { parsePlanLink } from "../lib/link";
import type { Net, PlainTranche } from "../lib/plan";
import { StopChart, type ChartLine } from "./StopChart";
import { Ticket } from "./Ticket";
import { Heartbeat, Watch, armedNote } from "./Watch";
import { useTripwire } from "./useTripwire";
import { Record } from "./Record";
import { ChainDetails, ComingOnline, Hero, ProofStrip } from "./Front";
import { Digits, NetSwitch, fmtPrice, useNet } from "./parts";

// Until the live price arrives: r/Monad's most common written plan ("sell 25% at 0.033"), testnet sized.
const DEFAULT_PLAN: PlainTranche[] = [{ mon: "0.02", line: 0.033, floor: 0.03 }];
const r5 = (n: number) => Number(n.toFixed(5));
/** The first plan a holder sees. On testnet it fits the 0.1 MON drip with the gas the setup reserves (SETUP_GAS_BUDGET) and
 * shows both outcomes: a target just under the market (MON is already above it, so it sells within a minute) and stops far
 * below (the ones that must not sell). On mainnet nothing is crossed, so signing the first plan never sells by surprise. */
const starterPlan = (price: number, net: Net["key"]): PlainTranche[] =>
  net === "testnet"
    ? [
        { mon: "0.012", line: r5(price * 0.92), floor: r5(price * 0.88) },
        { mon: "0.006", line: r5(price * 0.85), floor: r5(price * 0.8) },
        { mon: "0.004", line: r5(price * 0.97), floor: r5(price * 0.95), up: true },
      ]
    : [
        { mon: "1", line: r5(price * 0.92), floor: r5(price * 0.88) },
        { mon: "0.5", line: r5(price * 0.85), floor: r5(price * 0.8) },
        { mon: "0.25", line: r5(price * 1.05), floor: r5(price * 0.98), up: true },
      ];

function Legend({ hasTarget, hasDone, reference }: { hasTarget: boolean; hasDone: boolean; reference: number | null }) {
  const swatch = "inline-block h-0 w-5 shrink-0 border-t-2 align-middle";
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-mute" aria-label="Chart key">
      <li className="flex items-center gap-2"><span className={`${swatch} border-ink`} />60 s average, the price a sale is judged on</li>
      <li className="flex items-center gap-2"><span className={`${swatch} border-line`} />Stop-loss line</li>
      {reference !== null && <li className="flex items-center gap-2"><span className="inline-block h-0 w-5 shrink-0 border-t border-mute align-middle" />Mainnet MON, reference <span className="num text-body">{fmtPrice(reference)}</span></li>}
      {hasTarget && <li className="flex items-center gap-2"><span className={`${swatch} border-dashed border-body`} />Take-profit line</li>}
      {hasDone && <li className="flex items-center gap-2"><span className={`${swatch} border-mute`} />Sold or switched off</li>}
      <li className="flex items-center gap-2"><span className={`${swatch} border-dotted border-mute`} />Floor, the lowest price it may sell at</li>
    </ul>
  );
}

export default function Page() {
  const t = useTripwire();
  const net = useNet();
  const [tab, setTab] = useState<"plan" | "watch">("plan");
  const [plan, setPlanRaw] = useState<PlainTranche[]>(DEFAULT_PLAN);
  const [touched, setTouched] = useState(false);
  const setPlan = (p: PlainTranche[]) => {
    setTouched(true);
    setPlanRaw(p);
  };
  const [linkErrors, setLinkErrors] = useState<string[]>([]);

  useEffect(() => {
    const { tranches, errors } = parsePlanLink(window.location.search);
    if (tranches.length) setPlan(tranches);
    setLinkErrors(errors);
    if (new URLSearchParams(window.location.search).get("view") === "watch") setTab("watch");
  }, []);
  useEffect(() => {
    if (t.steps.at(-1)?.label === "Plan armed") setTab("watch");
  }, [t.steps]);

  const s = t.status.data;
  useEffect(() => {
    if (!touched && s?.twapPrice) setPlanRaw(starterPlan(s.twapPrice, net.key));
  }, [touched, s?.twapPrice, net.key]);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const price = s ? s.twapPrice : null;
  const lines: ChartLine[] = useMemo(() => {
    if (tab === "plan") return plan.map((p, i) => ({ p, i })).filter(({ p }) => p.line > 0 && p.floor > 0).map(({ p, i }) => ({ price: p.line, floor: p.floor, up: p.up === true, n: i + 1, label: `${p.up ? "Target" : "Stop"} ${p.mon} MON`, state: "draft" as const }));
    const shown = t.account ? t.plans : t.publicPlan ? [t.publicPlan] : [];
    return shown.filter((p) => !p.revoked || !t.account).flatMap((p) => p.tranches.map((x) => ({ price: x.line, floor: x.floorPerMon, up: x.atOrAbove === true, n: x.index + 1, label: x.spent ? `Sold ${x.index + 1}` : p.revoked ? `Off ${x.index + 1}` : `Plan ${p.id} ${x.atOrAbove ? "target" : "stop"} ${x.index + 1}`, state: x.spent ? ("sold" as const) : p.revoked ? ("off" as const) : ("armed" as const) })));
  }, [tab, plan, t.plans, t.publicPlan, t.account]);

  // The holder's key number: how far MON is from the nearest line it has yet to cross. Never shown for someone else's plan.
  const next = useMemo(() => {
    if (price === null || (tab === "watch" && !t.account)) return null;
    const open = lines.filter((l) => l.state === "draft" || l.state === "armed");
    const crossed = (l: ChartLine) => (l.up ? price >= l.price : price <= l.price);
    const pool = open.some((l) => !crossed(l)) ? open.filter((l) => !crossed(l)) : open;
    if (pool.length === 0) return null;
    const l = pool.reduce((a, b) => (Math.abs(price - b.price) < Math.abs(price - a.price) ? b : a));
    return { line: l, crossed: crossed(l), pct: ((l.price - price) / price) * 100 };
  }, [lines, price, tab, t.account]);
  const note = tab === "watch" && t.account ? armedNote(t) : null;

  // "Try to cheat" goes where the cheating happens: the holder's own plan once signed in, the keeper's recorded refusals before.
  // With no refusal recorded yet (a network's first plan is still to come) it goes to the sign step instead.
  const goCheat = () => {
    const nothingRecorded = !t.account && (t.recent?.plans ?? []).every((p) => p.refused.length === 0);
    setTab(nothingRecorded ? "plan" : "watch");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = nothingRecorded ? "sign" : t.account && t.plans.length > 0 ? "cheat" : "refusals";
    setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 60);
  };

  const header = (
    <header className="flex h-14 items-center justify-between border-b border-hairline px-4 lg:px-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <a href="/" className="flex items-center gap-2" aria-label="tripwire">
          <img src="/mark.svg" alt="" width={22} height={22} />
          <span className="text-[15px] font-semibold tracking-[0.2px] text-ink">tripwire</span>
        </a>
        {net.deployed && (
          <nav className="flex gap-1" aria-label="Screens">
            {(["plan", "watch"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`h-9 rounded-lg px-3 text-[13px] font-medium capitalize transition-colors duration-150 ease-out ${tab === k ? "bg-surface-elevated text-ink" : "text-mute hover:text-ink"}`}>
                {k}
              </button>
            ))}
          </nav>
        )}
      </div>
      <NetSwitch />
    </header>
  );

  if (!net.deployed) {
    return (
      <div className="min-h-[100dvh]">
        {header}
        <main className="mx-auto max-w-[1240px] px-4 lg:px-6">
          <ComingOnline net={net} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      {header}

      <main className="mx-auto grid max-w-[1240px] gap-x-8 gap-y-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start lg:gap-y-6 lg:px-6 lg:py-8">
        {tab === "plan" && (
          <div className="min-w-0 lg:col-start-1">
            <Hero />
          </div>
        )}
        <div className="min-w-0 lg:col-start-1">
          <ProofStrip t={t} onCheat={goCheat} />
        </div>

        <aside className="min-w-0 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-stretch">
          {tab === "plan" ? (
            <>
              {linkErrors.length > 0 && <p className="pb-3 text-[13px] text-ink">Link parts skipped: {linkErrors.join("; ")}</p>}
              <Ticket t={t} plan={plan} setPlan={setPlan} price={price} />
            </>
          ) : (
            <Watch t={t} price={price} part="side" />
          )}
        </aside>

        <section className="min-w-0 lg:col-start-1" aria-label="Price and your lines">
          <div className="rounded-[10px] border border-hairline bg-surface">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3 px-4 pt-4">
              <div>
                <div className="text-[12px] text-mute">MON in {net.stableSymbol}, 60 s average of the {net.name} pool</div>
                <div className="num h-12 text-[44px] font-medium leading-[48px] tracking-[0.2px] text-ink lg:h-16 lg:text-[56px] lg:leading-[64px]">
                  {price === null ? <span className="font-sans text-[14px] font-normal tracking-normal text-mute">Reading the pool</span> : <Digits value={fmtPrice(price)} />}
                </div>
              </div>
              {(next || note) && (
                <div className="min-w-0 pb-1.5" data-testid="next-line">
                  {next && (
                    <>
                      <div className={`num text-[28px] font-medium leading-9 ${next.line.up ? "text-ink" : "text-line"}`}>{next.crossed ? "reached" : `${next.pct > 0 ? "+" : "−"}${Math.abs(next.pct).toFixed(1)}%`}</div>
                      <div className="text-[12px] leading-5 text-mute">
                        to {next.line.up ? "target" : "stop"} {next.line.n} · <span className="num text-body">{fmtPrice(next.line.price)}</span>
                      </div>
                    </>
                  )}
                  {note && <div className="num text-[12px] leading-5 text-mute">{note}</div>}
                </div>
              )}
            </div>
            <div className="px-4 pb-2 pt-3">
              <Legend hasTarget={lines.some((l) => l.up && l.state !== "sold" && l.state !== "off")} hasDone={lines.some((l) => l.state === "sold" || l.state === "off")} reference={net.key === "testnet" && (t.reference.data?.points.length ?? 0) > 0 ? (s?.mainnet?.price ?? null) : null} />
            </div>
            <div className="px-2">
              <StopChart points={t.history.data?.points ?? []} lines={lines} reference={net.key === "testnet" ? t.reference.data?.points : undefined} height={wide ? 360 : 260} />
            </div>
            <Heartbeat lastLoop={s?.lastLoop} keeperGas={s?.keeperGas} fillCost={s?.fillCost} loopError={s?.loopError} />
          </div>
          {tab === "watch" && <Watch t={t} price={price} part="summary" />}
        </section>

        {tab === "plan" && (
          <div className="min-w-0 lg:col-start-1">
            <Record plans={t.recent?.plans ?? null} error={t.recentError} />
          </div>
        )}
      </main>
      <ChainDetails s={s} />
    </div>
  );
}
