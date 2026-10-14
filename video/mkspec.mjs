// mkspec.mjs FILM.json : narration timings + a beat plan -> assemble.mjs spec.
// FILM = { name, timings, audio, out, caps, beats:[{ lines:[ids], pieces:[{src,ss,se,speed?,fit?,zoom?,vf?,png?,hold?}] }] }
// Beat t0 = start of its first line (0 for the first beat); t1 = t0 of the next beat (narration end for the last).
// A piece with fit:true gets the speed that makes the beat exactly as long as its narration.
import fs from "node:fs";
const film = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tm = JSON.parse(fs.readFileSync(film.timings, "utf8"));
const at = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const beats = film.beats.map((b, i) => ({ ...b, t0: i === 0 ? 0 : at[b.lines[0]].start }));
const spec = { capFade: film.capFade, out: film.out, audio: film.audio, work: "asm-" + film.name, beats: [], tail: 0 };
const caps = [];
beats.forEach((b, i) => {
  const t1 = i + 1 < beats.length ? beats[i + 1].t0 : tm.duration;
  const D = t1 - b.t0;
  const fixed = b.pieces.filter((p) => !p.fit).reduce((s, p) => s + (p.png ? (p.hold ?? D) : (p.se - (p.ss ?? 0)) / (p.speed ?? 1)), 0);
  const pieces = b.pieces.map((p) => {
    const q = { ...p }; delete q.fit;
    if (p.fit) q.speed = Math.min(4, Math.max(0.4, (p.se - (p.ss ?? 0)) / Math.max(0.5, D - fixed)));
    return q;
  });
  spec.beats.push({ name: b.lines.join("+"), t0: +b.t0.toFixed(3), t1: +t1.toFixed(3), pieces, caps: [] });
  for (const id of b.lines) caps.push({ id, a: +Math.max(0.05, at[id].start - 0.05).toFixed(2), b: +(at[id].end + 0.15).toFixed(2) });
});
const first = (a) => a;
for (const c of caps) {
  const beat = spec.beats.find((b) => b.name.split("+").includes(c.id)) ?? spec.beats.at(-1);
  beat.caps.push({ png: `${film.caps}/${c.id}.png`, a: c.a, b: c.b });
}
fs.writeFileSync(film.name + ".spec.json", JSON.stringify(spec, null, 1));
console.log(film.name, "beats", spec.beats.length, "total", tm.duration, "speeds:", spec.beats.map((b) => b.pieces.map((p) => (p.speed ?? 1).toFixed(2)).join("/")).join(" "));
