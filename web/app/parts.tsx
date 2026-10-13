"use client";
// Small pieces both screens share. Row pitches follow design-research/LAYOUT.md: 40 px editable rows, 31 px fact
// rows, 32 px activity sentences, 25 px numeric rows.
import { useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { TESTNET } from "../lib/plan";

export const txUrl = (hash: Hex) => `${TESTNET.explorer}/tx/${hash}`;
export const addrUrl = (a: string) => `${TESTNET.explorer}/address/${a}`;
export const short = (h: string, n = 6) => `${h.slice(0, n)}..${h.slice(-4)}`;
export const fmtPrice = (p: number) => p.toFixed(5);
export const fmtMon = (wei: bigint | string) => {
  const n = Number(BigInt(wei)) / 1e18;
  return n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};
export const fmtUsd = (raw: bigint | string, decimals = 6) => (Number(BigInt(raw)) / 10 ** decimals).toLocaleString("en-US", { maximumSignificantDigits: 4 });

export function Card({ title, aside, children, className = "", id }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-4 rounded-[10px] border border-hairline bg-surface-card ${className}`}>
      {title && (
        <header className="flex h-10 items-center justify-between border-b border-hairline px-4">
          <h2 className="text-[13px] font-medium tracking-[0.2px] text-ink">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[31px] items-start justify-between gap-4 border-b border-hairline px-4 py-[7px] text-[13px] last:border-b-0">
      <span className="whitespace-nowrap text-mute">{label}</span>
      <span className="num text-right text-ink">{children}</span>
    </div>
  );
}

export function TxLink({ hash, label }: { hash: Hex; label?: string }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center font-mono text-[12px] text-body underline decoration-hairline-strong underline-offset-4 hover:text-ink">
      {label ?? short(hash, 10)}
    </a>
  );
}

export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}
      className="ml-2 rounded-md border border-hairline px-1.5 text-[11px] text-mute hover:text-ink"
      aria-label="Copy address"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

export function Pill({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-[54px] w-full rounded-full bg-ink text-[15px] font-medium text-canvas transition-opacity duration-150 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Ghost({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-[31px] shrink-0 rounded-lg border border-hairline-strong px-3 text-[12px] font-medium text-ink transition-colors duration-150 hover:bg-surface-elevated disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

/** Which network the page reads. One slot in the header, so a network switch can replace it in one place. */
export function NetBadge() {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline px-3 text-[12px] text-body" title={`Chain ${TESTNET.chainId}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
      {TESTNET.name}
    </span>
  );
}
