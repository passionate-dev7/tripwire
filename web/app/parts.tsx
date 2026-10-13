"use client";
// Small pieces both screens share. Row pitches follow design-research/LAYOUT.md: 40 px editable rows, 31 px fact
// rows, 32 px activity sentences, 25 px numeric rows.
import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { MAINNET, TESTNET, type Net } from "../lib/plan";
import { currentNet } from "../lib/net";

// Explorer links follow the network the address names (?net=), read when the link is built.
export const txUrl = (hash: Hex) => `${currentNet().explorer}/tx/${hash}`;
export const addrUrl = (a: string) => `${currentNet().explorer}/address/${a}`;

/** The network this page is on. Server render and first paint use the build default; the address wins after mount. */
export function useNet(): Net {
  const [net, setNet] = useState<Net>(TESTNET);
  useEffect(() => setNet(currentNet()), []);
  return net;
}
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

/** Which network the page reads. The switch appears once mainnet has contracts of ours, so it never offers a dead end. */
export function NetSwitch() {
  const net = useNet();
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(window.location.search), []);
  if (!MAINNET.deployed) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline px-3 text-[12px] text-body" title={`Chain ${net.chainId}`}>
        {net.name}
      </span>
    );
  }
  const href = (key: Net["key"]) => {
    const q = new URLSearchParams(search);
    q.set("net", key);
    return `?${q.toString()}`;
  };
  return (
    <div role="group" aria-label="Network" className="inline-flex h-8 overflow-hidden rounded-full border border-hairline text-[12px]">
      {[TESTNET, MAINNET].map((n) => (
        <a key={n.key} href={href(n.key)} aria-current={net.key === n.key ? "true" : undefined} className={`inline-flex items-center px-3 transition-colors duration-150 ease-out ${net.key === n.key ? "bg-hairline-strong font-medium text-ink" : "text-mute hover:text-ink"}`}>
          {n.key === "mainnet" ? "Mainnet" : "Testnet"}
        </a>
      ))}
    </div>
  );
}
