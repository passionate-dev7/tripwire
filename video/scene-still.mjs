// scene-still.mjs SCENE.html 'CUES_JSON' T OUT.png : render a scene at time T in the pinned tab and screenshot it.
import fs from "node:fs";
const [, , scene, cues, T, out] = process.argv;
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
await send("Page.navigate", { url: `file://${new URL("./scenes/" + scene, import.meta.url).pathname}#${encodeURIComponent(cues)}` }); await sleep(1200);
await send("Page.reload"); await sleep(1500);
for (let i = 0; i < 30; i++) { const r = await send("Runtime.evaluate", { expression: "window.__ready===true", returnByValue: true }); if (r.result.result.value) break; await sleep(200); }
await send("Runtime.evaluate", { expression: `document.body.style.transform='none';window.render(${Number(T)})` });
await sleep(400);
const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
fs.writeFileSync(out, Buffer.from(shot.result.data, "base64")); ws.close(); console.log(out);
