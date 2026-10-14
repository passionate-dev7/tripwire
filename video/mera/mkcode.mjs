// mkcode.mjs : build scenes/mera-code.html from the real lines of web/lib/passkey.ts (nothing typed by hand).
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../web/lib/passkey.ts", import.meta.url), "utf8").split("\n");
const blocks = [
  { title: "createPasskeyAccount", from: 78, to: 83, note: "one creation ceremony: the passkey and its PRF output" },
  { title: "accountFromPrfOutput", from: 50, to: 52, note: "PRF-derived secp256k1 key becomes a Mera signing session and a viem account" },
];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const hi = (l) => esc(l).replace(/(createPasskeyWithPrfOutput|createSecp256k1SigningSession|toViemAccount)/g, '<b>$1</b>');
let html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"PS";src:url(fonts/sans.woff2);font-weight:400 600}
@font-face{font-family:"PM";src:url(fonts/mono-400.woff2);font-weight:400}
@font-face{font-family:"PM";src:url(fonts/mono-500.woff2);font-weight:500}
*{box-sizing:border-box;margin:0}
html,body{width:1600px;height:900px;background:#07080a;color:#f4f4f6;overflow:hidden;font-family:"PS",sans-serif}
.w{position:absolute;left:110px;right:110px;top:90px}
.f{font:500 17px "PM";letter-spacing:.12em;color:#9c9c9d;text-transform:uppercase;margin-bottom:10px}
.h{font:600 44px/1.15 "PS";letter-spacing:-.01em;margin-bottom:46px}
.blk{border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#0d0d0d;margin-bottom:30px;overflow:hidden}
.bt{display:flex;justify-content:space-between;padding:13px 22px;border-bottom:1px solid #242728;font:400 18px "PM";color:#9c9c9d}
.bt span:first-child{color:#f4f4f6}
pre{padding:20px 22px;font:400 26px/1.5 "PM";color:#9c9c9d;white-space:pre}
pre i{display:inline-block;width:46px;color:#4b4c4d;font-style:normal;user-select:none}
pre b{color:#f4f4f6;font-weight:500;background:rgba(255,255,255,.12);border-radius:4px;padding:0 4px}
</style><div class="w"><div class="f">web/lib/passkey.ts</div><div class="h">Mera is the whole account: a passkey in, a Monad signer out.</div>`;
for (const b of blocks) {
  const lines = src.slice(b.from - 1, b.to).map((l, i) => `<i>${b.from + i}</i>${hi(l)}`).join("\n");
  html += `<div class="blk"><div class="bt"><span>${b.title}()</span><span>${esc(b.note)}</span></div><pre>${lines}</pre></div>`;
}
html += `</div><script>window.__ready=true</script>`;
fs.writeFileSync(new URL("../scenes/mera-code.html", import.meta.url), html);
console.log("ok", blocks.map((b) => src.slice(b.from - 1, b.to).length));
