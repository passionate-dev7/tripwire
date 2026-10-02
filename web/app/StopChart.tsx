"use client";
// The noun: MON's price running across the chart and the holder's red lines it must cross before anything sells.
// The 60 s TWAP (what the contract reads) is the ink line; spot is a faint line beside it, so the gap the enforcer
// waits out is visible. Each tranche is a red line at its price; its floor is a faint dashed red line under it.
import { useEffect, useRef } from "react";
import { ColorType, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Point } from "../lib/api";
import { tickToPrice } from "../lib/plan";

export type ChartLine = { price: number; floor: number; label: string; state: "draft" | "armed" | "sold" };

const INK = "#f4f4f6";
const MUTE = "#9c9c9d";
const RED = "#ff6161";
const HAIR = "#242728";

export function StopChart({ points, lines, height = 280 }: { points: Point[]; lines: ChartLine[]; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const twap = useRef<ISeriesApi<"Line"> | null>(null);
  const spot = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: MUTE, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: HAIR } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: HAIR, labelBackgroundColor: "#121212" }, horzLine: { color: HAIR, labelBackgroundColor: "#121212" } },
      handleScale: false,
      handleScroll: false,
      autoSize: true,
    });
    spot.current = c.addSeries(LineSeries, { color: "rgba(244,244,246,0.28)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: { type: "price", precision: 5, minMove: 0.00001 } });
    twap.current = c.addSeries(LineSeries, { color: INK, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision: 5, minMove: 0.00001 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.applyOptions({ height });
  }, [height]);

  useEffect(() => {
    if (!twap.current || !spot.current) return;
    // one point per second at most; lightweight-charts needs strictly increasing times
    const seen = new Set<number>();
    const rows = points
      .map((p) => ({ t: Math.floor(p.t / 1000) as UTCTimestamp, twap: tickToPrice(p.twap), spot: tickToPrice(p.spot) }))
      .filter((r) => (seen.has(r.t) ? false : (seen.add(r.t), true)));
    twap.current.setData(rows.map((r) => ({ time: r.t, value: r.twap })));
    spot.current.setData(rows.map((r) => ({ time: r.t, value: r.spot })));
    chart.current?.timeScale().fitContent();
  }, [points]);

  useEffect(() => {
    const s = twap.current;
    if (!s) return;
    const made = lines.flatMap((l) => [
      s.createPriceLine({
        price: l.price,
        color: l.state === "sold" ? MUTE : RED,
        lineWidth: l.state === "armed" ? 2 : 1,
        lineStyle: l.state === "draft" ? LineStyle.LargeDashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.label,
      }),
      s.createPriceLine({ price: l.floor, color: "rgba(255,97,97,0.55)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "floor" }),
    ]);
    // keep every line in view, not just the price
    s.applyOptions({
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = base();
        if (!r || lines.length === 0) return r;
        const all = lines.flatMap((l) => [l.price, l.floor]);
        return { priceRange: { minValue: Math.min(r.priceRange.minValue, ...all), maxValue: Math.max(r.priceRange.maxValue, ...all) } };
      },
    });
    return () => made.forEach((pl) => s.removePriceLine(pl));
  }, [lines]);

  return <div ref={host} className="w-full" style={{ height }} role="img" aria-label="MON price over time with your stop lines" />;
}
