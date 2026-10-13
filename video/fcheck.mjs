// fcheck.mjs DIR... : report frame-duration stalls (> 1.2 s) per recorded clip.
import fs from "node:fs";
for (const d of process.argv.slice(2)) {
  const t = fs.readFileSync(`${d}/frames.txt`, "utf8").match(/duration ([\d.]+)/g).map((x) => +x.split(" ")[1]);
  const m = JSON.parse(fs.readFileSync(`${d}/marks.json`, "utf8"));
  let acc = 0; const bad = [];
  t.forEach((x) => { if (x > 1.2) bad.push([+acc.toFixed(1), +x.toFixed(2)]); acc += x; });
  console.log(d, "dur", m.duration, "frames", t.length, "max", Math.max(...t).toFixed(2), "stalls>1.2s:", JSON.stringify(bad));
}
