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
import { fmtPrice } from "./parts";

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
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 pb-4">
            <div>
              <div className="text-[12px] text-mute">MON / aUSD, testnet pool, 60 s average</div>
              <div className="num text-[56px] font-medium leading-[64px] tracking-[0.2px] text-ink">{price === null ? "..." : fmtPrice(price)}</div>
            </div>
            <dl className="num grid grid-cols-3 gap-x-6 pb-2 text-[12px]">
              <dt className="text-mute">Spot</dt>
              <dt className="text-mute">MON on mainnet</dt>
              <dt className="text-mute">Keeper</dt>
              <dd className="text-ink">{s ? fmtPrice(s.spotPrice) : "..."}</dd>
              <dd className="text-ink" title={s?.mainnet ? `60 s TWAP of the WMON/USDC 0.3% pool, block ${s.mainnet.block}` : undefined}>{s?.mainnet ? fmtPrice(s.mainnet.price) : "..."}</dd>
              <dd className="text-ink">{s ? `${s.plans} plans` : "..."}</dd>
            </dl>
          </div>
          <div className="rounded-[10px] border border-hairline bg-surface p-2">
            <StopChart points={t.history.data?.points ?? []} lines={lines} height={420} />
          </div>
          <Heartbeat lastLoop={s?.lastLoop} />
          <p className="pt-2 text-[12px] leading-5 text-mute">
            The testnet pool's price comes from liquidity seeded for testing, so it is not MON's market price; the mainnet figure is the 60 s average of Monad's WMON/USDC pool, read live. The contract reads the 60 s average, the solid line; spot is the faint one.
          </p>
          {tab === "watch" && <Watch t={t} price={price} part="summary" />}
        </section>

        <aside className="min-w-0">
          {tab === "plan" ? (
            <>
              {linkErrors.length > 0 && <p className="pb-3 text-[13px] text-line">Link parts skipped: {linkErrors.join("; ")}</p>}
              <Ticket t={t} plan={plan} setPlan={setPlan} price={price} />
            </>
          ) : (
            <Watch t={t} price={price} part="side" />
          )}
        </aside>
      </main>
    </div>
  );
}

