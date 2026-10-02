// A plan as a link, so a holder's own numbers can arrive pre-filled:
//   ?sell=1@0.033/0.030,0.5@0.028/0.025
// reads "sell 1 MON at or below 0.033, never for less than 0.030; sell 0.5 MON at or below 0.028, floor 0.025".
import type { PlainTranche } from "./plan";

const PART = /^(\d+(?:\.\d{1,18})?)@(\d*\.?\d+)\/(\d*\.?\d+)$/;

export function parsePlanLink(search: string): { tranches: PlainTranche[]; errors: string[] } {
  const raw = new URLSearchParams(search).get("sell");
  if (!raw) return { tranches: [], errors: [] };
  const tranches: PlainTranche[] = [];
  const errors: string[] = [];
  for (const part of raw.split(",").slice(0, 3)) {
    const m = PART.exec(part.trim());
    if (!m) {
      errors.push(`"${part}" is not MON@line/floor`);
      continue;
    }
    const [, mon, line, floor] = m;
    if (Number(floor) > Number(line)) {
      errors.push(`"${part}": the floor is above the line, so it could never sell`);
      continue;
    }
    tranches.push({ mon, line: Number(line), floor: Number(floor) });
  }
  return { tranches, errors };
}

export function planLink(base: string, tranches: PlainTranche[]): string {
  const sell = tranches.map((t) => `${t.mon}@${t.line}/${t.floor}`).join(",");
  return `${base}?sell=${sell}`;
}
