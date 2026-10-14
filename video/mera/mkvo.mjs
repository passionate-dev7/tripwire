// mkvo.mjs : narration script from the take's measured numbers.
import fs from "node:fs";
const v = JSON.parse(fs.readFileSync(new URL("take/vars.json", import.meta.url), "utf8"));
const m = JSON.parse(v.hud).ms.signed;
const T = m.t.toFixed(1);
const L = [
  ["m01", "Mera turns your passkey into your Monad account. Here is tripwire's whole flow, timed.", 0.35],
  ["m02", "No extension, no seed phrase. The clock starts on the landing page and counts every tap.", 0.45],
  ["m03", "Tap one: create a passkey wallet. One prompt, and Mera returns the address.", 0.3],
  ["m04", "Tap two: the drip. Testnet MON lands in that address.", 0.3],
  ["m05", "Tap three: sign plan. One permission, signed by the passkey.", 0.3],
  ["m06", `First confirmed Monad transaction: ${T} seconds, three taps, one passkey prompt.`, 0.4],
  ["m10", "The first transaction on the explorer. Status: Success.", 0.35],
  ["m08", "No second prompt is needed: the permission is the limit. The contract checks size, price floor, recipient and end date on every sale.", 0.4],
  ["m07", "In code, one Mera call makes the passkey, and its signing session is the account.", 0.4],
  ["m09", "The keeper then sells for that plan, inside that permission. Confirmed on Monad.", 0.35],
  ["m11", `Landing page to a confirmed Monad transaction: ${T} seconds, three taps, one passkey prompt. Mera is the whole account layer.`, 0.5],
].map(([id, text, gap]) => ({ id, text, gap }));
fs.mkdirSync(new URL("vo", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("vo/script.json", import.meta.url), JSON.stringify(L, null, 1));
console.log(L.length, "lines", T);
