// assemble.mjs SPEC.json : cut recorded clips onto a narration timeline.
// spec = { out, audio, size:[1920,1080], fps:30, beats:[{ name, t0, t1, pieces:[{src, ss, se, speed?, hold?}], caps:[{png, a, b}] }], tail }
// A beat spans [t0, t1) of the narration timeline. Its pieces play in order at their own speed; the beat is then
// padded with the last frame (clone) or trimmed to exactly t1 - t0, and the overshoot is reported.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const [W, H] = spec.size ?? [1920, 1080];
const FPS = spec.fps ?? 30;
const work = path.resolve(path.dirname(process.argv[2]), spec.work ?? "asm-" + path.basename(spec.out, ".mp4"));
fs.mkdirSync(work, { recursive: true });
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
const norm = `scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`;
const enc = ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-an"];
const warns = [];
const CF = Math.max(spec.capFade ?? 0.25, 0.034); // one frame = hard cut (fade d=0 would fall back to ffmpeg default 1 s)


const beatFiles = [];
spec.beats.forEach((b, bi) => {
  const want = b.t1 - b.t0;
  const pieceFiles = [];
  b.pieces.forEach((p, pi) => {
    const f = path.join(work, `b${bi}-p${pi}.mp4`);
    const speed = p.speed ?? 1;
    const src = path.resolve(path.dirname(process.argv[2]), p.src);
    const inArgs = p.png ? ["-loop", "1", "-t", String(p.hold ?? want), "-i", src] : ["-ss", String(p.ss ?? 0), ...(p.se ? ["-to", String(p.se)] : []), "-i", src];
    const dur = p.png ? (p.hold ?? want) : ((p.se - (p.ss ?? 0)) / speed);
    let zoom = "null";
    if (p.zoom) {
      const n = Math.max(2, Math.round(dur * FPS)), z0 = p.zoom.from ?? 1, z1 = p.zoom.to ?? 1.1;
      const prog = p.zoom.ease === "linear" ? `on/${n}` : `(1-pow(1-min(on/${n},1),3))`;
      zoom = `scale=${W * 2}:${H * 2}:flags=bicubic,zoompan=z='${z0}+(${z1}-${z0})*${prog}':x='(iw-iw/zoom)*${p.zoom.fx ?? 0.5}':y='(ih-ih/zoom)*${p.zoom.fy ?? 0.5}':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p`;
    }
    const ovs = (p.ov ?? []).map((o) => ({ ...o, png: path.resolve(path.dirname(process.argv[2]), o.png) }));
    const ovIn = ovs.flatMap((o) => ["-loop", "1", "-t", String(dur + 1), "-i", o.png]);
    let fc = `[0:v]setpts=(PTS-STARTPTS)/${speed},${p.vf ? p.vf + "," : ""}${norm}[b0];`, prev = "b0";
    ovs.forEach((o, i) => {
      const fd = o.fade ?? 0.2;
      fc += `[${i + 1}:v]format=rgba,fade=t=in:st=${o.a}:d=${fd}:alpha=1,fade=t=out:st=${Math.max(o.a, o.b - fd)}:d=${fd}:alpha=1[o${i}];[${prev}][o${i}]overlay=0:0:format=auto:enable='between(t,${o.a},${o.b})'[b${i + 1}];`;
      prev = `b${i + 1}`;
    });
    fc += `[${prev}]${zoom}[out]`;
    run([...inArgs, ...ovIn, "-filter_complex", fc, "-map", "[out]", "-t", dur.toFixed(3), ...enc, f]);
    pieceFiles.push(f);
  });
  const list = path.join(work, `b${bi}.txt`);
  fs.writeFileSync(list, pieceFiles.map((f) => `file '${f}'`).join("\n"));
  const raw = path.join(work, `b${bi}-raw.mp4`);
  run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", raw]);
  const have = probe(raw);
  const out = path.join(work, `b${bi}.mp4`);
  if (have > want + 0.05) warns.push(`${b.name}: pieces run ${have.toFixed(2)}s but the beat is ${want.toFixed(2)}s (trimmed ${(have - want).toFixed(2)}s)`);
  if (have < want - 0.05) warns.push(`${b.name}: pieces run ${have.toFixed(2)}s, beat is ${want.toFixed(2)}s: last frame held ${(want - have).toFixed(2)}s`);
  run(["-i", raw, "-vf", `tpad=stop_mode=clone:stop_duration=${Math.max(0, want - have + 0.1).toFixed(3)},trim=duration=${want.toFixed(3)},setpts=PTS-STARTPTS`, ...enc, out]);
  let outFinal = out;
  const bc = (b.caps ?? []).map((c) => ({ ...c, png: path.resolve(path.dirname(process.argv[2]), c.png), a: Math.max(0, c.a - b.t0), b: Math.min(want, c.b - b.t0) })).filter((c) => c.b > c.a);
  if (bc.length) {
    const args = ["-i", out];
    bc.forEach((c) => args.push("-loop", "1", "-t", String(want), "-i", c.png));
    let chain = "", prev = "0:v";
    bc.forEach((c, i) => {
      chain += `[${i + 1}:v]format=rgba,fade=t=in:st=${c.a}:d=${CF}:alpha=1,fade=t=out:st=${Math.max(c.a, c.b - CF)}:d=${CF}:alpha=1[c${i}];[${prev}][c${i}]overlay=0:0:format=auto:enable='between(t,${c.a},${c.b})'[v${i}];`;
      prev = `v${i}`;
    });
    outFinal = path.join(work, `b${bi}c.mp4`);
    run([...args, "-filter_complex", chain.slice(0, -1), "-map", `[${prev}]`, ...enc, outFinal]);
  }
  beatFiles.push(outFinal);
});

const all = path.join(work, "all.txt");
fs.writeFileSync(all, beatFiles.map((f) => `file '${f}'`).join("\n"));
const video = path.join(work, "video.mp4");
run(["-f", "concat", "-safe", "0", "-i", all, "-c", "copy", video]);
const total = probe(video);

// captions: transparent PNGs faded in and out over their window
const caps = [].concat(spec.beats.flatMap((b) => (b.caps ?? []).map((c) => ({ ...c, png: path.resolve(path.dirname(process.argv[2]), c.png) })))).filter(() => false);
let final = video;
if (caps.length) {
  const args = ["-i", video];
  caps.forEach((c) => args.push("-loop", "1", "-t", String(total), "-i", c.png));
  let chain = "", prev = "0:v";
  caps.forEach((c, i) => {
    chain += `[${i + 1}:v]format=rgba,fade=t=in:st=${c.a}:d=0.3:alpha=1,fade=t=out:st=${c.b - 0.3}:d=0.3:alpha=1[c${i}];[${prev}][c${i}]overlay=0:0:format=auto:enable='between(t,${c.a},${c.b})'[v${i}];`;
    prev = `v${i}`;
  });
  final = path.join(work, "video-caps.mp4");
  run([...args, "-filter_complex", chain.slice(0, -1), "-map", `[${prev}]`, ...enc, final]);
}

const outPath = path.resolve(path.dirname(process.argv[2]), spec.out);
const a = path.resolve(path.dirname(process.argv[2]), spec.audio);
run(["-i", final, "-i", a, "-filter_complex", `[1:a]aresample=48000,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", outPath]);
console.log(JSON.stringify({ out: outPath, seconds: probe(outPath), warnings: warns }, null, 1));
