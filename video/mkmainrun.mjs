// mkmainrun.mjs NET : read a finished run's vars, then the chain (cast) and the keeper API, and write the run record
// (demo/runs/mainnet-demo-<iso>.json on mainnet, work2/run-testnet.json on testnet) plus the chain read-back scene cues.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const net = process.argv[2];
const main = net === "mainnet";
const v = JSON.parse(fs.readFileSync(`work2/${net}/vars.json`, "utf8"));
const RPC = main ? "https://rpc1.monad.xyz" : "https://testnet-rpc.monad.xyz";
const API = main ? "https://tripwire-three.vercel.app/api/mainnet" : "https://tripwire-three.vercel.app/api";
const dep = JSON.parse(fs.readFileSync(`../contracts/deployments/${main ? 143 : 10143}.json`, "utf8"));
const ENF = dep.enforcer4 ?? dep.enforcer, DM = dep.delegationManager ?? "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const WMON = dep.wmon;
const cast = (...a) => execFileSync("cast", [...a, "--rpc-url", RPC], { encoding: "utf8", env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" }, stdio: ["ignore", "pipe", "ignore"] }).trim();
const num = (s) => s.split(" ")[0];
const sh = (h) => h.slice(0, 6) + ".." + h.slice(-4);
const plans = (await (await fetch(`${API}/plans?holder=${v.addr}`)).json()).plans;
const p = plans[plans.length - 1];
const fill = p.fills[0];
const rc = (h) => JSON.parse(cast("receipt", h, "--json"));
const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const fr = rc(v.fillTx);
const tr = fr.logs.filter((l) => l.topics[0] === T).map((l) => ({ token: l.address.toLowerCase(), from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26), v: BigInt(l.data).toString() }));
const holderLc = v.addr.toLowerCase();
const wmonOut = tr.find((t) => t.from.toLowerCase() === holderLc);
const stableIn = tr.find((t) => t.to.toLowerCase() === holderLc);
const cheats = v.cheats.split(",").map((h, i) => { const r = rc(h); return { kind: ["line", "floor", "recipient"][i], hash: h, status: Number(r.status === "0x1" || r.status === "1" ? 1 : 0), block: parseInt(r.blockNumber, 16), reason: v.reasons.split(",")[i], keeperAttack: p.attacks.find((a) => a.hash.toLowerCase() === h.toLowerCase())?.reason }; });
const spent = [0, 1].map((i) => cast("call", ENF, "spent(bytes32,uint256)(bool)", p.delegationHash, String(i)));
const disabled = cast("call", DM, "disabledDelegations(bytes32)(bool)", p.delegationHash);
const head = Number(cast("block-number"));
const bal = (a) => num(cast("balance", a));
const STABLE = stableIn.token;
const erc = (t, a) => num(cast("call", t, "balanceOf(address)(uint256)", a));
const posted = rc(p.postedTx);
const arm = (v.armsteps ?? "").split("|").filter(Boolean).map((x) => { const [label, hash] = x.split("@"); return { label, hash }; });
const revokeHash = (v.revoketx ?? "").split(",")[0];
const unwrapHash = (v.endtx ?? "").split(",")[0];
const out = {
  net, chainId: main ? 143 : 10143, readAtBlock: head, holder: v.addr, plan: { id: p.id, delegationHash: p.delegationHash, expiresAt: p.expiresAt, rows: p.tranches.map((t) => ({ line: t.line, floorPerMon: t.floorPerMon, mon: Number(t.mon) / 1e18, atOrAbove: t.atOrAbove, spent: t.spent })) },
  price: v.price, line1: v.line1, floor1: v.floor1, line2: v.line2, floor2: v.floor2, funding: v.fund ? JSON.parse(v.fund) : null,
  setup: { steps: arm, postedTx: p.postedTx, postedStatus: parseInt(posted.status, 16), postedBlock: parseInt(posted.blockNumber, 16) },
  sale: { tx: v.fillTx, status: parseInt(fr.status, 16), block: parseInt(fr.blockNumber, 16), from: fr.from, gasUsed: parseInt(fr.gasUsed, 16), wmonOut: wmonOut?.v, stableIn: stableIn?.v, minOut: fill.minOut, amountIn: fill.amountIn, priceTick: fill.priceTick },
  cheats, revoke: { tx: revokeHash, status: revokeHash ? parseInt(rc(revokeHash).status, 16) : null }, unwrap: { tx: unwrapHash, status: unwrapHash ? parseInt(rc(unwrapHash).status, 16) : null },
  after: { spent, disabledDelegation: disabled, holderMON: bal(v.addr), holderWMON: erc(WMON, v.addr), holderStable: erc(STABLE, v.addr) },
};
const file = main ? `../demo/runs/mainnet-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.json` : "work2/run-testnet.json";
fs.writeFileSync(file, JSON.stringify(out, null, 1));
fs.writeFileSync(`work2/${net}/run.json`, JSON.stringify(out, null, 1));
const sym = main ? "USDC" : "aUSD", dec = main ? 6 : 6;
const f = (x, d) => (Number(x) / 10 ** d).toString();
const sale = out.sale;
const rows = [
  ["the sale", `status ${sale.status}, block ${Number(sale.block).toLocaleString("en-US")}`],
  ["sent by", `the keeper, ${sh(sale.from)}`],
  ["MON out", `${f(sale.wmonOut, 18)} MON left my wallet ${sh(v.addr)}`],
  [`${sym} in`, `${f(sale.stableIn, dec)} ${sym} in the same wallet, floor ${f(sale.minOut, dec)}`],
  ["row 1", out.after.spent[0] === "true" ? "sold, once" : "not sold"],
  ["row 2", out.after.spent[1] === "true" ? "sold" : "never sold"],
];
fs.writeFileSync("work2/cues-chain-main.json", JSON.stringify({ title: "READ FROM THE CHAIN, NOT FROM THE PAGE", big: "Row 1 sold. Row 2 did not.", t0: 0.2, step: 0.55, drift: 0.06, dur: 8, rows, foot: `cast receipt and cast call on ${RPC.replace("https://", "")}, read at block ${head.toLocaleString("en-US")}` }));
console.log(JSON.stringify({ file, sale: { status: sale.status, block: sale.block, stableIn: sale.stableIn }, cheats: cheats.map((c) => [c.kind, c.status, c.reason]), spent, disabled, bal: out.after }));
