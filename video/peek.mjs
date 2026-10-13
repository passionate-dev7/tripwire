// peek.mjs 'js' : evaluate in the pinned tab without navigating or focusing it.
import fs from "node:fs";
const port = process.env.CDP_PORT ?? "9396";
const pin = fs.readFileSync(process.env.PIN_FILE ?? `${process.env.HOME}/.cache/qa-tab-tripwire-video`, "utf8").trim();
const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.id === pin);
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) { console.log(d.result?.result?.value ?? JSON.stringify(d.result)); ws.close(); } };
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: process.argv[2], returnByValue: true, awaitPromise: true } }));
