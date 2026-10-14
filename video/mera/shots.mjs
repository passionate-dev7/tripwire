// shots.mjs LIST.json : one visit of the pinned tab; each item {url, out, transparent?} is loaded (reload to run scripts) and screenshotted at 1600x900 x1.2.
import fs from "node:fs";
const items = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const port = process.env.CDP_PORT ?? "9396";
const pin = fs.readFileSync(process.env.PIN_FILE, "utf8").trim();
const tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.id === pin);
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1.2, mobile: false });
for (const it of items) {
  await send("Emulation.setDefaultBackgroundColorOverride", it.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await send("Page.navigate", { url: it.url }); await sleep(500);
  await send("Page.reload"); await sleep(700);
  for (let i = 0; i < 40; i++) { const r = await send("Runtime.evaluate", { expression: "window.__ready===true", returnByValue: true }); if (r.result.result.value) break; await sleep(150); }
  await sleep(250);
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(it.out, Buffer.from(shot.result.data, "base64"));
}
await send("Emulation.setDefaultBackgroundColorOverride", {});
ws.close(); console.log("shots", items.length);
