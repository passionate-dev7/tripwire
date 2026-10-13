// vo.mjs SCRIPT.json OUTDIR : one clip per line through `voiceb say` (verified against its own transcript),
// loudnorm to -19 LUFS, trimmed, then laid on one timeline with the line's `gap` seconds after it.
// Writes OUTDIR/clips/<id>.wav, OUTDIR/narration.wav and OUTDIR/timings.json.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
const [, , scriptFile, out] = process.argv;
const lines = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
const clips = path.join(out, "clips");
fs.mkdirSync(clips, { recursive: true });
const VOICE = process.env.VOICE ?? "a53f0225";
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
const sh = (cmd, args) => new Promise((res) => { let o = ""; const p = spawn(cmd, args); const to = setTimeout(() => p.kill("SIGKILL"), 200000); p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d)); p.on("close", (c) => { clearTimeout(to); res({ code: c, out: o }); }); });

const RULES = [[/\bmonad\b/i, /\bmonad\b/i], [/trip wire/i, /trip ?wire/i], [/\bmon\b/i, /\bmon\b/i], [/passkey/i, /pass ?key/i], [/metamask/i, /meta ?mask/i], [/\bkeeper/i, /keeper/i]];
const passes = (text, heard) => RULES.every(([want, got]) => !want.test(text) || got.test(heard));
async function gen(l) {
  const raw = path.join(clips, `${l.id}.raw.wav`), fin = path.join(clips, `${l.id}.wav`), meta = path.join(clips, `${l.id}.json`);
  if (fs.existsSync(fin) && fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, "utf8")).text === l.text && JSON.parse(fs.readFileSync(meta, "utf8")).voice === VOICE && passes(l.text, JSON.parse(fs.readFileSync(meta, "utf8")).heard) && !(only && only.has(l.id))) return console.log("cached", l.id);
  for (let a = 1; a <= 30; a++) {
    const r = await sh("voiceb", ["say", l.text, "-o", raw, "-v", VOICE]);
    const heard = (r.out.match(/heard: (.*)/) || [])[1] ?? "";
    if (r.code === 0 && passes(l.text, heard)) {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,loudnorm=I=-19:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", fin]);
      fs.writeFileSync(meta, JSON.stringify({ text: l.text, heard, tries: a, voice: VOICE }));
      return console.log("ok", l.id, a, "|", heard);
    }
    console.log("RETRY", l.id, a, "|", heard); await new Promise((r) => setTimeout(r, heard === "" ? 6000 : 2000));
  }
  throw new Error("voice failed: " + l.id + " " + l.text);
}
const queue = lines.slice();
await Promise.all([0].map(async () => { while (queue.length) await gen(queue.shift()); }));

let t = 0.3;
const parts = [`anullsrc=r=48000:cl=mono`];
const tl = [], files = [];
const sil = (d, f) => { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(d), f]); return f; };
files.push(sil(0.3, path.join(out, "gap-lead.wav")));
for (const l of lines) {
  const f = path.join(clips, `${l.id}.wav`), d = probe(f), gap = l.gap ?? 0.4;
  tl.push({ id: l.id, text: l.text, cap: l.cap ?? l.text, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
  files.push(f);
  files.push(sil(gap, path.join(out, `gap-${l.id}.wav`)));
  t += d + gap;
}
fs.writeFileSync(path.join(out, "list.txt"), files.map((f) => `file '${path.resolve(f)}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "list.txt"), "-c:a", "pcm_s16le", path.join(out, "narration.wav")]);
fs.writeFileSync(path.join(out, "timings.json"), JSON.stringify({ duration: +probe(path.join(out, "narration.wav")).toFixed(2), lines: tl }, null, 1));
console.log("DONE", probe(path.join(out, "narration.wav")).toFixed(1) + "s", tl.length, "lines");
