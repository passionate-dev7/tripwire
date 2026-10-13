// plan-demo.mjs : from the demo narration timings, write the A2 capture steps, the scene recording script, and the film plan.
import fs from "node:fs";
const tm = JSON.parse(fs.readFileSync("vo/out-demo/timings.json", "utf8"));
const L = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const ids = tm.lines.map((l) => l.id);
const bstart = (id) => (id === ids[0] ? 0 : L[id].start);
const bend = (id) => { const i = ids.indexOf(id); return i + 1 < ids.length ? L[ids[i + 1]].start : tm.duration; };
const dur = (id) => bend(id) - bstart(id);
const r = (x) => +x.toFixed(2);
const row = (n) => `document.querySelector('input[aria-label="Tranche ${n} line"]').closest('div.grid')`;
const L3 = 'input[aria-label="Tranche 3 line"]', F3 = 'input[aria-label="Tranche 3 floor"]';

// ---- A2: plan page, scheduled to the narration
const s = (id) => bstart(id), d = (id) => dur(id);
const A = [
 { waitFor: "/checked [0-9] s ago/.test(document.querySelector('[data-testid=heartbeat]')?.innerText||'')", timeout: 60000 },
 { eval: "document.querySelector('.num.h-16')?.innerText", as: "price" },
 { eval: "String(Number(${price}*0.97).toFixed(5))", as: "line" },
 { eval: "String(Number(${price}*0.93).toFixed(5))", as: "floor" },
 { rec: "A2" }, { mark: "start" },
 { at: r(s("d01") + 0.5), eval: "__call('.num.h-16','live 60 s average of the pool','right',10,'price')" },
 { at: r(s("d02") + 0.2), eval: `__uncall('price');__call(()=>${row(2)}.parentElement,'your plan: three lines','left',6,'plan')` },
 { at: r(s("d03") + 0.2), eval: `__uncall('plan');__call(()=>${row(1)},'stop: sells if MON falls to the line','left',6,'r1')` },
 { at: r(s("d03") + d("d03") * 0.36), eval: `__uncall('r1');__call(()=>${row(2)},'stop: sells if MON falls to the line','left',6,'r2')` },
 { at: r(s("d03") + d("d03") * 0.62), eval: `__uncall('r2');__call(()=>${row(3)},'target: sells if MON rises to the line','left',6,'t3')` },
 { at: r(s("d04") + 0.3), hoverSel: L3 }, { wait: 450 },
 { eval: `__set('${L3}','\${line}')` },
 { eval: `__uncall('t3');__call(()=>${row(3)},'target now just under today\\'s price','left',6,'t3b')` },
 { at: r(s("d04") + d("d04") * 0.62), hoverSel: F3 }, { wait: 450 },
 { eval: `__set('${F3}','\${floor}')` },
 { eval: `__uncall('t3b');__call('${F3}','floor: never sell below this','below',6,'fl')` },
 { mark: "floorset" },
 { at: r(s("d06") + 0.2), eval: "__clear()" },
 { rec: false },
];
fs.writeFileSync("work/runA2.json", JSON.stringify(A, null, 1));

// ---- scene cues
const sp0 = s("d18"), spEnd = bend("d20b");
const splitCues = { headline: "Two caveats on one signed delegation. Both run on Monad, on every sale.", keeper: "0x8a91..4468", ts: [r(s("d20") - sp0 + 0.2), 0.3, r(3.4), r(L.d18.end - sp0 - 1.8), r(s("d20") - sp0 + 3.4)], ck: r(L.d19.start - sp0 + 1.3), ckStep: 0.55, drift: 0.02, dur: r(spEnd - sp0) };
const chain1 = JSON.parse(fs.readFileSync("work/cues-chain.json", "utf8")); const RUN = JSON.parse(fs.readFileSync("work/run.json", "utf8"));
const chain2 = { ...JSON.parse(fs.readFileSync("work/cues-chain2.base.json", "utf8")), dur: r(dur("d21b")) };
const endCues = { tag: "Let a bot sell for you. The chain makes sure it only makes the sale you signed.", url: "tripwire-three.vercel.app", word: 1.2, tagAt: 2.0, urlAt: r(L.d23.start - bstart("d22") + 0.1), drift: 0, dur: r(dur("d22") + dur("d23")) };
fs.writeFileSync("work/cues-split.json", JSON.stringify(splitCues));
fs.writeFileSync("work/cues-chain2.json", JSON.stringify(chain2));
fs.writeFileSync("work/cues-end.json", JSON.stringify(endCues));
const sc = (name, html, cuesFile, secs) => `rec ${name} ${html} ${cuesFile} ${Math.round(secs * 1000)}`;
const scenes = [
 ["s-split", "split.html", "work/cues-split.json", spEnd - sp0 + 0.8],
 ["s-chain", "chain.html", "work/cues-chain.json", 6],
 ["s-chain2", "chain.html", "work/cues-chain2.json", dur("d21b") + 0.8],
 ["s-end", "end.html", "work/cues-end.json", dur("d22") + dur("d23") + 0.8],
];
fs.writeFileSync("work/scenes-demo.json", JSON.stringify(scenes));

// ---- film plan
const P = (src, ss, se, extra = {}) => ({ src: `work/${src}.mp4`, ss, se, ...extra });
const crop = "crop=1440:810:235:270";
const beats = [
 { lines: ["d01"], pieces: [P("A2", 0, r(bend("d01")), { vf: crop })] },
 { lines: ["d02"], pieces: [P("A2", r(bstart("d02")), r(bend("d02")), { vf: crop })] },
 { lines: ["d03"], pieces: [P("A2", r(bstart("d03")), r(bend("d03")), { vf: crop })] },
 { lines: ["d04"], pieces: [P("A2", r(bstart("d04")), r(bend("d04")), { vf: crop })] },
 { lines: ["d05"], pieces: [P("A2", r(bstart("d05")), r(bend("d05")), { vf: crop })] },
 { lines: ["d06"], pieces: [P("B", 0.3, 6.9, { fit: true })] },
 { lines: ["d07"], pieces: [P("B", 6.9, 15.6, { fit: true })] },
 { lines: ["d08"], pieces: [P("C", 0.8, 12.7, { fit: true })] },
 { lines: ["d09"], pieces: [P("C", 12.7, 15.7), P("C", 27.5, 34.0, { fit: true })] },
 { lines: ["d10"], pieces: [P("C", 34.0, 38.4, { fit: true })] },
 { lines: ["d11"], pieces: [P("X1", 0.8, 5.4), P("s-chain", 0.2, 5.6, { fit: true })] },
 { lines: ["d12"], pieces: [P("C", 38.5, 42.0, { fit: true })] },
 { lines: ["d12b"], pieces: [P("C", 40.0, 42.1, { fit: true })] },
 { lines: ["d13"], pieces: [P("F", 0, 3.3, { fit: true })] },
 { lines: ["d14"], pieces: [P("F", 3.3, 8.6, { fit: true })] },
 { lines: ["d15"], pieces: [P("F", 10.4, 15.2, { fit: true })] },
 { lines: ["d16"], pieces: [P("X3", 0.7, 6.0, { fit: true })] },
 { lines: ["d17"], pieces: [P("X2", 0.7, 5.2), P("X2b", 0.7, 5.0, { fit: true })] },
 { lines: ["d18", "d19", "d20", "d20b"], pieces: [P("s-split", 0, r(spEnd - sp0 + 0.6), { fit: true })] },
 { lines: ["d21"], pieces: [P("G", 3.4, 7.6, { fit: true })] },
 { lines: ["d21b"], pieces: [P("s-chain2", 0, r(dur("d21b") + 0.6), { fit: true })] },
 { lines: ["d22", "d23"], pieces: [P("s-end", 0, r(dur("d22") + dur("d23") + 0.6), { fit: true })] },
];
fs.writeFileSync("film-demo.json", JSON.stringify({ name: "demo", timings: "vo/out-demo/timings.json", audio: "vo/out-demo/narration.wav", out: "tripwire-demo.mp4", caps: "work/caps-demo", beats }, null, 1));
console.log("planned", beats.length, "beats; total", tm.duration, "split", r(sp0), r(spEnd));
