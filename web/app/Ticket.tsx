"use client";
// The plan ticket. One row per sale, as a grid: SIDE, SIZE, LINE, FLOOR. Under each row the distance from MON's price
// to that line and the least the sale can pay. Above the sign step a fixed ledger states the worst case in five lines.
// Every figure is read from the same tranche values that are encoded into the signed terms, so what the holder reads
// is what the enforcer checks.
import { useMemo, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { type PlainTranche, priceToTick, toTranches } from "../lib/plan";
import { SETUP_GAS_BUDGET } from "../lib/holder";
import { PERPL_ANCHOR } from "../lib/perplAnchor";
import type { useTripwire } from "./useTripwire";
import { Card, Copy, Fact, Ghost, Pill, StepList, addrUrl, fmtAusd, fmtMon, fmtPrice, fmtUsd, short } from "./parts";

type T = ReturnType<typeof useTripwire>;
const DEFAULT_END = "2026-10-20";

const FIELD =
  "num h-10 w-full min-w-0 rounded-md border border-hairline bg-surface px-1.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out hover:border-hairline-strong focus:border-ink lg:h-9 lg:px-1.5 lg:text-[14px]";
const ROW = "grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-1.5 px-3 lg:gap-2 lg:px-4";

/** A number box that keeps what the holder is typing ("0." stays "0.") until the plan value it parses to changes.
 * At rest it shows `decimals` places, so a line reads 0.02130 here exactly as it does on the chart. */
function NumField({ label, value, onChange, tone = "text-ink", decimals }: { label: string; value: string | number; onChange: (v: string) => void; tone?: string; decimals?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const rest = decimals !== undefined && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value).toFixed(decimals) : String(value);
  const shown = draft !== null && Number(draft) === Number(value) ? draft : rest;
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => setDraft(null)}
      className={`${FIELD} text-right ${tone}`}
    />
  );
}

function Side({ n, up, onPick }: { n: number; up: boolean; onPick: () => void }) {
  return (
    <div className="relative">
      <select
        aria-label={`Tranche ${n} direction`}
        value={up ? "up" : "down"}
        onChange={(e) => (e.target.value === "up") !== up && onPick()}
        className={`${FIELD} appearance-none pl-1.5 pr-3.5 text-left font-sans text-[12px] [color-scheme:dark] lg:px-1.5 lg:pr-3.5 lg:text-[12px] ${up ? "text-ink" : "text-line"}`}
      >
        <option value="down">Stop</option>
        <option value="up">Target</option>
      </select>
      <svg viewBox="0 0 8 5" width="8" height="5" fill="none" stroke="currentColor" strokeWidth="1.2" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-mute" aria-hidden>
        <path d="M1 1l3 3 3-3" />
      </svg>
    </div>
  );
}

export function Ticket({ t, plan, setPlan, price }: { t: T; plan: PlainTranche[]; setPlan: (p: PlainTranche[]) => void; price: number | null }) {
  const [expiry, setExpiry] = useState(DEFAULT_END);
  const [name, setName] = useState("");
  const sym = t.net.stableSymbol;

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
  const atLeast = plan.reduce((n, p) => n + Number(p.mon) * p.floor, 0);

  // The primary action sits outside the card so that on a phone it can stay at the bottom of the screen while the rows
  // scroll, and so the card itself never needs an inner scroll bar. Anything else the sign step needs goes in `rest`.
  let primary: ReactNode = null;
  let rest: ReactNode;
  if (!t.account) {
    primary = <Pill onClick={() => t.create(name || "tripwire")} disabled={t.busy !== null}>{t.busy === "Creating your passkey" ? "Waiting for your passkey" : "Create a passkey wallet"}</Pill>;
    rest = (
      <>
        <p className="text-[12px] leading-5 text-mute">The passkey is your wallet: no extension, no seed phrase. The next step signs this plan with one prompt.</p>
        <div className="flex items-center gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it (optional)" aria-label="Name for a new passkey" className="h-10 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-mute focus:border-ink" />
          <button type="button" onClick={t.signIn} disabled={t.busy !== null} className="shrink-0 text-[13px] text-body underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:text-ink disabled:opacity-40">
            {t.busy === "Signing in" ? "Waiting for your passkey" : "Sign in with passkey"}
          </button>
        </div>
      </>
    );
  } else if (short_ && h && h.mon === 0n && t.net.key !== "testnet") {
    rest = (
      <div className="flex flex-col gap-2 rounded-[10px] border border-hairline p-4 text-[13px] leading-6 text-body" data-testid="fund">
        <p>
          This passkey account holds no MON on {t.net.name}. Send at least <span className="num text-ink">{fmtMon(toWrap + SETUP_GAS_BUDGET)} MON</span> to it and Sign plan unlocks the moment it lands.
        </p>
        <p className="break-all font-mono text-[12px] text-ink">{t.account.address}<Copy text={t.account.address} /></p>
      </div>
    );
  } else if (short_ && h && h.mon === 0n) {
    primary = <Pill onClick={t.drip} disabled={t.busy !== null}>{t.busy === "Getting testnet MON" ? "Sending testnet MON" : "Get 0.1 testnet MON to try it"}</Pill>;
    rest = <p className="text-[12px] leading-5 text-mute">tripwire sends a fresh passkey account enough testnet MON for a small plan and its gas, once. Or use <a className="underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">faucet.monad.xyz</a>.</p>;
  } else if (short_) {
    rest = (
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
        {t.net.key === "testnet" ? <><a className="text-ink underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get testnet MON</a> for</> : "Send more MON to"}{" "}
        <span className="font-mono text-[12px] text-ink">{short(t.account.address, 8)}</span><Copy text={t.account.address} />
      </div>
    );
  } else {
    primary = (
      <Pill onClick={() => t.arm(plan, expiresAt)} disabled={t.busy !== null || !!checked.error}>
        {t.busy === "Arming" ? t.steps.at(-1)?.label ?? "Signing" : `Sign plan (${plan.length} ${plan.length === 1 ? "sale" : "sales"})`}
      </Pill>
    );
    rest = <p className="text-[12px] leading-5 text-mute">One passkey prompt wraps the planned MON, upgrades your account and posts the signed plan. Revoke any time.</p>;
  }

  return (
    <div id="sign" className="ticket-stick flex scroll-mt-4 flex-col gap-4">
      <Card title="Your plan" aside={<span className="text-[12px] text-mute">prices in {sym} per MON</span>}>
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5 sm:flex-row sm:items-center sm:gap-3 lg:px-4">
          <p className="shrink-0 text-[12px] text-mute">Set row 1 to</p>
          <div className="grid flex-1 grid-cols-4 gap-2">
            {(up0 ? [["Market", 0], ["+5%", 5], ["+10%", 10], ["+20%", 20]] : [["Market", 0], ["-5%", -5], ["-10%", -10], ["-20%", -20]]).map(([l, v]) => (
              <button key={l} type="button" onClick={() => preset(v as number)} className="h-10 rounded-md border border-hairline px-1 text-[13px] text-body transition-colors duration-150 ease-out hover:border-hairline-strong hover:text-ink active:scale-[0.97] lg:h-9">
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={`${ROW} min-h-[25px] border-t border-hairline text-[11px] uppercase tracking-[0.06em] text-mute`} aria-hidden>
          <span>Side</span><span className="text-right">Size</span><span className="text-right">Line</span><span className="text-right">Floor</span><span />
        </div>
        <ol>
          {plan.map((p, i) => {
            const dist = price !== null && p.line > 0 ? ((p.line - price) / price) * 100 : null;
            const back = Number(p.mon) * p.floor;
            return (
              <li key={i} className="pb-2.5 pt-1">
                <div className={ROW}>
                  <Side n={i + 1} up={p.up === true} onPick={() => flip(i)} />
                  <NumField label={`Tranche ${i + 1} MON`} value={p.mon} onChange={(v) => set(i, "mon", v)} />
                  <NumField label={`Tranche ${i + 1} line`} value={p.line} decimals={5} onChange={(v) => set(i, "line", v)} tone={p.up ? "text-ink" : "text-line"} />
                  <NumField label={`Tranche ${i + 1} floor`} value={p.floor} decimals={5} onChange={(v) => set(i, "floor", v)} tone="text-body" />
                  <button type="button" aria-label={`Remove tranche ${i + 1}`} disabled={plan.length === 1} onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="h-9 w-6 text-[18px] leading-none text-mute transition-colors duration-150 hover:text-ink disabled:opacity-20">
                    &times;
                  </button>
                </div>
                <p className="num mt-1.5 px-3 text-[12px] leading-4 text-mute lg:px-4">
                  {price === null || !(p.line > 0) ? (
                    "Reading the price"
                  ) : reached(p) ? (
                    <span className="text-body">Already crossed: sells within about a minute</span>
                  ) : (
                    <>
                      <span className={p.up ? "text-ink" : "text-line"}>{dist! > 0 ? "+" : "−"}{Math.abs(dist!).toFixed(1)}%</span> from {fmtPrice(price)}
                      {Number.isFinite(back) && back > 0 ? ` · min ${fmtAusd(back)} ${sym}` : ""}
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
        {plan.length < 3 && (
          <button
            type="button"
            onClick={() => {
              const last = plan[plan.length - 1];
              const k = last.up ? 1.15 : 0.85;
              setPlan([...plan, { mon: last.mon, line: Number((last.line * k).toFixed(5)), floor: Number((last.floor * k).toFixed(5)), ...(last.up ? { up: true } : {}) }]);
            }}
            className="h-11 w-full border-t border-hairline px-3 text-left text-[13px] text-mute transition-colors duration-150 hover:text-ink lg:px-4"
          >
            Add another sale
          </button>
        )}
        <div className="border-t border-hairline" data-testid="ledger">
          <Fact label="Max sold">{checked.tranches ? `${fmtMon(total)} MON` : "check the rows"}</Fact>
          <Fact label="Worst-case received">{checked.tranches ? `≥ ${fmtAusd(atLeast)} ${sym}` : "check the rows"}</Fact>
          <Fact label="Keeper fee">0</Fact>
          <Fact label="Gas per sale">paid by keeper</Fact>
          <Fact label="Expires">
            <input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} aria-label="Plan stops on" className="num h-6 bg-transparent text-right text-ink outline-none [color-scheme:dark]" />
          </Fact>
        </div>
        <p className="border-t border-hairline px-4 py-2.5 text-[12px] leading-5 text-mute">Sells at the 60 s pool average. If MON gaps through your floor, that row does not sell.</p>
        <details className="group border-t border-hairline">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[13px] text-body hover:text-ink [&::-webkit-details-marker]:hidden">
            <span>What the contract checks on every sale</span>
            <span className="text-mute transition-transform duration-150 group-open:rotate-90" aria-hidden>&rsaquo;</span>
          </summary>
          <div className="pb-1">
            <Fact label="Recipient">
              {t.account ? <span className="font-mono text-[12px]">{short(t.account.address, 8)}<Copy text={t.account.address} /></span> : "your passkey address, nobody else"}
            </Fact>
            <Fact label="Line">the 60 s average has to be at or past it, in the direction you chose</Fact>
            <Fact label="Floor">the sale pays at least this per MON, or it reverts</Fact>
            <Fact label="Size">{checked.tranches ? `exactly the row's MON, largest ${fmtMon(largest)} MON` : "exactly the row's MON"}</Fact>
            <Fact label="Gap below a floor">that row does not sell and you keep the MON</Fact>
            <Fact label="Route">WMON for {sym}, Uniswap V3, 0.3% fee</Fact>
            <Fact label="Perpl hedge">this plan also records account {PERPL_ANCHOR.accountId}, {PERPL_ANCHOR.side} {PERPL_ANCHOR.size} {PERPL_ANCHOR.symbol} lots</Fact>
          </div>
        </details>
      </Card>

      {checked.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{checked.error}</p>}
      {primary && <div className="sticky bottom-0 z-20 -mx-4 border-t border-hairline bg-canvas px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">{primary}</div>}
      <div className="flex shrink-0 flex-col gap-3">
        {rest}
        {t.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{t.error}</p>}
        <StepList steps={t.steps} />
        {t.account && h && (
          <p className="num text-[12px] text-mute">
            <a href={addrUrl(t.account.address)} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">{short(t.account.address, 8)}</a>: {fmtMon(h.mon)} MON, {fmtMon(h.wmon)} WMON set aside, {fmtUsd(h.stable)} {sym}
          </p>
        )}
      </div>
    </div>
  );
}
