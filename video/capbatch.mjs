// capbatch.mjs TIMINGS.json OUTDIR : one transparent caption PNG per narration line (scenes/cap.html), one tab visit.
import fs from "node:fs";
const [, , timings, out] = process.argv;
const lines = JSON.parse(fs.readFileSync(timings, "utf8")).lines;
fs.mkdirSync(out, { recursive: true });
const port = process.env.CDP_PORT ?? "9396";
const pin = fs.readFileSync(process.env.PIN_FILE ?? `${process.env.HOME}/.cache/qa-tab-tripwire-video`, "utf8").trim();
const tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.id === pin);
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const l of lines) {
  const url = `file://${new URL("./scenes/cap.html", import.meta.url).pathname}#${encodeURIComponent(JSON.stringify({ text: l.cap }))}`;
  await send("Page.navigate", { url }); await sleep(500);
  await send("Page.reload"); await sleep(700);
  for (let i = 0; i < 30; i++) { const r = await send("Runtime.evaluate", { expression: "window.__ready===true", returnByValue: true }); if (r.result.result.value) break; await sleep(150); }
  await sleep(150);
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(`${out}/${l.id}.png`, Buffer.from(shot.result.data, "base64"));
}
await send("Emulation.setDefaultBackgroundColorOverride", {});
ws.close(); console.log("captions", lines.length);
