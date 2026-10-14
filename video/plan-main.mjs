// plan-main.mjs NET [OUT] : narration timings + the run's clip marks -> film-main.json (mkspec input) and the scene cue files.
// UI-paced clips (H, P) were scheduled against the narration, so their pieces are cut at the narration's own offsets.
// Chain-paced clips are cut between their marks and fitted to the line.
import fs from "node:fs";
const net = process.argv[2], outName = process.argv[3] ?? `tripwire-main-${net}`;
const tm = JSON.parse(fs.readFileSync("vo/ms/out/timings.json", "utf8"));
const L = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const ids = tm.lines.map((l) => l.id);
const st = (id) => (id === ids[0] ? 0 : L[id].start);
const nx = (id) => { const i = ids.indexOf(id); return i + 1 < ids.length ? L[ids[i + 1]].start : tm.duration; };
const D = (id) => nx(id) - st(id);
const r = (x) => +x.toFixed(2);
const M = (c) => JSON.parse(fs.readFileSync(`work2/${net}/${c}/marks.json`, "utf8"));
const m = {}; for (const c of ["H", "P", "W", "S", "K", "C", "R", "X1", "X2", "X3", "X4"]) m[c] = M(c);
const P = (src, ss, se, extra = {}) => ({ src, ss: r(ss), se: r(se), ...extra });
const W = (c) => `work2/${net}/${c}.mp4`;
const beats = [];
const aligned = (clip, first, id) => { const b = L[first].start; return P(W(clip), Math.max(0, L[id].start - b), nx(id) - b, { fit: true }); };
const Z = (from, to, fx, fy) => ({ zoom: { from, to, fx, fy } });
const hd = ["s01", "s02", "s03", "s04"].map((id) => nx(id) - st(id)), ht = hd.reduce((a, b) => a + b, 0);
const Hb = {}; { let c = 0; ["s01", "s02", "s03", "s04"].forEach((id, i) => { Hb[id] = [r(26.8 * c / ht), r(26.8 * (c + hd[i]) / ht)]; c += hd[i]; }); }
for (const id of ["s01", "s02", "s03", "s04"]) beats.push({ lines: [id], pieces: [P("work2/H-old.mp4", Hb[id][0], Hb[id][1], { fit: true, ...Z(1.01, 1.04, 0.5, 0.3) })] });
const Pb = { s05: [0, 10.5], s06: [10.5, 20.3], s07: [20.3, m.P.duration] };
for (const id of ["s05", "s06", "s07"]) beats.push({ lines: [id], pieces: [P(W("P"), Pb[id][0], Pb[id][1], { fit: true, ...(id === "s05" ? Z(1, 1.12, 0.8, 0.3) : {}) })] });
beats.push({ lines: ["s08"], pieces: [P(W("W"), m.W.marks.start, m.W.marks.addr + 1.8, { fit: true })] });
beats.push({ lines: ["s09"], pieces: [P(W("W"), m.W.marks.addr + 1.8, m.W.duration, { fit: true })] });
beats.push({ lines: ["s10"], pieces: [P(W("S"), 0.2, m.S.marks.armed + 1.2, { fit: true })] });
beats.push({ lines: ["s11"], pieces: [P(W("K"), 0.4, m.K.marks.sold, { fit: true })] });
beats.push({ lines: ["s12"], pieces: [P(W("K"), m.K.marks.sold, m.K.duration - 0.3, { fit: true, ...Z(1, 1.45, 0.85, 0.18) })] });
beats.push({ lines: ["s13"], pieces: [P(W("X1"), 0.5, m.X1.duration - 0.2, { fit: true, ...Z(1, 1.25, 0.15, 0.3) })] });
beats.push({ lines: ["s14"], pieces: [P("work2/X5.mp4", 1.4, 5.4), P(`work2/s-chain-main.mp4`, 0.2, 5.4, { fit: true })] });
beats.push({ lines: ["s15"], pieces: [P(W("C"), 0.3, m.C.marks.try1, { fit: true, ...Z(1, 1.28, 0.82, 0.45) })] });
const C = m.C.marks;
beats.push({ lines: ["s16"], pieces: [P(W("C"), C.try1, C.try2, { fit: true })] });
beats.push({ lines: ["s17"], pieces: [P(W("C"), C.try2, C.try3, { fit: true })] });
beats.push({ lines: ["s18"], pieces: [P(W("C"), C.try3, m.C.duration - 0.3, { fit: true })] });
{
  const d = D("s19"), l = Math.min(3.0, d / 3);
  beats.push({ lines: ["s19"], pieces: [P(W("X2"), 0.8, 0.8 + l), P(W("X3"), 0.8, 0.8 + l), P(W("X4"), 0.8, 0.8 + l, { fit: true })] });
}
beats.push({ lines: ["s20"], pieces: [P("work2/s-rules.mp4", 0.2, D("s20") + 0.2, { fit: true })] });
beats.push({ lines: ["s21"], pieces: [P(W("R"), 0.2, m.R.marks.unwrapped + 2.2, { fit: true })] });
beats.push({ lines: ["s22"], pieces: [P("work2/s-end.mp4", 0.2, D("s22") + 0.2, { fit: true })] });
fs.writeFileSync("film-main.json", JSON.stringify({ name: outName, timings: "vo/ms/out/timings.json", audio: "vo/ms/out/narration.wav", out: `${outName}.mp4`, caps: "work2/caps-main", beats }, null, 1));
// scene cues
const s20 = L.s20, d20 = D("s20");
const words = (t) => t.split(" ").length;
// the enforcer line starts after "Here is how." ; checks start at "It checks"
const txt = s20.text, idx = (w) => txt.indexOf(w) / txt.length;
const at = (w) => r(0.2 + (s20.end - s20.start) * idx(w));
const r0 = at("the line, the floor");
const rules = { title: "THE CHAIN CHECKS EVERY SALE AGAINST MY SIGNED PLAN", big: "Four checks, on Monad, on every sale", t0: 0.2, r0, step: 0.85, drift: 0.04, dur: r(d20 + 1.0), rows: [["the line", "the price has reached my line"], ["the floor", "the sale pays at least my floor"], ["the amount", "exactly what I signed, once"], ["who gets paid", "only my own wallet"]], foot: `<span style="font:500 34px 'PS';color:#f4f4f6">Break any rule and the sale fails.</span><br>The three refusals: Tripwire:above-line, Tripwire:min-out, Tripwire:recipient` };
fs.writeFileSync("work2/cues-rules-main.json", JSON.stringify(rules));
const d22 = D("s22") + L.s22.end - L.s22.start;
fs.writeFileSync("work2/cues-end-main.json", JSON.stringify({ tag: "Let a bot sell for you. The chain makes sure it can only make the sale you signed.", url: "tripwire-three.vercel.app", word: 1.0, tagAt: 1.6, urlAt: r((L.s22.end - L.s22.start) * 0.55 + 0.8), drift: 0.05, dur: r(D("s22") + 0.8) }));
fs.writeFileSync("work2/scenes-main.json", JSON.stringify([["s-chain-main", "chain.html", "work2/cues-chain-main.json", D("s14") + 0.8], ["s-rules", "chain.html", "work2/cues-rules-main.json", d20 + 1.0], ["s-end", "end.html", "work2/cues-end-main.json", D("s22") + 0.8]]));
console.log("beats", beats.length, "total", tm.duration);
