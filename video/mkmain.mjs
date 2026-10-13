// mkmain.mjs NET : write work2/steps-NET.json, the whole holder run for rec.mjs (NET = testnet | mainnet).
// One step file for both nets; only the net-specific lines differ (how the wallet is funded, the sizes, the explorer).
// UI-only beats are scheduled against the narration timings (vo/ms/out/timings.json); chain waits run in real time and are
// fitted to the narration at assembly.
import fs from "node:fs";
const net = process.argv[2];
if (!["testnet", "mainnet"].includes(net)) throw new Error("usage: mkmain.mjs testnet|mainnet");
const main = net === "mainnet";
const tm = fs.existsSync("vo/ms/out/timings.json") ? JSON.parse(fs.readFileSync("vo/ms/out/timings.json", "utf8")) : null;
const L = tm ? Object.fromEntries(tm.lines.map((l) => [l.id, l])) : null;
const words = Object.fromEntries(JSON.parse(fs.readFileSync("vo/ms/script.json", "utf8")).map((l) => [l.id, l.text.split(" ").length]));
const st = (id) => (L ? L[id].start : 0.3);
const du = (id) => (L ? L[id].end - L[id].start : words[id] / 2.5);
const r = (x) => +x.toFixed(2);
const SZ1 = main ? "0.3" : "0.014", SZ2 = main ? "0.2" : "0.01";
const EXP = main ? "https://monadvision.com" : "https://testnet.monadvision.com";
const API = main ? "https://tripwire-three.vercel.app/api/mainnet" : "https://tripwire-three.vercel.app/api";
const WEB = "./web";
const IN = (n, k) => `input[aria-label="Tranche ${n} ${k}"]`;
const call = (find, label, pos = "below", key = label.slice(0, 12), pad = 6) => ({ eval: `__call(${find},${JSON.stringify(label)},'${pos}',${pad},${JSON.stringify(key)})` });
const stat = `[...document.querySelectorAll('div,span')].filter(e=>/^(Success|Fail|Failed)$/.test(e.textContent.trim())&&e.offsetParent)[0]`;
const S = [];

S.push({ waitFor: "/checked [0-9]+ s ago/.test(document.body.innerText)", timeout: 60000 });
// ---- H: the first screen, s01-s04
S.push({ eval: "window.scrollTo(0,0)" }, { rec: "H" }, { mark: "start" });
{
  const b = st("s01");
  S.push({ at: r(st("s02") - b + 0.3), ...call(`()=>document.querySelector('section[aria-labelledby=claim] ul')`, "the chain checks all four, on every sale", "below", "rules") });
  S.push({ at: r(st("s03") - b + 0.3), eval: "__uncall('rules')" });
  S.push({ at: r(st("s04") - b), eval: "document.querySelector('section[aria-label=\\'Live proof\\']')?.scrollIntoView({behavior:'smooth',block:'center'})" });
  S.push({ at: r(st("s04") - b + 0.9), ...call(`()=>document.querySelector('section[aria-label="Live proof"]')`, "live on Monad mainnet", "right", "live", 8) });
  S.push({ at: r(L ? L.s04.end - b + 0.6 : 20), eval: "__clear()" }, { rec: false });
}
// ---- P: the plan, s05-s07
S.push(
  { eval: "document.querySelector('section[aria-label=\"Price and your lines\"] .num').innerText.replace(/[^0-9.]/g,'')", as: "price" },
  { eval: "String((Number(${price})*1.02).toFixed(5))", as: "line1" },
  { eval: "String((Number(${line1})*0.955).toFixed(5))", as: "floor1" },
  { eval: "String((Number(${price})*0.90).toFixed(5))", as: "line2" },
  { eval: "String((Number(${line2})*0.955).toFixed(5))", as: "floor2" },
  { rec: "P" }, { mark: "start" },
);
{
  const b = st("s05");
  S.push({ at: 0.3, ...call(`()=>document.querySelector('section[aria-label="Price and your lines"] .num')`, "the pool's 60 second average", "right", "avg", 10) });
  S.push({ at: r(du("s05") * 0.55), eval: "__uncall('avg')" }, { clickSel: 'button[aria-label="Remove tranche 3"]' }, { mark: "removed" });
  S.push({ at: r(st("s06") - b), typeInto: IN(1, "MON"), text: SZ1, paste: true }, { typeInto: IN(1, "line"), text: "${line1}", paste: true }, { mark: "line1" });
  S.push(call(`()=>document.querySelectorAll('#sign ol li p')[0]`, "line above the price: sells at once", "left", "cross"));
  S.push({ at: r(st("s07") - b), eval: "__uncall('cross')" }, { typeInto: IN(1, "floor"), text: "${floor1}", paste: true });
  S.push(call(`()=>document.querySelector('${IN(1, "floor")}')`, "floor: the lowest price it may sell at", "left", "floor"));
  S.push({ at: r(st("s07") - b + du("s07") * 0.5), eval: "__uncall('floor')" }, { typeInto: IN(2, "MON"), text: SZ2, paste: true }, { typeInto: IN(2, "line"), text: "${line2}", paste: true }, { typeInto: IN(2, "floor"), text: "${floor2}", paste: true });
  S.push(call(`()=>document.querySelectorAll('#sign ol li p')[1]`, "10% below: should never sell", "left", "r2"));
  S.push({ at: r(L ? L.s07.end - b + 0.6 : 40), eval: "__clear()" }, { rec: false });
}
// ---- W: passkey wallet and funding, s08-s09
S.push({ rec: "W" }, { mark: "start" }, { wait: 600 }, { click: "Create a passkey", soft: false }, { mark: "created" });
S.push({ waitFor: "!!document.querySelector('#sign a[href*=\"/address/0x\"]')", timeout: 90000 });
S.push({ eval: "document.querySelector('#sign a[href*=\"/address/0x\"]').href.split('/').pop()", as: "addr" }, { mark: "addr" });
S.push({ eval: "document.querySelector('#sign a[href*=\\\"/address/0x\\\"]').scrollIntoView({block:'center'})" });
S.push(call(`()=>document.querySelector('#sign a[href*="/address/0x"]')`, "my new wallet", "above", "ad"), { wait: 1800 });
if (main) {
  S.push({ shbg: `cd ${WEB} && bun run ../demo/fund-mainnet-holder.ts \${addr} 1.0 > /tmp/tw-fund.out 2>&1` }, { mark: "fundstart" });
  S.push({ waitFor: "[...document.querySelectorAll('button')].some(b=>b.innerText.startsWith('Sign plan'))", timeout: 90000 });
  S.push({ sh: "tail -1 /tmp/tw-fund.out", as: "fund" });
} else {
  S.push({ mark: "fundstart" }, { click: "Get 0.1" });
  S.push({ waitFor: "[...document.querySelectorAll('button')].some(b=>b.innerText.startsWith('Sign plan'))", timeout: 120000 });
}
S.push({ mark: "funded" }, { eval: "__clear();__call('#sign a[href*=\"/address/0x\"]','funded','above',6,'fd')" }, { wait: 2600 }, { eval: "__clear()" }, { rec: false });
// ---- S: sign, s10
S.push({ rec: "S" }, { mark: "start" }, { wait: 500 }, call(`()=>[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('Sign plan'))`, "one passkey prompt signs it all", "left", "sg"), { wait: 1500 });
S.push({ click: "Sign plan" }, { mark: "signclick" }, { eval: "__clear()" });
S.push({ waitFor: "document.querySelector('[aria-current=page]')?.innerText==='Watch'", timeout: 240000 }, { mark: "armed" }, { wait: 1200 }, { rec: false });
// ---- K: the keeper sells, s11-s12
S.push({ eval: "window.scrollTo({top:140,behavior:'instant'})" }, { rec: "K" }, { mark: "start" }, { wait: 800 });
S.push(call(`()=>document.querySelector('[data-testid=heartbeat]')`, "the keeper: the bot that sells for me", "above", "kp"), { wait: 3200 }, { eval: "__uncall('kp')" });
S.push({ waitFor: "/Sold [0-9.]+ MON at a 60 s average/.test(document.body.innerText)", timeout: 240000 }, { mark: "sold" });
S.push({ eval: "[...document.querySelectorAll('li')].find(li=>/^Sold /.test(li.innerText.trim())).querySelector('a[href*=\"/tx/\"]').href.split('/').pop()", as: "fillTx" });
S.push({ eval: "[...document.querySelectorAll('ol[aria-label=Transactions] li')].map(li=>li.innerText.replace(/\\s+/g,' ')+'@'+(li.querySelector('a')?.href.split('/').pop()||'')).join('|')", as: "armsteps" });
S.push(call(`()=>[...document.querySelectorAll('li')].find(li=>/^Sold /.test(li.innerText.trim()))`, "sold: exactly the amount I signed, once", "below", "sold", 4), { wait: 5200 }, { mark: "soldhold" }, { eval: "__clear()" }, { rec: false });
// ---- C: the keeper cheats, s15-s19
S.push({ eval: "document.getElementById('cheat').scrollIntoView({block:'center'})" }, { wait: 600 }, { rec: "C" }, { mark: "start" }, { wait: 500 });
S.push(call(`()=>document.querySelector('#cheat')`, "the keeper is hacked: make it cheat for real", "left", "ch", 4), { wait: Math.max(1800, Math.round((du("s15") - 0.9) * 1000)) }, { eval: "__uncall('ch')" });
for (const k of [1, 2, 3]) {
  S.push({ mark: `try${k}` }, { click: "Make it try" }, { waitFor: `(document.body.innerText.match(/sent and mined, status/g)||[]).length>=${k}`, timeout: 120000 }, { mark: `refused${k}` }, { wait: 2600 });
}
S.push(
  { eval: "[...document.querySelectorAll('#cheat a[href*=\"/tx/\"]')].map(a=>a.href.split('/').pop()).join(',')", as: "cheats" },
  { eval: "[...document.querySelectorAll('#cheat .text-line')].map(e=>e.innerText).join(',')", as: "reasons" },
  { rec: false },
);
// ---- R: revoke and take the unsold MON back, s21
S.push({ eval: "document.querySelector('[aria-current=page]')?.innerText" }, { rec: "R" }, { mark: "start" }, { wait: 700 }, { click: "Revoke" }, { mark: "revokeclick" });
S.push({ waitFor: "/Plan [0-9]+ revoked/.test(document.body.innerText)", timeout: 120000 }, { mark: "revoked" }, { eval: "[...document.querySelectorAll('ol[aria-label=Transactions] li a')].map(a=>a.href.split('/').pop()).join(',')", as: "revoketx" }, { wait: 1800 });
S.push({ click: "Turn back into MON" }, { mark: "unwrapclick" });
S.push({ waitFor: "/turned back into MON/.test(document.body.innerText)", timeout: 120000 }, { mark: "unwrapped" }, { wait: 2200 });
S.push({ eval: "[...document.querySelectorAll('ol[aria-label=Transactions] li a')].map(a=>a.href.split('/').pop()).join(',')", as: "endtx" }, { rec: false });
// ---- X: the explorer, last, because leaving the app drops the in-memory passkey session
const xclip = (name, tx, label, holdMs, scroll) => {
  S.push({ goto: `${EXP}/tx/\${${tx}}`, load: 7000 }, { waitFor: `!!(${stat})`, timeout: 40000 }, { rec: name }, { mark: "start" }, { wait: 800 }, call(`()=>(${stat})`, label, "right", "x", 8), { wait: holdMs });
  if (scroll) S.push({ scroll }, { wait: 2600 });
  S.push({ rec: false });
};
xclip("X1", "fillTx", "success: the keeper's sale", 4200, 520);
S.push({ eval: "'${cheats}'.split(',')[0]", as: "cheat1" }, { eval: "'${cheats}'.split(',')[1]", as: "cheat2" }, { eval: "'${cheats}'.split(',')[2]", as: "cheat3" });
xclip("X2", "cheat1", "fail: refused by the enforcer", 4200);
xclip("X3", "cheat2", "fail: refused by the enforcer", 3200);
xclip("X4", "cheat3", "fail: refused by the enforcer", 3200);
fs.mkdirSync("work2", { recursive: true });
if (process.argv[3] === "H") {
  const end = S.findIndex((x) => x.rec === false);
  fs.writeFileSync(`work2/steps-${net}-H.json`, JSON.stringify(S.slice(0, end + 1), null, 1));
} else fs.writeFileSync(`work2/steps-${net}.json`, JSON.stringify(S, null, 1));
console.log(net, S.length, "steps", L ? "(timed to narration)" : "(default timings)");
