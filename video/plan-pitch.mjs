// plan-pitch.mjs : from the pitch narration timings, write scene cues, the scene recording list and the film plan.
import fs from "node:fs";
const tm = JSON.parse(fs.readFileSync("vo/out-pitch/timings.json", "utf8"));
const L = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const ids = tm.lines.map((l) => l.id);
const bstart = (id) => (id === ids[0] ? 0 : L[id].start);
const bend = (id) => { const i = ids.indexOf(id); return i + 1 < ids.length ? L[ids[i + 1]].start : tm.duration; };
const dur = (id) => bend(id) - bstart(id);
const span = (a, b) => bend(b) - bstart(a);
const r = (x) => +x.toFixed(2);
const RUN = JSON.parse(fs.readFileSync("work/run.json", "utf8"));
const sh = (h) => h.slice(0, 6) + ".." + h.slice(-4);
const T = RUN.tranches, f5 = (n) => Number(n).toFixed(5), f6 = (n) => Number(n).toFixed(6), pr = Number(RUN.price).toFixed(5), sale = RUN.saleIndex;
const crops = JSON.parse(fs.readFileSync("work/src/crops.json", "utf8"));
const cue = (name, f) => fs.writeFileSync(`work/cues-${name}.json`, JSON.stringify(f));
const src = (img, key, label, secs, hl = crops[key].hl, zoom = 1.0, hlAt = 0.7) => ({ img: `../work/src/c-${key}.png`, aspect: crops[key].aspect, hl, zoom, src: label, t0: 0.1, hlAt, dur: secs });
const scenes = [];
const add = (name, html, secs) => scenes.push([`p-${name}`, html, `work/cues-p-${name}.json`, r(secs + 0.8)]);

cue("p-reddit1", src("", "reddit", "<b>r/Monad</b>, a comment on the November strategies thread, read 2026-10-13", span("p01", "p02")));
add("reddit1", "source.html", span("p01", "p02"));
cue("p-unlock", src("", "unlock", "<b>cryptoticker.io</b>, \"Monad Unlock on November 24\", read 2026-10-13", dur("p03")));
add("unlock", "source.html", dur("p03"));
cue("p-reddit2", src("", "reddit", "<b>r/Monad</b>, the same thread: 19 comments, read 2026-10-13", dur("p03b"), crops.reddit.hl2, 1.7, 0.5));
add("reddit2", "source.html", dur("p03b"));
cue("p-xdrain", src("", "xdrain", "<b>x.com/CairoGringo</b>, 2026-09-27", span("p04", "p05")));
add("xdrain", "source.html", span("p04", "p05"));
cue("p-xstop", src("", "xstop", "<b>x.com/fine_tec_</b>, 2026-08-24", dur("p06")));
add("xstop", "source.html", dur("p06"));
cue("p-xjudge", src("", "xjudge", "<b>x.com/francescoswiss</b>, Head of Developer Relations at MetaMask", dur("p20"), crops.xjudge.hl2, 1.0, 1.2));
add("xjudge", "source.html", dur("p20"));
cue("p-limit", { headline: "A limit caps the amount. It does not check the price or the recipient.", a: 1.6, b: r(1.6 + Math.max(1.2, dur("p07") / 2 - 0.4)), res: "sold, paid to the keeper", resAt: r(dur("p07") - 1.6), drift: 0.02, dur: r(dur("p07")) });
add("limit", "limit.html", dur("p07"));
const w0 = bstart("p10"), a1 = bstart("p11") - w0 + 0.1;
cue("p-wire", { t0: 0.2, keeper: "0x8a91..4468", headline: "A hacked keeper can send anything. The contract only lets the signed sale through.",
 ok: { at: 2.0, what: `sale ${sale + 1}: ${T[sale].mon} WMON for ${(Number(RUN.ausdIn) / 1e6)} aUSD, to the holder`, tx: sh(RUN.fillTx), rows: [["sell", `${T[sale].mon} MON`], ["price", `${pr} ≥ line ${f5(T[sale].line)}`], ["floor", `${f6(T[sale].floorPerMon * T[sale].mon)} aUSD`], ["pays", "the holder"]], land: `${T[sale].mon} MON in, ${(Number(RUN.ausdIn) / 1e6)} aUSD out<br>at the holder's address` },
 attempts: [
  { at: r(a1), reason: "Tripwire:above-line", what: "sell before the price reaches the line", tx: sh(RUN.cheat1), rows: [["sell", `${T[0].mon} MON`], ["price", `${pr} > stop ${f5(T[0].line)}`, 1], ["floor", `${f6(T[0].floorPerMon * T[0].mon)} aUSD`], ["pays", "the holder"]] },
  { at: r(a1 + 2.4), reason: "Tripwire:recipient", what: "pay the proceeds to the keeper", tx: sh(RUN.cheat2), rows: [["sell", `${T[sale].mon} MON`], ["price", `${pr} ≥ line ${f5(T[sale].line)}`], ["floor", `${f6(T[sale].floorPerMon * T[sale].mon)} aUSD`], ["pays", "the keeper", 1]] }],
 drift: 0.02, dur: r(span("p10", "p11")) });
add("wire", "wire.html", span("p10", "p11"));
cue("p-tests", { pass: 0.9, del: r(dur("p14") * 0.4), res: r(dur("p14") * 0.74), drift: 0.02, dur: r(dur("p14")) });
add("tests", "tests.html", dur("p14"));
cue("p-end", { tag: "Let a bot sell for you. The chain makes sure it only makes the sale you signed.", url: "tripwire-three.vercel.app", word: 0.9, tagAt: 1.6, urlAt: 2.4, drift: 0, dur: r(dur("p21")) });
add("end", "end.html", dur("p21"));
fs.writeFileSync("work/scenes-pitch.json", JSON.stringify(scenes));

const P = (srcn, ss, se, extra = {}) => ({ src: `work/${srcn}.mp4`, ss, se, ...extra });
const crop = "crop=1440:810:235:270";
const sec = (name, secs) => P(`p-${name}`, 0.15, r(secs + 0.15));
const beats = [
 { lines: ["p01", "p02"], pieces: [sec("reddit1", span("p01", "p02"))] },
 { lines: ["p03"], pieces: [sec("unlock", dur("p03"))] },
 { lines: ["p03b"], pieces: [sec("reddit2", dur("p03b"))] },
 { lines: ["p04", "p05"], pieces: [sec("xdrain", span("p04", "p05"))] },
 { lines: ["p06"], pieces: [sec("xstop", dur("p06"))] },
 { lines: ["p07"], pieces: [sec("limit", dur("p07"))] },
 { lines: ["p08"], pieces: [P("A2", 0.3, 5.3, { fit: true, vf: crop })] },
 { lines: ["p09"], pieces: [P("B", 0.3, 7.0, { fit: true })] },
 { lines: ["p10", "p11"], pieces: [sec("wire", span("p10", "p11"))] },
 { lines: ["p12"], pieces: [P("P", 0.9, 9.4, { fit: true })] },
 { lines: ["p13"], pieces: [P("X2", 0.7, 5.6, { fit: true })] },
 { lines: ["p14"], pieces: [sec("tests", dur("p14"))] },
 { lines: ["p15"], pieces: [P("Xg", 0.9, 7.3, { fit: true })] },
 { lines: ["p16"], pieces: [P("Xr", 0.9, 6.2, { fit: true })] },
 { lines: ["p17"], pieces: [P("s-split", 0.3, 9.5, { fit: true })] },
 { lines: ["p19"], pieces: [P("s-split", 12.0, 20.0, { fit: true })] },
 { lines: ["p20"], pieces: [sec("xjudge", dur("p20"))] },
 { lines: ["p21"], pieces: [sec("end", dur("p21"))] },
];
fs.writeFileSync("film-pitch.json", JSON.stringify({ name: "pitch", timings: "vo/out-pitch/timings.json", audio: "vo/out-pitch/narration.wav", out: "tripwire-pitch.mp4", caps: "work/caps-pitch", beats }, null, 1));
console.log("pitch planned", beats.length, tm.duration);
