"use client";
// The plan ticket. Each row reads as the sentence the chain will enforce: "Sell 0.02 MON if MON falls to 0.02981,
// never below 0.02851", with how far MON is from that line right now. Every figure below is read from the same
// tranche values that are encoded into the signed terms, so what the holder reads is what the enforcer checks.
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { type PlainTranche, priceToTick, toTranches } from "../lib/plan";
import { SETUP_GAS_BUDGET } from "../lib/holder";
import { PERPL_ANCHOR } from "../lib/perplAnchor";
import type { useTripwire } from "./useTripwire";
import { Card, Copy, Fact, Ghost, Pill, StepList, addrUrl, fmtMon, fmtPrice, short } from "./parts";

type T = ReturnType<typeof useTripwire>;
const DEFAULT_END = "2026-10-20";
const fmtAusd = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 4 });

const FIELD =
  "num h-10 rounded-md lg:h-9 border border-hairline bg-surface px-2 text-[14px] text-ink outline-none transition-colors duration-150 ease-out hover:border-hairline-strong focus:border-ink";

/** A number box that keeps what the holder is typing ("0." stays "0.") until the plan value it parses to changes. */
function NumField({ label, value, onChange, tone = "text-ink", tight = false }: { label: string; value: string | number; onChange: (v: string) => void; tone?: string; tight?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null && Number(draft) === Number(value) ? draft : String(value);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      style={{ width: `${Math.max(shown.length, 5) + 3}ch` }}
      className={`${FIELD} ${tight ? "ml-1 pr-1.5" : "mx-1"} max-w-full text-right ${tone}`}
    />
  );
}

function Direction({ n, up, onPick }: { n: number; up: boolean; onPick: () => void }) {
  return (
    <span role="group" aria-label={`Tranche ${n} direction`} className="mx-1 inline-flex h-10 overflow-hidden lg:h-9 rounded-md border border-hairline">
      {([false, true] as const).map((u) => (
        <button
          key={String(u)}
          type="button"
          aria-pressed={up === u}
          onClick={() => up !== u && onPick()}
          className={`flex items-center px-3 text-[13px] leading-none transition-colors duration-150 ease-out ${up === u ? "bg-hairline-strong font-medium text-ink" : "text-mute hover:text-ink"}`}
        >
          {u ? "rises to" : "falls to"}
        </button>
      ))}
    </span>
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

  // From 1024 px up the ticket stays in view beside the page and only its rows scroll, so the sign step is never below the fold.
  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-6.5rem)]">
      <div className="min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-color:var(--color-hairline-strong)_transparent] lg:[scrollbar-width:thin]">
      <Card title="Your plan" aside={<span className="text-[12px] text-mute">prices in {sym} per MON</span>}>
        <div className="flex flex-col gap-1.5 px-4 pb-3 pt-2.5 sm:flex-row sm:items-center sm:gap-3">
          <p className="shrink-0 text-[12px] text-mute">Set row 1 to</p>
          <div className="grid flex-1 grid-cols-4 gap-2">
            {(up0 ? [["Market", 0], ["+5%", 5], ["+10%", 10], ["+20%", 20]] : [["Market", 0], ["-5%", -5], ["-10%", -10], ["-20%", -20]]).map(([l, v]) => (
              <button key={l} type="button" onClick={() => preset(v as number)} className="h-10 rounded-md border border-hairline px-1 text-[13px] lg:h-9 text-body transition-colors duration-150 ease-out hover:border-hairline-strong hover:text-ink active:scale-[0.97]">
                {l}
              </button>
            ))}
          </div>
        </div>
        <ol>
          {plan.map((p, i) => {
            const dist = price !== null && p.line > 0 ? (Math.abs(price - p.line) / price) * 100 : null;
            const back = Number(p.mon) * p.floor;
            return (
              <li key={i} className="border-t border-hairline px-4 pb-2 pt-3">
                <p className="text-[15px] leading-[44px] text-ink">
                  Sell
                  <NumField label={`Tranche ${i + 1} MON`} value={p.mon} onChange={(v) => set(i, "mon", v)} />
                  MON if MON
                  <Direction n={i + 1} up={p.up === true} onPick={() => flip(i)} />
                  <span className="whitespace-nowrap">
                    <NumField label={`Tranche ${i + 1} line`} value={p.line} onChange={(v) => set(i, "line", v)} tone={p.up ? "text-ink" : "text-line"} tight />,
                  </span>
                  <span className="whitespace-nowrap">
                    {" "}never below
                    <NumField label={`Tranche ${i + 1} floor`} value={p.floor} onChange={(v) => set(i, "floor", v)} tone="text-body" />
                  </span>
                </p>
                <div className="flex items-start justify-between gap-2">
                  <p className="num text-[12px] leading-5 text-mute">
                    <span className="font-sans text-body">{p.up ? "Take-profit" : "Stop-loss"}</span>
                    {price === null || !(p.line > 0) ? (
                      ": reading the price."
                    ) : reached(p) ? (
                      <span className="text-body">: MON is already {p.up ? "at or above" : "at or below"} this line ({fmtPrice(price)}). The keeper sells it within about a minute of arming.</span>
                    ) : (
                      <>
                        : <span className="text-ink">{dist!.toFixed(1)}% {p.up ? "above" : "below"}</span> MON now ({fmtPrice(price)})
                        {Number.isFinite(back) && back > 0 ? `, pays at least ${fmtAusd(back)} ${sym}` : ""}
                      </>
                    )}
                  </p>
                  <button type="button" aria-label={`Remove tranche ${i + 1}`} disabled={plan.length === 1} onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="-mr-2 -mt-1.5 h-9 w-9 shrink-0 text-[18px] leading-none text-mute transition-colors duration-150 hover:text-ink disabled:opacity-20">
                    &times;
                  </button>
                </div>
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
            className="h-11 w-full border-t border-hairline px-4 text-left text-[13px] text-mute transition-colors duration-150 hover:text-ink"
          >
            Add another sale
          </button>
        )}
        <div className="border-t border-hairline">
          <Fact label="Pays only to">
            {t.account ? <span className="font-mono text-[12px]">{short(t.account.address, 8)}<Copy text={t.account.address} /></span> : <span className="text-mute">your passkey address</span>}
          </Fact>
          <Fact label="At most it sells">{checked.tranches ? `${fmtMon(total)} MON` : "check the rows"}</Fact>
          <Fact label="You get at least">{checked.tranches ? `${fmtAusd(atLeast)} ${sym}` : "check the rows"}</Fact>
          <Fact label="Plan ends">
            <input type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} aria-label="Plan stops on" className="num h-6 bg-transparent text-right text-ink outline-none [color-scheme:dark]" />
          </Fact>
        </div>
        <details className="group border-t border-hairline">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[13px] text-body hover:text-ink [&::-webkit-details-marker]:hidden">
            <span>What the contract checks on every sale</span>
            <span className="text-mute transition-transform duration-150 group-open:rotate-90" aria-hidden>&rsaquo;</span>
          </summary>
          <div className="pb-1">
            <Fact label="Line">the 60 s average has to be at or past it, in the direction you chose</Fact>
            <Fact label="Floor">the sale pays at least this per MON, or it reverts</Fact>
            <Fact label="Size">{checked.tranches ? `exactly the row's MON, largest ${fmtMon(largest)} MON` : "exactly the row's MON"}</Fact>
            <Fact label="Gap below a floor">that row does not sell and you keep the MON</Fact>
            <Fact label="Route">WMON for {sym}, Uniswap V3, 0.3% fee</Fact>
            <Fact label="Perpl hedge">this plan also records account {PERPL_ANCHOR.accountId}, {PERPL_ANCHOR.side} {PERPL_ANCHOR.size} {PERPL_ANCHOR.symbol} lots</Fact>
          </div>
        </details>
      </Card>
      </div>

      <div className="flex shrink-0 flex-col gap-3" id="sign">
        {checked.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{checked.error}</p>}

        {!t.account ? (
          <div className="flex flex-col gap-3">
            <Pill onClick={() => t.create(name || "tripwire")} disabled={t.busy !== null}>{t.busy === "Creating your passkey" ? "Waiting for your passkey" : "Create a passkey wallet"}</Pill>
            <p className="text-[12px] leading-5 text-mute">
              The passkey is your wallet: no extension, no seed phrase. The next step signs this plan with one prompt.
            </p>
            <div className="flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it (optional)" aria-label="Name for a new passkey" className="h-10 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-mute focus:border-ink" />
              <Ghost onClick={t.signIn} disabled={t.busy !== null}>{t.busy === "Signing in" ? "Waiting for your passkey" : "Sign in with passkey"}</Ghost>
            </div>
          </div>
        ) : short_ && h && h.mon === 0n && t.net.key !== "testnet" ? (
          <div className="flex flex-col gap-2 rounded-[10px] border border-hairline p-4 text-[13px] leading-6 text-body" data-testid="fund">
            <p>
              This passkey account holds no MON on {t.net.name}. Send at least <span className="num text-ink">{fmtMon(toWrap + SETUP_GAS_BUDGET)} MON</span> to it and Sign plan unlocks the moment it lands.
            </p>
            <p className="break-all font-mono text-[12px] text-ink">{t.account.address}<Copy text={t.account.address} /></p>
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
            {t.net.key === "testnet" ? <><a className="text-ink underline underline-offset-4" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get testnet MON</a> for</> : "Send more MON to"}{" "}
            <span className="font-mono text-[12px] text-ink">{short(t.account.address, 8)}</span><Copy text={t.account.address} />
          </div>
        ) : (
          <>
            <Pill onClick={() => t.arm(plan, expiresAt)} disabled={t.busy !== null || !!checked.error}>
              {t.busy === "Arming" ? t.steps.at(-1)?.label ?? "Signing" : `Sign plan (${plan.length} ${plan.length === 1 ? "sale" : "sales"})`}
            </Pill>
            <p className="text-[12px] leading-5 text-mute">One passkey prompt wraps the planned MON, upgrades your account and posts the signed plan. Revoke any time.</p>
          </>
        )}

        {t.error && <p className="border-l-2 border-ink pl-3 text-[13px] text-ink">{t.error}</p>}
        <StepList steps={t.steps} />
        {t.account && h && (
          <p className="num text-[12px] text-mute">
            <a href={addrUrl(t.account.address)} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">{short(t.account.address, 8)}</a>: {fmtMon(h.mon)} MON, {fmtMon(h.wmon)} WMON set aside, {(Number(h.stable) / 1e6).toLocaleString("en-US", { maximumSignificantDigits: 4 })} {sym}
          </p>
        )}
      </div>
    </div>
  );
}
