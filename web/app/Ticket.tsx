"use client";
// The Plan ticket (LAYOUT.md, Plan screen, ticket column): one sentence for the first line, up to three tranche rows,
// the facts the chain will enforce, then Sign. Every fact below is read from the same tranche values that are
// encoded into the signed terms, so what the holder reads is what the enforcer checks.
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { type PlainTranche, priceToTick, toTranches } from "../lib/plan";
import { SETUP_GAS_BUDGET } from "../lib/holder";
import type { useTripwire } from "./useTripwire";
import { Card, Copy, Fact, Ghost, Pill, TxLink, addrUrl, fmtMon, fmtPrice, short } from "./parts";

type T = ReturnType<typeof useTripwire>;
const UNLOCK = "2026-11-24";

export function Ticket({ t, plan, setPlan, price }: { t: T; plan: PlainTranche[]; setPlan: (p: PlainTranche[]) => void; price: number | null }) {
  const [expiry, setExpiry] = useState(UNLOCK);
  const [name, setName] = useState("");

  const checked = useMemo(() => {
    try {
      return { tranches: toTranches(plan), error: null as string | null };
    } catch (e) {
      return { tranches: null, error: (e as Error).message };
    }
  }, [plan]);
  const total = checked.tranches?.reduce((s, x) => s + x.amountIn, 0n) ?? 0n;
  const largest = checked.tranches?.reduce((m, x) => (x.amountIn > m ? x.amountIn : m), 0n) ?? 0n;
  const expiresAt = Math.floor(new Date(`${expiry}T00:00:00Z`).getTime() / 1000);
  const firesNow = price !== null && plan.some((p) => priceToTick(price) <= priceToTick(p.line));

  const set = (i: number, k: keyof PlainTranche, v: string) =>
    setPlan(plan.map((p, j) => (j === i ? { ...p, [k]: k === "mon" ? v : Number(v) } : p)));
  const preset = (pct: number) => {
    if (price === null) return;
    const line = Number((price * (1 + pct / 100)).toFixed(5));
    const floor = Number((line * 0.92).toFixed(5));
    setPlan(plan.map((p, j) => (j === 0 ? { ...p, line, floor } : p)));
  };

  const h = t.holdings;
  const toWrap = h && total > h.wmon ? total - h.wmon : total;
  const short_ = h ? h.mon < toWrap + SETUP_GAS_BUDGET : false;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="px-4 pb-4 pt-5">
          <p className="text-[14px] leading-6 text-body">
            Sell <span className="num text-ink">{plan[0]?.mon || "0"}</span> MON when 1 MON is worth
          </p>
          <label className="mt-1 flex items-baseline gap-2">
            <span className="sr-only">Line, in aUSD per MON</span>
            <input
              inputMode="decimal"
              value={String(plan[0]?.line ?? "")}
              onChange={(e) => set(0, "line", e.target.value)}
              className="num w-full bg-transparent text-[36px] font-medium leading-[54px] text-ink outline-none"
            />
            <span className="text-[14px] text-mute">aUSD</span>
          </label>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {[["Market", 0], ["-5%", -5], ["-10%", -10], ["-20%", -20]].map(([l, v]) => (
              <button key={l} type="button" onClick={() => preset(v as number)} className="h-7 shrink-0 rounded-lg border border-hairline px-3 text-[12px] text-body hover:border-hairline-strong hover:text-ink">
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-hairline">
          <div className="grid h-8 grid-cols-[1fr_1fr_1fr_24px] items-center gap-2 px-4 text-[11px] uppercase tracking-[0.4px] text-mute">
            <span>Sell MON</span><span className="text-right">At or below</span><span className="text-right">Floor</span><span />
          </div>
          {plan.map((p, i) => (
            <div key={i} className="grid h-10 grid-cols-[1fr_1fr_1fr_24px] items-center gap-2 border-t border-hairline px-4">
              <input aria-label={`Tranche ${i + 1} MON`} inputMode="decimal" value={p.mon} onChange={(e) => set(i, "mon", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-[13px] text-ink outline-none" />
              <input aria-label={`Tranche ${i + 1} line`} inputMode="decimal" value={String(p.line)} onChange={(e) => set(i, "line", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-right text-[13px] text-line outline-none" />
              <input aria-label={`Tranche ${i + 1} floor`} inputMode="decimal" value={String(p.floor)} onChange={(e) => set(i, "floor", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-right text-[13px] text-ink outline-none" />
              <button type="button" aria-label={`Remove tranche ${i + 1}`} disabled={plan.length === 1} onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="text-[14px] text-mute hover:text-ink disabled:opacity-20">
                ×
              </button>
            </div>
          ))}
          {plan.length < 3 && (
            <button type="button" onClick={() => { const last = plan[plan.length - 1]; setPlan([...plan, { mon: last.mon, line: Number((last.line * 0.85).toFixed(5)), floor: Number((last.floor * 0.85).toFixed(5)) }]); }} className="h-10 w-full border-t border-hairline px-4 text-left text-[13px] text-mute hover:text-ink">
              Add a staged sell
            </button>
          )}
        </div>
      </Card>

      <Card title="What the keeper can do">
        <Fact label="Sells">WMON for aUSD, one sale per row</Fact>
        <Fact label="Only at or below">{plan.map((p) => fmtPrice(p.line)).join(", ")}</Fact>
        <Fact label="Never for less than">{plan.map((p) => `${fmtPrice(p.floor)}`).join(", ")} aUSD per MON</Fact>
        <Fact label="Pays only to">
          {t.account ? <span className="font-mono text-[12px]">{short(t.account.address, 8)}<Copy text={t.account.address} /></span> : <span className="text-mute">your passkey address</span>}
        </Fact>
        <Fact label="Largest single sale">{checked.tranches ? `${fmtMon(largest)} MON` : "check the rows"}</Fact>
        <Fact label="In total, at most">{checked.tranches ? `${fmtMon(total)} MON` : "check the rows"}</Fact>
        <Fact label="Stops on">
          <input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} aria-label="Plan stops on" className="num bg-transparent text-right text-ink outline-none [color-scheme:dark]" />
        </Fact>
      </Card>

      <div className="flex flex-col gap-3">
        {checked.error && <p className="text-[13px] text-line">{checked.error}</p>}
        {firesNow && !checked.error && <p className="text-[13px] text-body">MON is already at or below a line in this plan, so the keeper sells that row within about a minute of arming.</p>}

        {!t.account ? (
          <div className="flex flex-col gap-2">
            <Pill onClick={t.signIn} disabled={t.busy !== null}>{t.busy === "Signing in" ? "Waiting for your passkey" : "Sign in with passkey"}</Pill>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a new passkey" aria-label="Name for a new passkey" className="h-[31px] min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-mute" />
              <Ghost onClick={() => t.create(name || "tripwire")} disabled={t.busy !== null}>Create</Ghost>
            </div>
            <p className="text-[12px] leading-5 text-mute">The passkey is your wallet: no extension, no seed phrase. It signs the plan and the account upgrade with one prompt.</p>
          </div>
        ) : short_ ? (
          <div className="rounded-[10px] border border-hairline p-4 text-[13px] leading-6 text-body">
            This plan sets aside {fmtMon(toWrap)} MON and needs about {fmtMon(SETUP_GAS_BUDGET)} MON for gas. Your address holds {fmtMon(h!.mon)} MON.{" "}
            <a className="text-ink underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get testnet MON</a> for{" "}
            <span className="font-mono text-[12px] text-ink">{short(t.account.address, 8)}</span><Copy text={t.account.address} />
          </div>
        ) : (
          <Pill onClick={() => t.arm(plan, expiresAt)} disabled={t.busy !== null || !!checked.error}>
            {t.busy === "Arming" ? t.steps.at(-1)?.label ?? "Signing" : `Sign plan (${plan.length} ${plan.length === 1 ? "sale" : "sales"})`}
          </Pill>
        )}

        <p className="rounded-[10px] border border-hairline px-4 py-3 text-[13px] leading-5 text-mute">
          A line is not a guaranteed price. The keeper sells at the pool price once the 60 s average is at or below your line, and never below your floor; in a fast drop past the floor, that row does not sell.
        </p>

        {t.error && <p className="text-[13px] text-line">{t.error}</p>}
        {t.steps.length > 0 && (
          <ol className="rounded-[10px] border border-hairline">
            {t.steps.map((s, i) => (
              <li key={i} className="flex h-8 items-center justify-between border-b border-hairline px-4 text-[13px] last:border-b-0">
                <span className="text-ink">{s.label}</span>
                {s.hash && <TxLink hash={s.hash as Hex} />}
              </li>
            ))}
          </ol>
        )}
        {t.account && h && (
          <p className="num text-[12px] text-mute">
            <a href={addrUrl(t.account.address)} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">{short(t.account.address, 8)}</a>: {fmtMon(h.mon)} MON, {fmtMon(h.wmon)} WMON set aside, {(Number(h.stable) / 1e6).toLocaleString("en-US", { maximumSignificantDigits: 4 })} aUSD
          </p>
        )}
      </div>
    </div>
  );
}
