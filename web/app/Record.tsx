"use client";
// The public record, visible before sign-in: every sale the keeper made and every forbidden sale the contract refused,
// each with its transaction. Served from the keeper's index (/api/recent), each row links to the explorer.
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { tickToPrice } from "../lib/plan";
import { TxLink, fmtMon, fmtPrice, fmtUsd } from "./parts";

type Row =
  | { kind: "sale"; plan: number; holder: Hex; hash: Hex; block: number; index: number; amountIn: string; minOut: string; priceTick: number }
  | { kind: "refused"; plan: number; holder: Hex; hash: Hex; block: number; attack: "line" | "floor" | "recipient"; reason: string };

const TRIED: Record<string, string> = {
  line: "sell before MON reached the line",
  floor: "sell for half the floor",
  recipient: "send the aUSD to itself",
};

export function Record() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${process.env.NEXT_PUBLIC_KEEPER_API ?? ""}/api/recent`, { cache: "no-store" })
        .then((r) => r.json())
        .then((b) => live && setRows(b.rows))
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="rounded-[10px] border border-hairline bg-surface-card" aria-label="On chain record">
      <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 border-b border-hairline px-4 py-2">
        <h2 className="text-[13px] font-medium text-ink">On chain: what the keeper did, and what the contract refused</h2>
        <span className="text-[12px] text-mute">Monad testnet, newest first</span>
      </header>
      {rows === null ? (
        <p className="px-4 py-3 text-[13px] text-mute">Reading the keeper's record.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.hash} className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-hairline px-4 py-[7px] text-[13px] leading-[18px] last:border-b-0">
              {r.kind === "sale" ? (
                <span className="text-ink">
                  <span className="num">Plan {r.plan}</span>: sold <span className="num">{fmtMon(r.amountIn)}</span> MON at a 60 s average of <span className="num">{fmtPrice(tickToPrice(r.priceTick))}</span>, for at least <span className="num">{fmtUsd(r.minOut)}</span> aUSD, to the holder
                </span>
              ) : (
                <span className="text-body">
                  <span className="num">Plan {r.plan}</span>: keeper tried to {TRIED[r.attack]}. Refused, <span className="num whitespace-nowrap text-ink">{r.reason}</span>
                </span>
              )}
              <TxLink hash={r.hash} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
