"use client";
// The public record, visible before sign-in: one row per plan, its sale with what the holder actually received, and
// every forbidden sale the contract refused, each linked to its transaction. From the keeper's index (/api/recent).
import type { RecentPlan } from "../lib/api";
import { tickToPrice } from "../lib/plan";
import { TxLink, fmtMon, fmtPrice, fmtUsd, short, txUrl } from "./parts";

const CHIP: Record<string, string> = { line: "before the line", floor: "below the floor", recipient: "to the keeper" };

export function Record({ plans }: { plans: RecentPlan[] | null }) {
  return (
    <section className="rounded-[10px] border border-hairline bg-surface-card" aria-label="On chain record">
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 border-b border-hairline px-4 py-2">
        <h2 className="text-[13px] font-medium text-ink">On chain: what the keeper sold, and what the contract refused</h2>
        <span className="text-[12px] text-mute">Monad testnet, newest plan first</span>
      </header>
      {plans === null ? (
        <p className="px-4 py-3 text-[13px] text-mute">Reading the keeper's record.</p>
      ) : (
        <ul>
          {plans.map((p) => (
            <li key={p.plan} className="border-b border-hairline px-4 py-[9px] text-[13px] leading-[18px] last:border-b-0">
              {p.sales.map((s) => (
                <div key={s.hash} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <span className="text-ink">
                    <span className="num text-mute">Plan {p.plan}</span> sold <span className="num">{fmtMon(s.amountIn)}</span> MON at <span className="num">{fmtPrice(tickToPrice(s.priceTick))}</span>;{" "}
                    {short(p.holder)} received <span className="num">{s.amountOut ? fmtUsd(s.amountOut) : "at least " + fmtUsd(s.minOut)}</span> aUSD, floor <span className="num">{fmtUsd(s.minOut)}</span>
                  </span>
                  <TxLink hash={s.hash} />
                </div>
              ))}
              {p.refused.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-mute">Refused:</span>
                  {p.refused.map((r) => (
                    <a key={r.hash} href={txUrl(r.hash)} target="_blank" rel="noreferrer" title={`${r.reason}, ${r.hash}`} className="num inline-flex h-7 items-center rounded-md border border-hairline px-2 text-[12px] text-body hover:border-hairline-strong hover:text-ink">
                      {CHIP[r.attack]} <span className="ml-1.5 text-mute">{r.reason.replace("Tripwire:", "")}</span>
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
