"use client";
// The Watch screen (LAYOUT.md, Watch): what is armed, how far MON is from each line, every sale and every refused
// call, and a way to make the keeper misbehave on purpose and watch the enforcer refuse it on chain.
import { useEffect, useState, type ReactNode } from "react";
import type { Attack, PlanView } from "../lib/api";
import { salesLeft } from "../lib/keeper-gas";
import { tickToPrice } from "../lib/plan";
import type { useTripwire } from "./useTripwire";
import { Card, Ghost, TxLink, fmtMon, fmtPrice, fmtUsd, short } from "./parts";

type T = ReturnType<typeof useTripwire>;

const ATTACKS: { kind: Attack["kind"]; label: string; tried: string }[] = [
  { kind: "line", label: "Sell before MON reaches your line", tried: "to sell before MON reached the line" },
  { kind: "floor", label: "Sell for half your floor", tried: "to sell for half the floor" },
  { kind: "recipient", label: "Send the aUSD to the keeper", tried: "to send the aUSD to itself" },
];

const REASON_TEXT: Record<string, string> = {
  "Tripwire:above-line": "MON is above the line",
  "Tripwire:min-out": "below the floor",
  "Tripwire:recipient": "pays someone other than the holder",
  "Tripwire:spent": "that sale already happened",
  "Tripwire:amount": "not the amount you signed",
};

export function Heartbeat({ lastLoop, keeperGas, fillCost, loopError }: { lastLoop: number | undefined; keeperGas?: string; fillCost?: string; loopError?: string | null }) {
  // A clock, not the poll, drives the age: if the keeper (or the route to it) dies, lastLoop stops moving and the
  // age keeps growing, so silence shows as silence instead of a frozen "checked 2 s ago".
  const [now, setNow] = useState(() => Date.now());
  const [beats, setBeats] = useState<boolean[]>([]);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (n++ % 4 === 0) setBeats((b) => [...b.slice(-59), lastLoop !== undefined && t - lastLoop < 15_000]);
    }, 1000);
    return () => clearInterval(id);
  }, [lastLoop]);
  const age = lastLoop ? Math.max(0, Math.round((now - lastLoop) / 1000)) : null;
  const left = salesLeft(keeperGas, fillCost);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-hairline px-1 py-2" data-testid="heartbeat">
      <div className="flex h-6 items-end gap-[2px]" aria-hidden>
        {beats.map((ok, i) => (
          <span key={i} className={`w-[3px] ${ok ? "h-6 bg-ink/70" : "h-6 bg-line"}`} />
        ))}
      </div>
      <span className={`num text-[13px] ${age !== null && age >= 15 ? "text-line" : "text-mute"}`}>
        {age === null ? "Reading the keeper" : age < 15 ? `Keeper checked ${age} s ago` : `Keeper silent for ${age} s. Nothing sells until it is back.`}
      </span>
      {left !== null && (
        <span className={`num text-[13px] ${left < 3 ? "text-line" : "text-mute"}`} data-testid="keeper-gas">
          {left === 0 ? "Keeper cannot pay for a sale" : `Keeper can pay for ${left} more ${left === 1 ? "sale" : "sales"}`}
        </span>
      )}
      {loopError && <span className="num text-[13px] text-line">Keeper loop error: {loopError}</span>}
    </div>
  );
}

function activity(p: PlanView, holder: string) {
  const rows: { at: number; text: string; hash: `0x${string}`; refused: boolean }[] = [];
  for (const f of p.fills) {
    const tr = p.tranches[f.index];
    rows.push({
      at: Number(f.block),
      text: `Sold ${fmtMon(f.amountIn)} MON at a 60 s average of ${fmtPrice(tickToPrice(f.priceTick))}. ${short(holder)} received ${f.amountOut ? fmtUsd(f.amountOut) : "at least " + fmtUsd(f.minOut)} aUSD (floor ${fmtUsd(f.minOut)}; sale ${f.index + 1}, line ${fmtPrice(tr?.line ?? 0)})`,
      hash: f.hash,
      refused: false,
    });
  }
  for (const a of p.attacks) {
    rows.push({ at: 0, text: `Keeper tried ${ATTACKS.find((x) => x.kind === a.kind)?.tried}. Refused by the contract: ${REASON_TEXT[a.reason] ?? a.reason}`, hash: a.hash, refused: true });
  }
  return rows;
}

const TRIED_SHORT: Record<string, string> = { line: "Sell before MON reached the line", floor: "Sell for half the floor", recipient: "Pay the aUSD to the keeper" };

/** Signed out: every forbidden sale the keeper has sent, what the contract said, and the totals. */
function Proof({ t }: { t: T }) {
  const plans = t.recent?.plans ?? [];
  const rows = plans.flatMap((p) => p.refused.map((r) => ({ ...r, plan: p.plan })));
  const tot = t.recent?.totals;
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 rounded-[10px] border border-hairline bg-surface-card" aria-label="Forbidden sales">
      <header className="border-b border-hairline px-4 py-3">
        {tot && (
          <p className="num text-[22px] font-medium leading-8 text-ink">
            {tot.forbiddenSent} forbidden sales sent, {tot.forbiddenReverted} reverted, {tot.forbiddenPaidOut} paid out
          </p>
        )}
        <p className="text-[13px] text-mute">The keeper broke the rules on purpose. Each attempt is a mined Monad testnet transaction with status 0.</p>
      </header>
      <div className="grid min-h-8 grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 text-[11px] uppercase tracking-[0.4px] text-mute">
        <span>Plan</span><span>Keeper tried to</span><span>Contract said</span><span>Tx</span>
      </div>
      {rows.slice(0, 12).map((r) => (
        <div key={r.hash} className="num grid min-h-9 grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-t border-hairline px-4 text-[13px]">
          <span className="text-mute">{r.plan}</span>
          <span className="font-sans text-body">{TRIED_SHORT[r.attack]}</span>
          <span className="text-line">{r.reason}</span>
          <TxLink hash={r.hash} />
        </div>
      ))}
    </section>
  );
}

export function PlanCard({ p, price, action, title }: { p: PlanView; price: number | null; action?: ReactNode; title?: string }) {
  return (
    <Card title={title ?? `Plan ${p.id}`} aside={action}>
      <div className="grid min-h-[25px] grid-cols-[32px_1fr_1fr_1fr_84px] items-center gap-2 px-4 text-[11px] uppercase tracking-[0.4px] text-mute">
        <span>Sale</span><span className="text-right">MON</span><span className="text-right">Line</span><span className="text-right">Floor</span><span className="text-right">State</span>
      </div>
      {p.tranches.map((x) => (
        <div key={x.index} className="num grid min-h-[25px] grid-cols-[32px_1fr_1fr_1fr_84px] items-center gap-2 border-t border-hairline px-4 text-[13px]">
          <span className="text-mute">{x.index + 1}</span>
          <span className="text-right text-ink">{fmtMon(x.mon)}</span>
          <span className="text-right text-line">{fmtPrice(x.line)}</span>
          <span className="text-right text-ink">{fmtPrice(x.floorPerMon)}</span>
          <span className="text-right text-body">{x.spent ? "sold" : p.revoked ? "off" : price !== null && (x.atOrAbove ? price >= x.line : price <= x.line) ? "selling" : `${((Math.abs((price ?? 0) - x.line) / (price || 1)) * 100).toFixed(1)}% to ${x.atOrAbove ? "target" : "stop"}`}</span>
        </div>
      ))}
      <ul className="border-t border-hairline">
        <li className="flex min-h-8 items-center justify-between gap-3 px-4 text-[13px]">
          <span className="text-mute">Plan posted by {short(p.holder)}</span>
          <TxLink hash={p.postedTx} />
        </li>
        {activity(p, p.holder).map((r) => (
          <li key={r.hash} className="flex min-h-8 items-start justify-between gap-3 border-t border-hairline px-4 py-[7px] text-[13px] leading-[18px]">
            <span className={r.refused ? "text-body" : "text-ink"}>{r.text}</span>
            <TxLink hash={r.hash} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Watch({ t, price, part }: { t: T; price: number | null; part: "summary" | "side" }) {
  const live = t.plans.filter((p) => !p.revoked && p.expiresAt * 1000 > Date.now());
  const target = live.find((p) => p.tranches.some((x) => !x.spent)) ?? null;
  // the unsold line closest to the price, from either side
  const next = target?.tranches.filter((x) => !x.spent).sort((a, b) => Math.abs((price ?? 0) - a.line) - Math.abs((price ?? 0) - b.line))[0];

  if (!t.account) {
    if (part === "summary") return <Proof t={t} />;
    return (
      <div className="flex flex-col gap-4">
        {t.publicPlan ? (
          <PlanCard p={t.publicPlan} price={price} title={`Latest plan on chain, plan ${t.publicPlan.id}`} action={<span className="text-[12px] text-mute">read only</span>} />
        ) : (
          <p className="text-[13px] text-mute">Reading the latest plan on chain.</p>
        )}
        {t.publicPlan && t.publicPlan.attacks.length > 0 && (
          <p className="text-[13px] leading-5 text-body">Each refusal above is a real transaction: the keeper sent a sale the plan forbids and Monad reverted it with the enforcer's reason.</p>
        )}
        <p className="text-[13px] leading-5 text-body">Sign in with a passkey on the Plan tab to arm your own plan and make the keeper try it.</p>
      </div>
    );
  }

  if (part === "summary") {
    return (
      <div className="min-h-[88px] px-1 pt-6">
        {price !== null && next ? (
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="num text-[28px] font-medium leading-9 text-ink">{(next.atOrAbove ? price >= next.line : price <= next.line) ? "reached" : `${next.atOrAbove ? "+" : "-"}${((Math.abs(price - next.line) / price) * 100).toFixed(1)}%`}</span>
            <span className="text-[14px] text-body">
              to your next line, <span className="num text-line">{fmtPrice(next.line)}</span>. MON is <span className="num text-ink">{fmtPrice(price)}</span>.
            </span>
          </div>
        ) : (
          <p className="text-[14px] leading-7 text-body">
            {price === null ? "Reading the pool." : t.plans.length === 0 ? (t.plansLoaded ? "No plan yet. Set your lines on the Plan tab." : "Reading your plans.") : <>MON <span className="num text-ink">{fmtPrice(price)}</span>. Every sale in your plans has happened, or the plans are revoked.</>}
          </p>
        )}
        <p className="num mt-1 text-[13px] text-mute">
          {(() => { const w = live.reduce((n, p) => n + p.tranches.filter((x) => !x.spent).length, 0); return `${live.length} plan${live.length === 1 ? "" : "s"} armed, ${w} sale${w === 1 ? "" : "s"} waiting`; })()}
          {target ? `, stops on ${new Date(target.expiresAt * 1000).toISOString().slice(0, 10)}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {t.plans.map((p) => (
        <PlanCard key={p.id} p={p} price={price} action={p.revoked ? <span className="text-[12px] text-mute">revoked</span> : <Ghost onClick={() => t.revoke(p)} disabled={t.busy !== null}>Revoke</Ghost>} />
      ))}

      {target && (
        <Card title="Try to cheat">
          <p className="px-4 pt-3 text-[13px] leading-5 text-body">
            Make the keeper break plan {target.id} on purpose. It sends the forbidden sale to Monad testnet; the contract refuses it, and this page reads the reason from the mined transaction.
          </p>
          <div className="mt-2">
            {ATTACKS.map((a) => {
              const r = t.attacks[`${target.id}:${a.kind}`] ?? target.attacks.find((x) => x.kind === a.kind);
              const reason = r ? ("chainReason" in r && r.chainReason ? r.chainReason : r.reason) : null;
              return (
                <div key={a.kind} className="border-t border-hairline px-4 py-2">
                  <div className="flex h-8 items-center justify-between gap-3">
                    <span className="text-[13px] text-ink">{a.label}</span>
                    <Ghost onClick={() => t.cheat(target, a.kind)} disabled={t.busy !== null || !!r}>{t.busy === `Keeper tries: ${a.kind}` ? "Sending" : r ? "Done" : "Make it try"}</Ghost>
                  </div>
                  {r && (
                    <div className="font-mono text-[12px] leading-5 text-body">
                      <div>sent and mined, status {r.status}</div>
                      <div>
                        refused by the enforcer: <span className="whitespace-nowrap text-line">{reason}</span> <TxLink hash={r.hash} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {t.holdings && t.holdings.wmon > 0n && (
        <div className="flex items-center justify-between rounded-[10px] border border-hairline px-4 py-3 text-[13px]">
          <span className="text-body">{fmtMon(t.holdings.wmon)} WMON set aside. Revoke first if a plan is still armed.</span>
          <Ghost onClick={() => t.takeBack(t.holdings!.wmon)} disabled={t.busy !== null}>Turn back into MON</Ghost>
        </div>
      )}
      {t.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{t.error}</p>}
    </div>
  );
}
