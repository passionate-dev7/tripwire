// mkdoc.mjs : docs/portal/tripwire-{demo,pitch}-script.md from the narration timings and the film plans, so the script, the audio and the cut cannot drift apart.
import fs from "node:fs";
const root = new URL("../../../", import.meta.url).pathname;
const clean = (t) => t.replace(/pass key/gi, (m) => (m[0] === "P" ? "Passkey" : "passkey")).replace(/trip wire/gi, "tripwire").replace(/\bMon\b/g, "MON").replace(/E I P seven seven oh two/g, "EIP-7702").replace(/r slash Monad/gi, "r/Monad").replace(/\bmon\b/g, "MON");
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const SCREEN = {
 demo: {
  d01: ["The live Plan screen: MON's 60 s average from the pool, three signed-plan rows, the chart with the plan's lines", "tripwire-three.vercel.app, price read from the keeper's /api/status"],
  d02: ["The three rows of the plan highlighted", "Plan tab, ticket rows"],
  d03: ["Stop, stop, target: each row called out in turn", "Plan tab rows 1 to 3 (falls to, falls to, rises to)"],
  d04: ["The target line typed to just under today's price", "line = 0.97 x the pool's 60 s average, read live"],
  d05: ["The floor typed under the line", "floor = 0.93 x the 60 s average"],
  d06: ["A passkey named and created; the new address appears", "Category Labs Mera passkey, virtual authenticator in the capture browser"],
  d07: ["Testnet MON arrives; the Sign plan button", "keeper /api/drip, once per passkey"],
  d08: ["One passkey prompt; the setup steps with transaction links", "wrap, 7702 upgrade and PlanBook post, status read from chain"],
  d09: ["Watch tab: the next line reads 'reached'; the sale appears", "keeper fill, 60 s average at the line"],
  d10: ["Sold row called out", "plan card activity row with the fill transaction"],
  d11: ["Explorer page of the fill (Success, swap), then the chain read-back card", "testnet.monadvision.com tx page; cast receipt and cast call on the testnet RPC"],
  d12: ["Stop rows still reading 'to stop'", "plan card state column"],
  d12b: ["The Watch screen as a whole", "live"],
  d13: ["Try to cheat card", "Watch tab"],
  d14: ["First forbidden sale mined and refused: Tripwire:above-line", "keeper sends the sale, the page reads the revert reason from the mined receipt"],
  d15: ["Second forbidden sale refused: Tripwire:recipient", "same"],
  d16: ["Explorer: the timestamp caveat refusal", "tx 0x45f500de...7268, status Fail, TimestampEnforcer:expired-delegation"],
  d17: ["Explorer pages of both new refusals, status Fail with the reason tag", "the two cheat transactions of this run"],
  d18: ["Animated redemption through the DelegationManager and both caveats", "contracts/src/TripwirePlanEnforcer.sol checks; MetaMask DelegationManager v1.3.0"],
  d19: ["The enforcer's five checks light up", "beforeHook: line, floor, amount, recipient, route"],
  d20: ["Keeper box: what runs off chain", "keeper/keeper.ts: 2 s loop, eth_estimateGas, redeemDelegations"],
  d20b: ["Static site, only the keeper off chain", "scripts/build-static.sh"],
  d21: ["Revoke clicked; the plan reads revoked", "Watch tab"],
  d21b: ["Chain card: disabledDelegations true", "cast call on the DelegationManager"],
  d22: ["End card", "brand/logo.svg"],
 },
 pitch: {
  p01: ["A real r/Monad comment, the quoted sentence highlighted", "reddit.com/r/Monad/comments/1wuhzon, read 2026-10-13"],
  p03: ["The headline of the unlock article", "cryptoticker.io/en/monad-mon-unlock-lock-up-expiry/"],
  p03b: ["The same thread, 19 comments highlighted", "reddit.com/r/Monad/comments/1wuhzon"],
  p04: ["A trader's post on Telegram bots", "x.com/CairoGringo/status/2103988630939447555"],
  p06: ["A holder's ask for a spot stop loss", "x.com/fine_tec_/status/2091984014424821959"],
  p07: ["A limit gate: requests with any price and any recipient pass", "animated scene"],
  p08: ["The live Plan screen", "tripwire-three.vercel.app"],
  p09: ["Passkey created, no extension, no seed phrase", "live capture"],
  p10: ["One signed sale passes the wire; LINE, FLOOR, AMOUNT, RECIPIENT", "sale 3 of a plan on Monad testnet, tx 0x53306a4e...3347"],
  p12: ["The live forbidden-sales counter and a refused row", "keeper index via /api/recent, read at record time"],
  p13: ["Explorer: Fail with Tripwire:above-line", "tx 0x8b9961b6...5ba0"],
  p14: ["The guard lines, tests green, one guard deleted, tests red, restored", "forge test on a Monad mainnet fork; mutant results in contracts/results"],
  p15: ["Explorer: gas used by the sale", "tx 0x53306a4e...3347, 475,053"],
  p16: ["Explorer: reserve balance violation", "tx 0x80e8c96e...fb90"],
  p17: ["Delegation and enforcer boxes", "animated scene"],
  p19: ["Checks and keeper off chain", "animated scene"],
  p20: ["The MetaMask post, the sentence highlighted", "x.com/francescoswiss/status/2087162050552221737"],
  p21: ["End card", "brand/logo.svg"],
 },
};
for (const [film, cfg, title, out] of [["demo", "film-demo.json", "tripwire demo script", "tripwire-demo-script.md"], ["pitch", "film-pitch.json", "tripwire pitch script", "tripwire-pitch-script.md"]]) {
  const f = JSON.parse(fs.readFileSync(cfg, "utf8"));
  const tm = JSON.parse(fs.readFileSync(f.timings, "utf8"));
  const at = Object.fromEntries(tm.lines.map((l) => [l.id, l]));
  let md = `# ${title} (${mmss(tm.duration)}, live Monad testnet)\n\nNarration in one cloned voice, one clip per sentence, leveled to about -19 LUFS. Every number on screen is read from the live site, the keeper API or the chain at the block named in the footage.\n\n`;
  f.beats.forEach((b, i) => {
    const t0 = i === 0 ? 0 : at[b.lines[0]].start, last = at[b.lines.at(-1)];
    const nxt = f.beats[i + 1] ? at[f.beats[i + 1].lines[0]].start : tm.duration;
    const sc = SCREEN[film][b.lines[0]] ?? ["continues", ""];
    md += `${mmss(t0)} to ${mmss(nxt)}. On screen: ${sc[0]}.\nVoice: "${clean(b.lines.map((id) => at[id].text).join(" "))}"\nSource: ${sc[1]}\n\n`;
  });
  fs.writeFileSync(root + "docs/portal/" + out, md);
  console.log(out, f.beats.length, "beats");
}
