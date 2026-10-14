// mkend.mjs : result card from the take's own HUD read-back (nothing typed by hand) -> scenes/mera-end.html
import fs from "node:fs";
const v = JSON.parse(fs.readFileSync(new URL("take/vars.json", import.meta.url), "utf8"));
const h = JSON.parse(v.hud), m = h.ms;
const f = (x) => x.toFixed(1);
const sh = (x) => x.slice(0, 8) + ".." + x.slice(-4);
const rows = [
  ["0.1 testnet MON in the new account", m.funded, "tx confirmed"],
  ["first transaction signed by the passkey", m.signed, sh(v.wraptx)],
  ["plan armed on Monad", m.armed, "no second prompt"],
];
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"PS";src:url(fonts/sans.woff2);font-weight:400 600}
@font-face{font-family:"PM";src:url(fonts/mono-400.woff2);font-weight:400}
@font-face{font-family:"PM";src:url(fonts/mono-500.woff2);font-weight:500}
*{box-sizing:border-box;margin:0}
html,body{width:1600px;height:900px;background:#07080a;color:#f4f4f6;overflow:hidden;font-family:"PS",sans-serif}
.w{position:absolute;left:130px;right:130px;top:110px}
.k{font:500 17px "PM";letter-spacing:.14em;color:#9c9c9d;text-transform:uppercase;margin-bottom:26px}
.big{display:flex;gap:70px;align-items:flex-end;margin-bottom:54px}
.big div{font:500 150px/1 "PM";letter-spacing:-.04em;color:#7dffb0;font-variant-numeric:tabular-nums}
.big div small{display:block;font:500 18px "PM";letter-spacing:.14em;color:#9c9c9d;margin-top:14px;text-transform:uppercase;letter-spacing:.14em}
.big div.t{color:#f4f4f6}
.r{display:grid;grid-template-columns:1fr 270px 250px;white-space:nowrap;padding:17px 4px;border-top:1px solid #242728;font:400 25px "PS";color:#cdcdcd;align-items:center}
.r span{font:400 22px "PM";color:#9c9c9d;font-variant-numeric:tabular-nums}
.r span.n{color:#f4f4f6;font-weight:500}
.foot{margin-top:34px;font:400 24px/1.5 "PS";color:#cdcdcd;border-top:1px solid #242728;padding-top:26px}
</style><div class="w"><div class="k">Landing page to first confirmed Monad transaction, measured</div>
<div class="big"><div>${f(m.signed.t)}<small>seconds</small></div><div class="t">${m.signed.taps}<small>taps</small></div><div class="t">${m.signed.prompts}<small>passkey prompt</small></div></div>
${rows.map((r) => `<div class="r"><div>${r[0]}</div><span class="n">${f(r[1].t)} s, ${r[1].taps} taps</span><span>${r[2]}</span></div>`).join("")}
<div class="foot">Mera is the whole account layer: no extension, no seed phrase, no stored key. One passkey prompt, one bounded permission, then every transaction signs without asking again.</div></div><script>window.__ready=true</script>`;
fs.writeFileSync(new URL("../scenes/mera-end.html", import.meta.url), html);
console.log("end card", f(m.signed.t), m.signed.taps, m.signed.prompts);
