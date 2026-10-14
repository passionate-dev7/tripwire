// mkvo.mjs : narration script from the take's measured numbers.
import fs from "node:fs";
const v = JSON.parse(fs.readFileSync(new URL("take/vars.json", import.meta.url), "utf8"));
const m = JSON.parse(v.hud).ms.signed;
const T = m.t.toFixed(1);
const D = JSON.parse(v.hud).ms.funded.t.toFixed(1);
const L = [
  ["m01", "Mera turns your passkey into your Monad account. Here is tripwire's whole flow, timed.", 0.35],
  ["m02", "No extension, no seed phrase shown or stored. The clock starts on the landing page and counts every tap.", 0.45],
  ["m03", "Tap one: create a passkey wallet. One passkey prompt, and Mera opens the signing session.", 0.3],
  ["m04", "Tap two: the drip. Testnet MON lands in that address.", 0.3],
  ["m05", "Tap three: sign plan. The session signs it, with no new prompt.", 0.3],
  ["m06", `The drip confirmed at ${D} seconds. The first transaction the passkey signed confirms at ${T} seconds: three taps, one passkey prompt.`, 0.4],
  ["m10", "That transaction on the explorer. Status: Success.", 0.35],
  ["m07", "In code, one Mera call makes the passkey, and its signing session is the account. The session lives in memory for the page, so there is no second prompt.", 0.4],
  ["m08", "What bounds the plan is the plan itself: size, price floor, recipient and end date, checked by the contract on every sale.", 0.4],
  ["m09", "The keeper then sells for that plan, inside those bounds. Confirmed on Monad.", 0.35],
  ["m11", `Landing page to a passkey-signed Monad transaction: ${T} seconds, three taps, one passkey prompt. Mera is the whole account layer.`, 0.5],
].map(([id, text, gap]) => ({ id, text, gap }));
fs.mkdirSync(new URL("vo", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("vo/script.json", import.meta.url), JSON.stringify(L, null, 1));
console.log(L.length, "lines", T);
