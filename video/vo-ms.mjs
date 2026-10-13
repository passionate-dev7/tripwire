// vo-ms.mjs SCRIPT.json OUTDIR : VoiceStudio profile b7af9f2a on the mini (tts-voice.py), one clip per line,
// silence-trimmed and loudnormed to -19 LUFS, laid on one timeline with each line's `gap`. Writes OUTDIR/narration.wav + timings.json.
// Only lines whose text changed since the last run are voiced again (tts-voice.py caches by text).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const [, , scriptFile, out] = process.argv;
const lines = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
const raw = path.join(out, "raw"), clips = path.join(out, "clips");
fs.mkdirSync(raw, { recursive: true }); fs.mkdirSync(clips, { recursive: true });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
fs.writeFileSync(path.join(out, "vo.json"), JSON.stringify({ voice_profile: "b7af9f2a", segments: lines.map((l) => ({ id: l.id, text: l.text })) }));
const only = process.env.ONLY ?? "";
const res = execFileSync("python3", [`${process.env.HOME}/Desktop/solana/cwf/tools/demo-film/bin/tts-voice.py`, path.join(out, "vo.json"), raw, "--profile", "b7af9f2a", "--host", "mini-ts", "--jobs", "2", ...(only ? ["--only", only] : [])], { encoding: "utf8", timeout: 1800000 });
console.log(res);
if (/FAIL/.test(res)) throw new Error("a line failed to voice");
let t = 0.3;
const tl = [], files = [];
const sil = (d, f) => { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(d), f]); return f; };
files.push(sil(0.3, path.join(out, "gap-lead.wav")));
for (const l of lines) {
  const f = path.join(clips, `${l.id}.wav`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(raw, `${l.id}.wav`), "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,loudnorm=I=-19:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", f]);
  const d = probe(f), gap = l.gap ?? 0.5;
  tl.push({ id: l.id, text: l.text, cap: l.cap ?? l.text, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
  files.push(f, sil(gap, path.join(out, `gap-${l.id}.wav`)));
  t += d + gap;
}
fs.writeFileSync(path.join(out, "list.txt"), files.map((f) => `file '${path.resolve(f)}'`).join("\n"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "list.txt"), "-c:a", "pcm_s16le", path.join(out, "narration.wav")]);
fs.writeFileSync(path.join(out, "timings.json"), JSON.stringify({ duration: +probe(path.join(out, "narration.wav")).toFixed(2), lines: tl }, null, 1));
console.log("DONE", probe(path.join(out, "narration.wav")).toFixed(1) + "s", tl.length, "lines");
