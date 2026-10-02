"use client";
// The Watch screen (LAYOUT.md, Watch): what is armed, how far MON is from each line, every sale and every refused
// call, and a way to make the keeper misbehave on purpose and watch the enforcer refuse it on chain.
import { useEffect, useState } from "react";
import type { Attack, PlanView } from "../lib/api";
import { tickToPrice } from "../lib/plan";
import type { useTripwire } from "./useTripwire";
import { Card, Ghost, TxLink, fmtMon, fmtPrice, fmtUsd, short } from "./parts";

type T = ReturnType<typeof useTripwire>;

const ATTACKS: { kind: Attack["kind"]; label: string; tried: string }[] = [
  { kind: "line", label: "Sell before MON reaches your line", tried: "to sell before MON reached your line" },
  { kind: "floor", label: "Sell for half your floor", tried: "to sell for half your floor" },
  { kind: "recipient", label: "Send the aUSD to the keeper", tried: "to send the aUSD to itself" },
];

const REASON_TEXT: Record<string, string> = {
  "Tripwire:above-line": "MON is above your line",
  "Tripwire:min-out": "below your floor",
  "Tripwire:recipient": "pays someone other than you",
  "Tripwire:spent": "that sale already happened",
  "Tripwire:amount": "not the amount you signed",
};

export function Heartbeat({ lastLoop }: { lastLoop: number | undefined }) {
  const [beats, setBeats] = useState<boolean[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastLoop === undefined) return;
    setNow(Date.now());
    setBeats((b) => [...b.slice(-59), Date.now() - lastLoop < 15_000]);
  }, [lastLoop]);
  const age = lastLoop ? Math.max(0, Math.round((now - lastLoop) / 1000)) : null;
  return (
    <div className="flex items-center gap-3 border-y border-hairline px-1 py-2">
      <div className="flex h-6 items-end gap-[2px]" aria-hidden>
        {beats.map((ok, i) => (
          <span key={i} className={`w-[3px] ${ok ? "h-6 bg-ink/70" : "h-6 bg-line"}`} />
        ))}
      </div>
      <span className="num text-[13px] text-mute">
        {age === null ? "Reading the keeper" : age < 15 ? `Keeper checked ${age} s ago` : `Keeper silent for ${age} s. Nothing sells until it is back.`}
      </span>
    </div>
  );
}

function activity(p: PlanView, holder: string) {
  const rows: { at: number; text: string; hash: `0x${string}`; refused: boolean }[] = [];
  for (const f of p.fills) {
    const tr = p.tranches[f.index];
    rows.push({
      at: Number(f.block),
      text: `Sold ${fmtMon(f.amountIn)} MON at a 60 s average of ${fmtPrice(tickToPrice(f.priceTick))}, at least ${fmtUsd(f.minOut)} aUSD to ${short(holder)} (sale ${f.index + 1}, line ${fmtPrice(tr?.line ?? 0)})`,
      hash: f.hash,
      refused: false,
    });
  }
  for (const a of p.attacks) {
    rows.push({ at: 0, text: `Keeper tried ${ATTACKS.find((x) => x.kind === a.kind)?.tried}. Refused by the contract: ${REASON_TEXT[a.reason] ?? a.reason}`, hash: a.hash, refused: true });
  }
  return rows;
}

export function Watch({ t, price, part }: { t: T; price: number | null; part: "summary" | "side" }) {
  const live = t.plans.filter((p) => !p.revoked && p.expiresAt * 1000 > Date.now());
  const target = live.find((p) => p.tranches.some((x) => !x.spent)) ?? null;
  const next = target?.tranches.filter((x) => !x.spent).sort((a, b) => b.line - a.line)[0];

  if (!t.account) {
    return part === "side" ? <p className="text-[14px] leading-6 text-body">Sign in with your passkey on the Plan tab to see your plans, sales and the keeper's refused calls.</p> : null;
  }

  if (part === "summary") {
    return (
      <div className="min-h-[88px] px-1 pt-6">
        <p className="text-[14px] leading-7 text-body">
          {price === null ? "Reading the pool." : next ? (
            <>MON <span className="num text-ink">{fmtPrice(price)}</span>. Your next line is <span className="num text-line">{fmtPrice(next.line)}</span>, {price > next.line ? `${(((price - next.line) / price) * 100).toFixed(1)}% below` : "already crossed"}.</>
          ) : t.plans.length === 0 ? (
            t.plansLoaded ? "No plan yet. Set your lines on the Plan tab." : "Reading your plans."
          ) : (
            <>MON <span className="num text-ink">{fmtPrice(price)}</span>. Every sale in your plans has happened, or the plans are revoked.</>
          )}
        </p>
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
        <Card key={p.id} title={`Plan ${p.id}`} aside={p.revoked ? <span className="text-[12px] text-mute">revoked</span> : <Ghost onClick={() => t.revoke(p)} disabled={t.busy !== null}>Revoke</Ghost>}>
          <div className="grid h-[25px] grid-cols-[48px_1fr_1fr_1fr_1fr] items-center gap-2 px-4 text-[11px] uppercase tracking-[0.4px] text-mute">
            <span>Sale</span><span className="text-right">MON</span><span className="text-right">Line</span><span className="text-right">Floor</span><span className="text-right">State</span>
          </div>
          {p.tranches.map((x) => (
            <div key={x.index} className="num grid h-[25px] grid-cols-[48px_1fr_1fr_1fr_1fr] items-center gap-2 border-t border-hairline px-4 text-[13px]">
              <span className="text-mute">{x.index + 1}</span>
              <span className="text-right text-ink">{fmtMon(x.mon)}</span>
              <span className="text-right text-line">{fmtPrice(x.line)}</span>
              <span className="text-right text-ink">{fmtPrice(x.floorPerMon)}</span>
              <span className="text-right text-body">{x.spent ? "sold" : p.revoked ? "off" : price !== null && price <= x.line ? "selling" : `${(((price ?? 0) - x.line) / (price || 1) * 100).toFixed(1)}% away`}</span>
            </div>
          ))}
          <ul className="border-t border-hairline">
            <li className="flex min-h-8 items-center justify-between gap-3 px-4 text-[13px]">
              <span className="text-mute">Plan posted from your address</span>
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
                        refused by the enforcer: <span className="text-line">{reason}</span> <TxLink hash={r.hash} />
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
      {t.error && <p className="text-[13px] text-line">{t.error}</p>}
    </div>
  );
}
