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
cue("proof", { title: `CHEATS THE BOT TRIED, READ ${readAt}`, t0: 0.1, footAt: 99, drift: 0.02, dur: r(D("q07")),
  blocks: [{ net: "Monad mainnet", note: "live", sent: main.forbiddenSent, refused: main.forbiddenReverted, paid: main.forbiddenPaidOut, at: -1.6 },
           { net: "Monad test network", note: "a practice copy", sent: test.forbiddenSent, refused: test.forbiddenReverted, paid: test.forbiddenPaidOut, at: -0.2 }] });
add("proof", "proof.html", D("q07"));
// q08 two real posts
const h8 = D("q08") / 2;
cue("xstop", src("xstop", "<b>x.com/fine_tec_</b>, another Monad holder, 2026-08-24", h8, crops.xstop.hl));
add("xstop", "source.html", h8);
cue("redask", src("redask", "<b>r/Monad</b>, another holder asks, read 2026-10-13", D("q08") - h8, [0.0, 0.15, 1.0, 0.22]));
add("redask", "source.html", D("q08") - h8);
// q02 the contrast, then the four rules read aloud
const aSec = 6.0, bSec = D("q02") - aSec; // whisper word times of the clip: "access." ends 5.6 s, "Here" starts 6.1 s
const RU = JSON.parse(fs.readFileSync("work2/rules-times.json", "utf8")); // seconds into the q02 clip where each rule is spoken
cue("other", { title: "OTHER STOP-LOSS BOTS", big: "Once you grant access, they can sell however they like.", t0: 0.15, r0: 99, step: 1, top: 330, bigPx: 64, drift: 0.02, dur: r(aSec), rows: [] });
add("other", "chain.html", aSec);
cue("rules", { title: "ON EVERY SALE, THE CHAIN CHECKS DAN'S SIGNED PLAN", big: "Four rules. Break any one and the sale fails.", t0: 0.1, r0: r(RU[0] - aSec - 0.05), step: r((RU[3] - RU[0]) / 3), top: 220, drift: 0.03, dur: r(bSec),
  rows: [["only at your line", "the bot sells once the price has reached it"], ["never under your floor", "the lowest price Dan set"], ["only to your address", "the money goes to Dan's wallet"], ["only until your end date", "the plan switches itself off"]] });
add("rules", "chain.html", bSec);
// q10 next
cue("next", { title: "NEXT", big: "Any bot can carry out Dan's plan. The chain still refuses every sale he did not sign.", t0: 0.15, r0: 1.0, step: 3.5, top: 230, bigPx: 52, drift: 0.03, dur: r(D("q10")),
  rows: [["any bot", "can carry out Dan's plan"], ["every sale", "still checked against his four rules"], ["holders who asked", "tripwire goes to them next"]] });
add("next", "chain.html", D("q10"));
// q11 end
cue("end", { tag: "A bot sells for you. The blockchain blocks any sale you didn't sign.", url: "tripwire-three.vercel.app", note: "live on Monad mainnet, open it with ?net=mainnet", word: 0.8, tagAt: 1.2, urlAt: 2.0, drift: 0.05, dur: r(D("q11")) });
add("end", "end.html", D("q11"));
fs.writeFileSync("work2/scenes-pitch2.json", JSON.stringify(scenes));

const P = (src, ss, se, extra = {}) => ({ src, ss: r(ss), se: r(se), ...extra });
const W = (c) => `work2/mainnet/${c}.mp4`, S = (n) => `work2/pp-${n}.mp4`;
const Z = (from, to, fx, fy, ease) => ({ zoom: { from, to, fx, fy, ease } });
const CO = (name, a, b) => ({ png: `work2/co/${name}.png`, a: r(a), b: r(b) });
const PAD = "scale=1728:972,pad=1920:1080:96:0:color=0x07080a"; // keeps the page's bottom edge clear of the caption; mkcallouts.py maps pad:true callouts through the same transform
// the C clip's page, panned up 140 px so the caption sits on the dark strip and every refusal stays readable
const PAN = "crop=1920:940:0:140,pad=1920:1080:0:0:color=0x07080a";
// K ends with the sale row highlighted: the keeper's counter reads 1 sale from 14.2 s. The beat starts there, never on the 0-sales frames.
const hold5 = 7.0, x1len = D("q05") - 0.6 - hold5;
const fixed6 = (C.refused1 - 0.2 - C.try1) / 8 + 0.7 + (C.refused2 - 0.2 - C.try2) / 8 + 0.7 + (C.refused3 - 0.2 - C.try3) / 8;
const hold6 = 4.4, x2len = D("q06") - fixed6 - hold6; // final list shown for hold6 s at speed 0.75 (the C clip has 3.3 s left after the third refusal)
const beats = [
  { lines: ["q01"], pieces: [P("work2/H-old.mp4", 0, 8.6, { fit: true, vf: PAD, ...Z(1, 1.12, 0.4, 0.3, "linear"), ov: [CO("mainnet_q01", 0.8, 5.0), CO("testnet_q01", 5.4, D("q01") - 0.3)] })] },
  { lines: ["q02"], pieces: [P(S("other"), 0.15, aSec + 0.15), P(S("rules"), 0.15, bSec + 0.15)] },
  { lines: ["q03"], pieces: [P(W("P"), 14.5, 25.5, { fit: true, ...Z(1, 1.25, 0.85, 0.3), ov: [CO("plan_q03", 0.1, 4.2)] })] },
  { lines: ["q04"], pieces: [P(W("W"), 0.3, 5.0, Z(1, 1.1, 0.85, 0.5)), P(W("S"), 0.2, 7.0, { fit: true, ...Z(1, 1.5, 0.92, 0.12), ov: [CO("wmon_s", 3.2, 6.0)] })] },
  { lines: ["q05"], pieces: [
    P(W("K"), 14.2, 14.8),
    { src: "work2/k-hold.png", png: true, hold: r(hold5), ...Z(1, 1.08, 0.5, 0.3, "linear"), ov: [CO("plan_q05", 0.15, 2.8), CO("mined_q05", 3.0, hold5 - 0.1)] },
    P(W("X1"), 1.0, 4.4, { fit: true, vf: PAD, ...Z(1, 1.05, 0.5, 0.4, "linear"), ov: [CO("wmon_x1", 0.6, x1len - 0.2), CO("num_x1", 1.4, x1len - 0.2), CO("mm_x1", 2.4, x1len - 0.2)] })] },
  { lines: ["q06"], pieces: [
    P(W("C"), C.try1, C.refused1 - 0.2, { speed: 8, vf: PAN }), P(W("C"), C.refused1 - 0.2, C.refused1 + 0.5, { vf: PAN }),
    P(W("C"), C.try2, C.refused2 - 0.2, { speed: 8, vf: PAN }), P(W("C"), C.refused2 - 0.2, C.refused2 + 0.5, { vf: PAN }),
    P("work2/X2-fix.mp4", 0.8, 3.0, { fit: true, vf: PAD, ...Z(1, 1.05, 0.5, 0.45, "linear"), ov: [CO("fail_x2", 0.2, x2len - 0.1)] }),
    P(W("C"), C.try3, C.refused3 - 0.2, { speed: 8, vf: PAN }),
    P(W("C"), C.refused3 - 0.2, Math.min(34.7, C.refused3 - 0.2 + hold6 * 0.75), { speed: 0.75, vf: PAN, ...Z(1, 1.04, 0.9, 0.2, "linear"), ov: [CO("refused_c", 0.3, hold6 - 0.1), CO("tally_c", 1.0, hold6 - 0.1)] })] },
  { lines: ["q07"], pieces: [P(S("proof"), 0.15, D("q07") + 0.15)] },
  { lines: ["q08"], pieces: [P(S("xstop"), 0.15, h8 + 0.15, { ov: [CO("dex_x", 0.6, h8 - 0.15)] }),
    P(S("redask"), 0.15, D("q08") - h8 + 0.15, { ov: [CO("dex_r", 0.6, D("q08") - h8 - 0.15), CO("noncex_r", 1.8, D("q08") - h8 - 0.15)] })] },
  { lines: ["q10"], pieces: [P(S("next"), 0.15, D("q10") + 0.15)] },
  { lines: ["q11"], pieces: [P(S("end"), 0.15, D("q11") + 0.15)] },
];
fs.writeFileSync("film-pitch2.json", JSON.stringify({ name: "tripwire-pitch", timings: "vo/pitch2/out/timings.json", audio: "vo/pitch2/out/narration.wav", out: "tripwire-pitch.mp4", caps: "work2/caps-pitch2", capFade: 0, beats }, null, 1));
console.log("planned", beats.length, "beats", tm.duration, "s; totals main", JSON.stringify(main), "test", JSON.stringify(test), readAt);
