"use client";
// The public record, visible before sign-in: one row per plan, its sale with what the holder actually received, and
// every forbidden sale the contract refused, each linked to its transaction. From the keeper's index (/api/recent).
import type { RecentPlan } from "../lib/api";
import { tickToPrice } from "../lib/plan";
import { Check, TxLink, fmtMon, fmtPrice, fmtUsd, short, txUrl } from "./parts";

const CHIP: Record<string, string> = { line: "before the line", floor: "below the floor", recipient: "to the keeper", expiry: "after the end date" };

export function Record({ plans, error }: { plans: RecentPlan[] | null; error?: string | null }) {
  return (
    <section className="rounded-[10px] border border-hairline bg-surface-card" aria-label="On chain record">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 border-b border-hairline px-4 py-2">
        <h2 className="text-[14px] font-medium text-ink">What the keeper sold and what the chain refused</h2>
        <span className="text-[12px] text-mute">newest plan first</span>
      </header>
      {plans === null ? (
        <p className="px-4 py-3 text-[13px] text-mute">{error ? `The keeper's record is not reachable right now: ${error}.` : "Reading the keeper's record."}</p>
      ) : plans.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-mute">No plan has been posted yet. The first one appears here with its sale.</p>
      ) : (
        <ul>
          {plans.map((p) => (
            <li key={p.plan} className="border-b border-hairline px-4 py-3 text-[13px] leading-[20px] last:border-b-0">
              {p.sales.map((s) => (
                <div key={s.hash} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <span className="flex items-start gap-2 text-ink">
                    <Check className="mt-[3px] shrink-0" />
                    <span>
                      <span className="num text-mute">Plan {p.plan}</span> sold <span className="num">{fmtMon(s.amountIn)}</span> MON at <span className="num">{fmtPrice(tickToPrice(s.priceTick))}</span>.{" "}
                      {short(p.holder)} received <span className="num">{s.amountOut ? fmtUsd(s.amountOut) : "at least " + fmtUsd(s.minOut)}</span> aUSD, floor <span className="num">{fmtUsd(s.minOut)}</span>.
                    </span>
                  </span>
                  <span className="-mt-2"><TxLink hash={s.hash} /></span>
                </div>
              ))}
              {p.sales.length === 0 && (
                <div className="text-body">
                  <span className="num text-mute">Plan {p.plan}</span> by {short(p.holder)}: no sale yet.
                </div>
              )}
              {p.refused.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-mute">The chain refused</span>
                  {p.refused.map((r) => (
                    <a key={r.hash} href={txUrl(r.hash)} target="_blank" rel="noreferrer" title={`${r.reason}, ${r.hash}`} className="num inline-flex h-9 items-center rounded-md border border-hairline px-2 text-[12px] text-body transition-colors duration-150 hover:border-hairline-strong hover:text-ink">
                      {CHIP[r.attack] ?? r.attack} <span className="ml-1.5 text-mute">{r.reason.replace("Tripwire:", "")}</span>
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
