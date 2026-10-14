// mkfilm.mjs : narration timings + the take's marks -> mera/film.json (input of mkspec.mjs).
import fs from "node:fs";
const tm = JSON.parse(fs.readFileSync("mera/vo/out/timings.json", "utf8"));
const M = (c) => JSON.parse(fs.readFileSync(`mera/take/${c}/marks.json`, "utf8"));
const m = { H: M("H"), W: M("W"), K: M("K"), X1: M("X1"), X2: M("X2") };
const w = m.W.marks;
const P = (src, ss, se, extra = {}) => ({ src, ss, se, fit: true, ...extra });
const T = (c) => `mera/take/${c}.mp4`;
const beats = [
  { lines: ["m01", "m02"], pieces: [P("mera/h2/H.mp4", 0.1, JSON.parse(fs.readFileSync("mera/h2/H/marks.json", "utf8")).duration - 0.2)] },
  { lines: ["m03"], pieces: [P(T("W"), 0.0, 5.4)] },
  { lines: ["m04"], pieces: [P(T("W"), 5.4, 9.0)] },
  { lines: ["m05"], pieces: [P(T("W"), 9.0, w.firsttx)] },
  { lines: ["m06"], pieces: [P(T("W"), w.firsttx, w.armed - 0.4)] },
  { lines: ["m10"], pieces: [P(T("X1"), 0.5, m.X1.duration - 0.2, { zoom: { from: 1, to: 1.15, fx: 0.2, fy: 0.3 } })] },
  { lines: ["m07"], pieces: [{ src: "mera/card-code.png", png: true, fit: false }] },
  { lines: ["m08"], pieces: [P(T("K"), 0.4, m.K.duration - 0.2, { zoom: { from: 1, to: 1.5, fx: 0.95, fy: 0.0 } })] },
  { lines: ["m09"], pieces: [P(T("X2"), 0.5, m.X2.duration - 0.2, { zoom: { from: 1, to: 1.15, fx: 0.2, fy: 0.3 } })] },
  { lines: ["m11"], pieces: [{ src: "mera/card-end.png", png: true, fit: false }] },
];
fs.writeFileSync("mera/film.json", JSON.stringify({ name: "mera-bounty", timings: "mera/vo/out/timings.json", audio: "mera/vo/out/narration.wav", out: "mera-bounty.mp4", caps: "mera/caps", beats }, null, 1));
console.log("beats", beats.length);
