"use client";
// The Plan ticket (LAYOUT.md, Plan screen, ticket column): one sentence for the first line, up to three tranche rows,
// the facts the chain will enforce, then Sign. Every fact below is read from the same tranche values that are
// encoded into the signed terms, so what the holder reads is what the enforcer checks.
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { type PlainTranche, priceToTick, toTranches } from "../lib/plan";
import { SETUP_GAS_BUDGET } from "../lib/holder";
import { PERPL_ANCHOR } from "../lib/perplAnchor";
import type { useTripwire } from "./useTripwire";
import { Card, Copy, Fact, Ghost, Pill, TxLink, addrUrl, fmtMon, fmtPrice, short } from "./parts";

type T = ReturnType<typeof useTripwire>;
const DEFAULT_END = "2026-10-20";
const fmtAusd = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 4 });

export function Ticket({ t, plan, setPlan, price }: { t: T; plan: PlainTranche[]; setPlan: (p: PlainTranche[]) => void; price: number | null }) {
  const [expiry, setExpiry] = useState(DEFAULT_END);
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
  const reached = (p: PlainTranche) => price !== null && p.line > 0 && (p.up ? priceToTick(price) >= priceToTick(p.line) : priceToTick(price) <= priceToTick(p.line));
  const firesNow = plan.some(reached);
  const flip = (i: number) => setPlan(plan.map((p, j) => (j === i ? { ...p, up: !p.up } : p)));
  const up0 = plan[0]?.up === true;

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
            Line 1 hedges your Perpl book: sell <span className="num text-ink">{plan[0]?.mon || "0"}</span> MON once the 60 s average{" "}
            <button type="button" onClick={() => flip(0)} className="rounded-md border border-hairline px-1.5 text-ink hover:border-hairline-strong" aria-label="Switch sale 1 between falls to and rises to">
              {up0 ? "rises to" : "falls to"}
            </button>
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
          <p className="num mt-1 text-[12px] text-mute">
            {price === null || !(plan[0]?.line > 0)
              ? "Reading the price."
              : reached(plan[0])
                ? `MON is already ${up0 ? "at or above" : "at or below"} it (${fmtPrice(price)}): the keeper sells this within about a minute of arming.`
                : `${((Math.abs(price - plan[0].line) / price) * 100).toFixed(1)}% ${up0 ? "above" : "below"} today's 60 s average of ${fmtPrice(price)}.`}
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {(up0 ? [["Market", 0], ["+5%", 5], ["+10%", 10], ["+20%", 20]] : [["Market", 0], ["-5%", -5], ["-10%", -10], ["-20%", -20]]).map(([l, v]) => (
              <button key={l} type="button" onClick={() => preset(v as number)} className="h-10 shrink-0 rounded-lg border border-hairline px-3 text-[13px] text-body hover:border-hairline-strong hover:text-ink">
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-hairline">
          <div className="grid h-8 grid-cols-[1fr_60px_1fr_1fr_36px] items-center gap-2 px-4 text-[11px] uppercase tracking-[0.4px] text-mute">
            <span>Sell MON</span><span>When MON</span><span className="text-right">Line</span><span className="text-right" title="The sale never pays less than this per MON">Floor</span><span />
          </div>
          {plan.map((p, i) => (
            <div key={i} className="grid h-10 grid-cols-[1fr_60px_1fr_1fr_36px] items-center gap-2 border-t border-hairline px-4">
              <input aria-label={`Tranche ${i + 1} MON`} inputMode="decimal" value={p.mon} onChange={(e) => set(i, "mon", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-[13px] text-ink outline-none" />
              <button type="button" aria-label={`Tranche ${i + 1} direction`} onClick={() => flip(i)} className="h-8 rounded-lg border border-hairline text-[12px] text-body hover:border-hairline-strong hover:text-ink">
                {p.up ? "rises" : "falls"}
              </button>
              <input aria-label={`Tranche ${i + 1} line`} inputMode="decimal" value={String(p.line)} onChange={(e) => set(i, "line", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-right text-[13px] text-line outline-none" />
              <input aria-label={`Tranche ${i + 1} floor`} inputMode="decimal" value={String(p.floor)} onChange={(e) => set(i, "floor", e.target.value)} className="num h-8 w-full min-w-0 rounded-lg bg-surface px-2 text-right text-[13px] text-ink outline-none" />
              <button type="button" aria-label={`Remove tranche ${i + 1}`} disabled={plan.length === 1} onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="h-9 w-9 text-[16px] text-mute hover:text-ink disabled:opacity-20">
                ×
              </button>
            </div>
          ))}
          {plan.length < 3 && (
            <button type="button" onClick={() => { const last = plan[plan.length - 1]; const k = last.up ? 1.15 : 0.85; setPlan([...plan, { mon: last.mon, line: Number((last.line * k).toFixed(5)), floor: Number((last.floor * k).toFixed(5)), ...(last.up ? { up: true } : {}) }]); }} className="h-10 w-full border-t border-hairline px-4 text-left text-[13px] text-mute hover:text-ink">
              Add a staged sell
            </button>
          )}
        </div>
      </Card>

      <Card title="What the keeper can do">
        <Fact label="Perpl position">account {PERPL_ANCHOR.accountId}, market {PERPL_ANCHOR.marketId}, {PERPL_ANCHOR.side} {PERPL_ANCHOR.size} {PERPL_ANCHOR.symbol} lots (mainnet read {PERPL_ANCHOR.fetchedAt.slice(0, 10)})</Fact>
        <Fact label="Lines">1 spot stop at your line hedges that book, then staged sells, then vault target</Fact>
        <Fact label="Sells">WMON for aUSD on Monad testnet, one fill per row</Fact>
        {plan.some((p) => !p.up) && <Fact label="Stops: once MON falls to">{plan.filter((p) => !p.up).map((p) => fmtPrice(p.line)).join(", ")}</Fact>}
        {plan.some((p) => p.up) && <Fact label="Targets: once MON rises to">{plan.filter((p) => p.up).map((p) => fmtPrice(p.line)).join(", ")}</Fact>}
        <Fact label="Never for less than">{plan.map((p) => `${fmtPrice(p.floor)}`).join(", ")} aUSD per MON</Fact>
        <Fact label="Pays only to">
          {t.account ? <span className="font-mono text-[12px]">{short(t.account.address, 8)}<Copy text={t.account.address} /></span> : <span className="text-mute">your passkey address</span>}
        </Fact>
        <Fact label="If MON gaps below a floor">that sale does not fire; you keep the MON</Fact>
        <Fact label="Pool fee">0.3%, Uniswap V3 WMON/aUSD</Fact>
        <Fact label="You receive at least">
          {checked.tranches ? `${fmtAusd(plan.reduce((n, p) => n + Number(p.mon) * p.floor, 0))} aUSD` : "check the rows"}
        </Fact>
        <Fact label="Largest single sale">{checked.tranches ? `${fmtMon(largest)} MON` : "check the rows"}</Fact>
        <Fact label="In total, at most">{checked.tranches ? `${fmtMon(total)} MON` : "check the rows"}</Fact>
        <Fact label="Stops on">
          <input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} aria-label="Plan stops on" className="num min-h-9 bg-transparent text-right text-ink outline-none [color-scheme:dark]" />
        </Fact>
      </Card>

      <div className="flex flex-col gap-3">
        {checked.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{checked.error}</p>}
        {firesNow && !checked.error && <p className="text-[13px] text-body">MON is already past a line in this plan, so the keeper sells that row within about a minute of arming.</p>}

        {!t.account ? (
          <div className="flex flex-col gap-2">
            <Pill onClick={t.signIn} disabled={t.busy !== null}>{t.busy === "Signing in" ? "Waiting for your passkey" : "Sign in with passkey"}</Pill>
            <p className="text-[12px] leading-5 text-mute">A line is not a guaranteed price: the keeper sells at the pool price once the 60 s average reaches your line, never below your floor. In a fast drop past the floor, that row does not sell.</p>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a new passkey" aria-label="Name for a new passkey" className="h-[31px] min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-mute" />
              <Ghost onClick={() => t.create(name || "tripwire")} disabled={t.busy !== null}>Create</Ghost>
            </div>
            <p className="text-[12px] leading-5 text-mute">The passkey is your wallet: no extension, no seed phrase. It signs the plan and the account upgrade with one prompt.</p>
          </div>
        ) : short_ && h && h.mon === 0n ? (
          <div className="flex flex-col gap-2">
            <Pill onClick={t.drip} disabled={t.busy !== null}>{t.busy === "Getting testnet MON" ? "Sending testnet MON" : "Get 0.1 testnet MON to try it"}</Pill>
            <p className="text-[12px] leading-5 text-mute">tripwire sends a fresh passkey account enough testnet MON for a small plan and its gas, once. Or use <a className="underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">faucet.monad.xyz</a>.</p>
          </div>
        ) : short_ ? (
          <div className="rounded-[10px] border border-hairline p-4 text-[13px] leading-6 text-body">
            {h && h.mon > SETUP_GAS_BUDGET && (
              <div className="mb-3">
                <Ghost
                  onClick={() => {
                    // scale every sale by the same factor so the plan plus setup gas fits what the account holds
                    const room = Number(h.mon - SETUP_GAS_BUDGET - 2_000_000_000_000_000n) / 1e18;
                    const want = plan.reduce((n, p) => n + Number(p.mon), 0);
                    const k = Math.min(1, room / want);
                    setPlan(plan.map((p) => ({ ...p, mon: String(Math.floor(Number(p.mon) * k * 1e4) / 1e4) })));
                  }}
                >
                  Fit to my balance
                </Ghost>
              </div>
            )}
            This plan sets aside {fmtMon(toWrap)} MON and needs about {fmtMon(SETUP_GAS_BUDGET)} MON for gas. Your address holds {fmtMon(h!.mon)} MON.{" "}
            <a className="text-ink underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get testnet MON</a> for{" "}
            <span className="font-mono text-[12px] text-ink">{short(t.account.address, 8)}</span><Copy text={t.account.address} />
          </div>
        ) : (
          <>
            <Pill onClick={() => t.arm(plan, expiresAt)} disabled={t.busy !== null || !!checked.error}>
              {t.busy === "Arming" ? t.steps.at(-1)?.label ?? "Signing" : `Sign plan (${plan.length} ${plan.length === 1 ? "sale" : "sales"})`}
            </Pill>
            <p className="text-[12px] leading-5 text-mute">A line is not a guaranteed price: the keeper sells at the pool price once the 60 s average reaches your line, never below your floor. In a fast drop past the floor, that row does not sell.</p>
          </>
        )}


        {t.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{t.error}</p>}
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
