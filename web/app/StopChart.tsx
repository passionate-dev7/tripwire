"use client";
// The noun: MON's price running across the chart and the holder's red lines it must cross before anything sells.
// The 60 s TWAP (what the contract reads) is the ink line; spot is a faint line beside it, so the gap the enforcer
// waits out is visible. A stop is the one red line, a target is a light dashed line, and a floor is a quiet grey dotted
// line under its row. The price scale's own tick numbers are hidden: every line carries its own labelled value, so
// no tick can sit under a label.
import { useEffect, useRef } from "react";
import { ColorType, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Point } from "../lib/api";
import { tickToPrice } from "../lib/plan";

export type ChartLine = { price: number; floor: number; label: string; up?: boolean; state: "draft" | "armed" | "sold" | "off" };

const INK = "#f4f4f6";
const MUTE = "#9c9c9d";
const RED = "#ff6161";
const BODY = "#cdcdcd";
const QUIET = "rgba(156,156,157,0.55)";
const PLATE = "#1a1b1c";
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
      rightPriceScale: { borderVisible: false, textColor: "rgba(0,0,0,0)", scaleMargins: { top: 0.14, bottom: 0.14 } },
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
    const made = lines.flatMap((l) => {
      const done = l.state === "sold" || l.state === "off";
      const color = done ? QUIET : l.up ? BODY : RED;
      return [
        s.createPriceLine({
          price: l.price,
          color,
          lineWidth: l.state === "armed" ? 2 : 1,
          lineStyle: l.state === "draft" ? LineStyle.LargeDashed : l.up ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          axisLabelColor: color,
          axisLabelTextColor: "#07080a",
          title: l.label,
        }),
        s.createPriceLine({ price: l.floor, color: QUIET, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, axisLabelColor: PLATE, axisLabelTextColor: MUTE, title: "floor" }),
      ];
    });
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
