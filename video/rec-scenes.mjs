// rec-scenes.mjs SCENES.json : record each [name, html, cuesFile, seconds] scene in the pinned tab (time-driven scene, real-time capture).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const scenes = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const here = new URL("./", import.meta.url).pathname;
for (const [name, html, cuesFile, secs] of scenes) {
  const cues = fs.readFileSync(here + cuesFile, "utf8");
  const steps = [{ eval: "location.reload()" }, { wait: 1800 }, { metrics: true }, { waitFor: "window.__ready===true", timeout: 20000 }, { wait: 300 }, { rec: name }, { eval: "window.__go()" }, { wait: Math.round(secs * 1000) }, { rec: false }];
  fs.writeFileSync(`${here}work/steps-${name}.json`, JSON.stringify(steps));
  for (let a = 0; a < 4; a++) {
    let out = "";
    try { out = execFileSync("node", [here + "rec.mjs", `file://${here}scenes/${html}#${encodeURIComponent(cues)}`, `${here}work/steps-${name}.json`, here + "work"], { env: { ...process.env, NOCURSOR: "1", LOAD_MS: "1800", HELPER: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { out = String(e.stderr || e.message); }
    const ok = !/fps captured/.test(out) && fs.existsSync(`${here}work/${name}.mp4`);
    console.log(name, ok ? "ok" : "retry " + a, (out.match(/CLIP [^\n]*/) || [""])[0]);
    if (ok) break;
  }
}
