// plan-pitch2.mjs : the 2026-10-13 pitch (Dan, mainnet footage). Narration timings + the demo run's clip marks ->
// film-pitch2.json (mkspec input) and the scene cue files. Reads the keeper totals live and refuses to plan if the voiced
// numbers (3 of 3 on mainnet, 61 of 61 on testnet) no longer match them.
import fs from "node:fs";
const tm = JSON.parse(fs.readFileSync("vo/pitch2/out/timings.json", "utf8"));
const L = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const ids = tm.lines.map((l) => l.id);
const nx = (id) => { const i = ids.indexOf(id); return i + 1 < ids.length ? L[ids[i + 1]].start : tm.duration; };
const st = (id) => (id === ids[0] ? 0 : L[id].start);
const D = (id) => nx(id) - st(id);
const r = (x) => +x.toFixed(2);
const get = async (u) => (await (await fetch(u)).json()).totals;
const main = await get("https://tripwire-three.vercel.app/api/mainnet/recent"), test = await get("https://tripwire-three.vercel.app/api/recent");
const readAt = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
if (main.forbiddenSent !== 3 || main.forbiddenReverted !== 3 || main.forbiddenPaidOut !== 0) throw new Error("mainnet totals moved: " + JSON.stringify(main));
if (test.forbiddenSent !== 61 || test.forbiddenReverted !== 61 || test.forbiddenPaidOut !== 0) throw new Error("testnet totals moved, revoice q07: " + JSON.stringify(test));
const M = (c) => JSON.parse(fs.readFileSync(`work2/mainnet/${c}/marks.json`, "utf8")).marks;
const C = M("C");
const crops = JSON.parse(fs.readFileSync("work/src/crops.json", "utf8"));
crops.redask = { aspect: 1255 / 557 }; // work/src/c-redask.png: the r/Monad post 1vxe6ha, title and bullets, cropped from a 2x capture of the pinned tab
const cue = (name, o) => fs.writeFileSync(`work2/cues-pp-${name}.json`, JSON.stringify(o));
const scenes = [];
const add = (name, html, secs) => scenes.push([`pp-${name}`, html, `work2/cues-pp-${name}.json`, r(secs + 0.8)]);
const src = (key, label, secs, hl, hlAt = 0.5) => ({ img: `../work/src/c-${key}.png`, aspect: crops[key].aspect, hl, zoom: 1.0, src: label, t0: 0.1, hlAt, dur: r(secs) });

// q07 proof card
cue("proof", { title: `CHEATING SALES THE BOT TRIED, FROM THE KEEPER'S INDEX, READ ${readAt}`, t0: 0.1, footAt: 99, drift: 0.02, dur: r(D("q07")),
  blocks: [{ net: "Monad mainnet", note: "live", sent: main.forbiddenSent, refused: main.forbiddenReverted, paid: main.forbiddenPaidOut, at: 0.3 },
           { net: "Monad test network", note: "a practice copy", sent: test.forbiddenSent, refused: test.forbiddenReverted, paid: test.forbiddenPaidOut, at: 3.4 }] });
add("proof", "proof.html", D("q07"));
// q08 two real posts
const h8 = D("q08") / 2;
cue("xstop", src("xstop", "<b>x.com/fine_tec_</b>, another Monad holder, 2026-08-24", h8, crops.xstop.hl));
add("xstop", "source.html", h8);
cue("redask", src("redask", "<b>r/Monad</b>, another holder asks, read 2026-10-13", D("q08") - h8, [0.0, 0.15, 1.0, 0.22]));
add("redask", "source.html", D("q08") - h8);
// q09 the contrast, then the rules
const aSec = 6.0, bSec = D("q09") - aSec; // whisper word times of the q09 clip: "access." ends 5.62 s, "Here" starts 6.06 s
cue("other", { title: "OTHER STOP-LOSS BOTS", big: "Once you grant access, they can sell however they like.", t0: 0.15, r0: 99, step: 1, top: 330, bigPx: 64, drift: 0.02, dur: r(aSec), rows: [] });
add("other", "chain.html", aSec);
cue("rules", { title: "ON EVERY SALE, THE CHAIN CHECKS DAN'S SIGNED PLAN", big: "Four rules. Break any one and the sale fails.", t0: 0.1, r0: 0.2, step: 0.3, top: 220, drift: 0.03, dur: r(bSec),
  rows: [["only at your line", "the bot sells once the price has reached it"], ["never under your floor", "the lowest price Dan set"], ["only to your address", "the money goes to Dan's wallet"], ["only until your end date", "the plan switches itself off"]] });
add("rules", "chain.html", bSec);
// q10 next
cue("next", { title: "NEXT", big: "Any bot can carry out a signed plan.", t0: 0.15, r0: 0.8, step: 1.3, top: 260, drift: 0.03, dur: r(D("q10")),
  rows: [["every bot", "can carry out a plan once its line is crossed"], ["same checks", "the chain still checks every sale"], ["holders who asked", "tripwire goes to them"]] });
add("next", "chain.html", D("q10"));
// q11 end
cue("end", { tag: "A bot sells for you. The blockchain blocks any sale you didn't sign.", url: "tripwire-three.vercel.app/?net=mainnet", word: 1.0, tagAt: 1.6, urlAt: r(Math.min(3.4, D("q11") * 0.5)), drift: 0.05, dur: r(D("q11")) });
add("end", "end.html", D("q11"));
fs.writeFileSync("work2/scenes-pitch2.json", JSON.stringify(scenes));

const P = (src, ss, se, extra = {}) => ({ src, ss: r(ss), se: r(se), ...extra });
const W = (c) => `work2/mainnet/${c}.mp4`, S = (n) => `work2/pp-${n}.mp4`;
const Z = (from, to, fx, fy) => ({ zoom: { from, to, fx, fy } });
const beats = [
  { lines: ["q01"], pieces: [P("work2/H-old.mp4", 0, 8.6, { fit: true, vf: "scale=1728:972,pad=1920:1080:96:0:color=0x07080a" })] },
  { lines: ["q02"], pieces: [P("work2/H-old.mp4", 8.6, 15.6, { vf: "scale=1728:972,pad=1920:1080:96:0:color=0x07080a" }), P("work2/H-old.mp4", 20.9, 26.8, { fit: true, vf: "scale=1728:972,pad=1920:1080:96:0:color=0x07080a" })] },
  { lines: ["q03"], pieces: [P(W("P"), 14.5, 25.5, { fit: true, ...Z(1, 1.25, 0.85, 0.3) })] },
  { lines: ["q04"], pieces: [P(W("W"), 0.3, 5.0, Z(1, 1.1, 0.85, 0.5)), P(W("S"), 0.2, 7.0, { fit: true, ...Z(1, 1.5, 0.92, 0.12) })] },
  { lines: ["q05"], pieces: [P(W("K"), 7.6, 14.9, Z(1, 1.2, 0.88, 0.3)), P(W("X1"), 1.5, 5.0, { fit: true, vf: "scale=1728:972,pad=1920:1080:96:0:color=0x07080a" })] },
  { lines: ["q06"], pieces: [
    P(W("C"), 8.3, C.try1, { speed: 1.2 }),
    P(W("C"), C.try1, C.refused1 - 0.2, { speed: 4 }), P(W("C"), C.refused1 - 0.2, C.refused1 + 0.8),
    P(W("C"), C.try2, C.refused2 - 0.2, { speed: 4 }), P(W("C"), C.refused2 - 0.2, C.refused2 + 0.8),
    P(W("C"), C.try3, C.refused3 - 0.2, { speed: 4 }), P(W("C"), C.refused3 - 0.2, C.refused3 + 1.0),
    P(W("X2"), 0.8, 3.0, { fit: true })] },
  { lines: ["q07"], pieces: [P(S("proof"), 0.15, D("q07") + 0.15)] },
  { lines: ["q08"], pieces: [P(S("xstop"), 0.15, h8 + 0.15), P(S("redask"), 0.15, D("q08") - h8 + 0.15)] },
  { lines: ["q09"], pieces: [P(S("other"), 0.15, aSec + 0.15), P(S("rules"), 0.15, bSec + 0.15)] },
  { lines: ["q10"], pieces: [P(S("next"), 0.15, D("q10") + 0.15)] },
  { lines: ["q11"], pieces: [P(S("end"), 0.15, D("q11") + 0.15)] },
];
fs.writeFileSync("film-pitch2.json", JSON.stringify({ name: "tripwire-pitch", timings: "vo/pitch2/out/timings.json", audio: "vo/pitch2/out/narration.wav", out: "tripwire-pitch.mp4", caps: "work2/caps-pitch2", beats }, null, 1));
console.log("planned", beats.length, "beats", tm.duration, "s; totals main", JSON.stringify(main), "test", JSON.stringify(test), readAt);
