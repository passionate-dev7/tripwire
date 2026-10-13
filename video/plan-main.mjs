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
for (const id of ["s01", "s02", "s03", "s04"]) beats.push({ lines: [id], pieces: [{ ...aligned("H", "s01", id), zoom: { from: 1, to: 1.06, fx: 0.3, fy: 0.25 } }] });
for (const id of ["s05", "s06", "s07"]) beats.push({ lines: [id], pieces: [aligned("P", "s05", id)] });
beats.push({ lines: ["s08"], pieces: [P(W("W"), m.W.marks.start, m.W.marks.addr + 1.8, { fit: true })] });
beats.push({ lines: ["s09"], pieces: [P(W("W"), m.W.marks.addr + 1.8, m.W.duration, { fit: true })] });
beats.push({ lines: ["s10"], pieces: [P(W("S"), 0.2, m.S.marks.armed + 1.2, { fit: true })] });
beats.push({ lines: ["s11"], pieces: [P(W("K"), 0.4, m.K.marks.sold, { fit: true })] });
beats.push({ lines: ["s12"], pieces: [P(W("K"), m.K.marks.sold, m.K.duration - 0.3, { fit: true })] });
beats.push({ lines: ["s13"], pieces: [P(W("X1"), 0.5, m.X1.duration - 0.2, { fit: true })] });
beats.push({ lines: ["s14"], pieces: [P(`work2/s-chain-main.mp4`, 0.2, D("s14") + 0.2, { fit: true })] });
beats.push({ lines: ["s15"], pieces: [P(W("C"), 0.3, m.C.marks.try1, { fit: true })] });
const C = m.C.marks;
beats.push({ lines: ["s16"], pieces: [P(W("C"), C.try1, C.try2, { fit: true })] });
beats.push({ lines: ["s17"], pieces: [P(W("C"), C.try2, C.try3, { fit: true })] });
beats.push({ lines: ["s18"], pieces: [P(W("C"), C.try3, m.C.duration - 0.3, { fit: true })] });
{
  const d = D("s19"), l = Math.min(3.0, d / 3);
  beats.push({ lines: ["s19"], pieces: [P(W("X2"), 0.8, 0.8 + l), P(W("X3"), 0.8, 0.8 + l), P(W("X4"), 0.8, 0.8 + l, { fit: true })] });
}
beats.push({ lines: ["s20"], pieces: [P("work2/s-split.mp4", 0.2, D("s20") + 0.2, { fit: true })] });
beats.push({ lines: ["s21"], pieces: [P(W("R"), 0.2, m.R.marks.unwrapped + 2.2, { fit: true })] });
beats.push({ lines: ["s22"], pieces: [P("work2/s-end.mp4", 0.2, D("s22") + 0.2, { fit: true })] });
fs.writeFileSync("film-main.json", JSON.stringify({ name: outName, timings: "vo/ms/out/timings.json", audio: "vo/ms/out/narration.wav", out: `${outName}.mp4`, caps: "work2/caps-main", beats }, null, 1));
// scene cues
const s20 = L.s20, d20 = D("s20");
const words = (t) => t.split(" ").length;
// the enforcer line starts after "Here is how." ; checks start at "It checks"
const txt = s20.text, idx = (w) => txt.indexOf(w) / txt.length;
const at = (w) => r(0.2 + (s20.end - s20.start) * idx(w));
const ck0 = at("It checks");
const split = { headline: "Two checks on one signed plan. Both run on Monad, on every sale.", keeper: "0x8a91..4468", ts: [at("The keeper holds") > 0 ? 0.4 : 0.4, at("My signed"), at("a contract called"), r(ck0 + 3.6), r(ck0 + 4.6)], ck: ck0, ckStep: 0.9, drift: 0.04, dur: r(d20 + 1.0) };
split.ts = [r(at("The keeper holds")), r(at("My signed") + 0.1), r(at("a contract called")), r(ck0 + 3.8), r(ck0 + 4.6)];
fs.writeFileSync("work2/cues-split-main.json", JSON.stringify(split));
const d22 = D("s22") + L.s22.end - L.s22.start;
fs.writeFileSync("work2/cues-end-main.json", JSON.stringify({ tag: "A stop-loss on your MON that the bot can't break.", url: "tripwire-three.vercel.app", word: 1.0, tagAt: 1.6, urlAt: r((L.s22.end - L.s22.start) * 0.55 + 0.8), drift: 0.05, dur: r(D("s22") + 0.8) }));
fs.writeFileSync("work2/scenes-main.json", JSON.stringify([["s-chain-main", "chain.html", "work2/cues-chain-main.json", D("s14") + 0.8], ["s-split", "split2.html", "work2/cues-split-main.json", d20 + 1.0], ["s-end", "end.html", "work2/cues-end-main.json", D("s22") + 0.8]]));
console.log("beats", beats.length, "total", tm.duration);
