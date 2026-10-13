// mkdoc-main.mjs : write docs/portal/tripwire-demo-script.md from the narration timings and the mainnet run record.
import fs from "node:fs";
const tm = JSON.parse(fs.readFileSync("vo/ms/out/timings.json", "utf8"));
const runFile = fs.readdirSync("../demo/runs").filter((f) => f.startsWith("mainnet-demo-")).sort().at(-1);
const R = JSON.parse(fs.readFileSync(`../demo/runs/${runFile}`, "utf8"));
const L = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
const mm = (t) => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const sh = (h) => h.slice(0, 10) + ".." + h.slice(-6);
const ids = tm.lines.map((l) => l.id);
const startOf = (id) => (id === ids[0] ? 0 : L[id].start);
const endOf = (id) => { const i = ids.indexOf(id); return i + 1 < ids.length ? L[ids[i + 1]].start : tm.duration; };
const px = R.plan.rows;
const S = {
  s01: ["The live site on Monad mainnet: the headline, 'A stop-loss on your MON that the bot can't break', slow push-in.", "tripwire-three.vercel.app/?net=mainnet"],
  s02: ["Same screen; the four rules under the headline called out.", "Hero rules: only at your line, never under your floor, only to your address, only until your end date"],
  s03: ["The live proof strip: the keeper's tries and refusals counted from the chain.", `keeper API /api/mainnet/recent; enforcer ${R.setup.steps.length ? "0x4c594690108f808d9e5603df548740b22e82703e" : ""}`],
  s04: ["The 'Live on Monad mainnet' row with the enforcer and plan book addresses.", "contracts/deployments/143.json, read with cast code at rpc1.monad.xyz"],
  s05: ["The plan ticket: the 60 second average called out, the third row removed.", `60 s average ${R.price} USDC per MON, read from the page`],
  s06: ["Row 1 typed: 0.3 MON, line above the average; the page says the line is already crossed.", `line ${R.line1} against ${R.price}; floor ${R.floor1}`],
  s07: ["Row 1 floor, then row 2: 0.2 MON, 10% below, floor under it.", `row 2 line ${R.line2}, floor ${R.floor2}`],
  s08: ["A passkey wallet created with one click; the new address appears.", `holder ${R.holder}`],
  s09: ["1 MON arrives at the address; Sign plan unlocks.", `funding tx ${R.funding?.tx}, ledger demo/runs/mainnet-funding.json`],
  s10: ["Sign plan: one passkey prompt, the setup steps with their transaction links.", `plan posted in block ${R.setup.postedBlock}, tx ${sh(R.setup.postedTx)}, status ${R.setup.postedStatus}`],
  s11: ["Watch tab: the keeper's heartbeat called out; row 1 reads selling.", "keeper 0x8a916555418dC4a8A4b11E2Fc2B8e85127204468"],
  s12: ["Row 1 sold: the activity row with the amount received.", `sale tx ${sh(R.sale.tx)}, block ${R.sale.block}, ${Number(R.sale.wmonOut) / 1e18} MON for ${Number(R.sale.stableIn) / 1e6} USDC (floor ${Number(R.sale.minOut) / 1e6})`],
  s13: ["monadvision.com page of the sale: Status Success, the swap, the USDC transfer to the holder.", `monadvision.com/tx/${R.sale.tx}`],
  s14: ["Read-back card: status, block, MON out, USDC in, row 1 sold, row 2 never sold.", `cast receipt and cast call, rpc1.monad.xyz, block ${R.readAtBlock}; spent(row1)=${R.after.spent[0]}, spent(row2)=${R.after.spent[1]}`],
  s15: ["Watch tab, the Try to cheat card called out.", "keeper API /api/mainnet/attack"],
  s16: ["Cheat 1 pressed: refused with Tripwire:above-line.", `tx ${sh(R.cheats[0].hash)}, block ${R.cheats[0].block}, status ${R.cheats[0].status}`],
  s17: ["Cheat 2 pressed: refused with Tripwire:min-out.", `tx ${sh(R.cheats[1].hash)}, block ${R.cheats[1].block}, status ${R.cheats[1].status}`],
  s18: ["Cheat 3 pressed: refused with Tripwire:recipient.", `tx ${sh(R.cheats[2].hash)}, block ${R.cheats[2].block}, status ${R.cheats[2].status}`],
  s19: ["The three refused transactions on monadvision.com, each Status Fail with its reason.", R.cheats.map((c) => `monadvision.com/tx/${sh(c.hash)}`).join(", ")],
  s20: ["Animated: a sale passes the enforcer's checks (line, floor, amount, recipient, route) on Monad.", "contracts/src/TripwirePlanEnforcer.sol"],
  s21: ["Revoke pressed, then 'Turn back into MON'.", `revoke tx ${sh(R.revoke.tx)} status ${R.revoke.status}; unwrap tx ${sh(R.unwrap.tx)} status ${R.unwrap.status}; disabledDelegations=${R.after.disabledDelegation}`],
  s22: ["End card: the mark, the one-line promise, the live URL.", "brand/logo.svg"],
};
let md = `# tripwire demo script (${mm(tm.duration)}, live Monad mainnet)\n\nOne holder, Dan, first person, one real run on Monad mainnet. Narration is one voice, one clip per sentence, leveled to about -19 LUFS. Every number on screen is read from the live site, the keeper API or the chain; the run record is demo/runs/${runFile}.\n\n`;
for (const id of ids) {
  const l = L[id];
  md += `${mm(startOf(id))} to ${mm(endOf(id))}. On screen: ${S[id][0]}\nVoice: "${l.text}"\nSource: ${S[id][1]}\n\n`;
}
fs.writeFileSync("../../../docs/portal/tripwire-demo-script.md", md);
console.log(md.length, "chars");
