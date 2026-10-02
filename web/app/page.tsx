"use client";
// One page, two tabs (Plan, Watch), layout A of design-research/LAYOUT.md: chart first, a 330 px ticket on the right
// at 1440, one column in the same order at 390.
import { useEffect, useMemo, useState } from "react";
import { parsePlanLink } from "../lib/link";
import type { PlainTranche } from "../lib/plan";
import { StopChart, type ChartLine } from "./StopChart";
import { Ticket } from "./Ticket";
import { Heartbeat, Watch } from "./Watch";
import { useTripwire } from "./useTripwire";
import { Record } from "./Record";
import { TESTNET } from "../lib/plan";
import { addrUrl, fmtPrice, short } from "./parts";

// r/Monad's most common written plan: "sell 25% at 0.033, stop losses entered". Testnet-sized amount.
const DEFAULT_PLAN: PlainTranche[] = [{ mon: "0.5", line: 0.033, floor: 0.03 }];

export default function Page() {
  const t = useTripwire();
  const [tab, setTab] = useState<"plan" | "watch">("plan");
  const [plan, setPlan] = useState<PlainTranche[]>(DEFAULT_PLAN);
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
    if (tab === "plan") return plan.filter((p) => p.line > 0 && p.floor > 0).map((p) => ({ price: p.line, floor: p.floor, label: `sell ${p.mon}`, state: "draft" as const }));
    return t.plans.filter((p) => !p.revoked).flatMap((p) => p.tranches.map((x) => ({ price: x.line, floor: x.floorPerMon, label: x.spent ? `sold ${x.index + 1}` : `plan ${p.id} sale ${x.index + 1}`, state: x.spent ? ("sold" as const) : ("armed" as const) })));
  }, [tab, plan, t.plans]);

  return (
    <div className="min-h-[100dvh]">
      <header className="flex h-14 items-center justify-between border-b border-hairline px-4 lg:px-6">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2" aria-label="tripwire">
            <img src="/mark.svg" alt="" width={22} height={22} />
            <span className="text-[15px] font-semibold tracking-[0.2px] text-ink">tripwire</span>
          </a>
          <nav className="flex gap-1" aria-label="Screens">
            {(["plan", "watch"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`h-8 rounded-lg px-3 text-[13px] font-medium capitalize ${tab === k ? "bg-surface-elevated text-ink" : "text-mute hover:text-ink"}`}>
                {k}
              </button>
            ))}
          </nav>
        </div>
        <span className="text-[12px] text-mute">Monad testnet</span>
      </header>

      <main className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:px-6">
        <section className="min-w-0">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="text-[12px] text-mute">MON in aUSD, 60 s average of the testnet pool (what the contract reads)</div>
              <div className="num h-16 text-[56px] font-medium leading-[64px] tracking-[0.2px] text-ink">{price === null ? <span className="font-sans text-[14px] font-normal tracking-normal text-mute">Reading the pool</span> : fmtPrice(price)}</div>
            </div>
            <dl className="num grid grid-cols-[auto_auto_auto] gap-x-6 pb-2 text-[12px]">
              <dt className="text-mute">Spot</dt>
              <dt className="text-mute">MON on mainnet</dt>
              <dt className="text-mute">Keeper</dt>
              <dd className="text-ink">{s ? fmtPrice(s.spotPrice) : "..."}</dd>
              <dd className="text-ink">{s?.mainnet ? fmtPrice(s.mainnet.price) : "..."}</dd>
              <dd className="text-ink">{s ? `${s.plans} plans` : "..."}</dd>
            </dl>
          </div>
          <p className="num pb-4 pt-1 text-[12px] leading-5 text-mute">
            {s ? <>testnet block {Number(s.head).toLocaleString("en-US")}, pool <a className="underline decoration-hairline-strong underline-offset-4 hover:text-ink" href={addrUrl(TESTNET.pool)} target="_blank" rel="noreferrer">{short(TESTNET.pool)}</a> with liquidity we seeded, so its price follows our tests, not the market. </> : null}
            {s?.mainnet ? <>Mainnet: 60 s average of Monad's WMON/USDC pool at block {Number(s.mainnet.block).toLocaleString("en-US")}, read {Math.max(0, Math.round((Date.now() - s.mainnet.at) / 1000))} s ago. </> : null}
            aUSD is Agora's dollar stablecoin on Monad.
          </p>
          <div className="rounded-[10px] border border-hairline bg-surface p-2">
            <StopChart points={t.history.data?.points ?? []} lines={lines} height={wide ? 420 : 260} />
          </div>
          <Heartbeat lastLoop={s?.lastLoop} />
          {tab === "watch" && <Watch t={t} price={price} part="summary" />}
        </section>

        <aside className="min-w-0 lg:row-span-2">
          {tab === "plan" ? (
            <>
              {linkErrors.length > 0 && <p className="pb-3 text-[13px] text-ink">Link parts skipped: {linkErrors.join("; ")}</p>}
              <Ticket t={t} plan={plan} setPlan={setPlan} price={price} />
            </>
          ) : (
            <Watch t={t} price={price} part="side" />
          )}
        </aside>
        {tab === "plan" && (
          <div className="min-w-0 lg:col-start-1">
            <Record />
          </div>
        )}
      </main>
    </div>
  );
}

