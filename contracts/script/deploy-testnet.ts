// Deploys tripwire's rails on Monad testnet, where Uniswap V3 has no deployment, then seeds a WMON/aUSD pool.
//   bun run script/deploy-testnet.ts [rpcUrl]          (default https://testnet-rpc.monad.xyz)
// Uniswap V3 factory and SwapRouter02 come from Uniswap's own published npm artifacts (pinned in package.json); the
// router's embedded pool init-code hash matches the published pool bytecode. Resumable: every finished step is
// written to deployments/<chainId>.json and skipped on the next run. Each step is checked by its receipt status and a
// post-condition only completion produces (code at the address, a balance, a pool tick). The deployer key is read from
// ../demo/.keys.json (gitignored) and never printed.
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseEther,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const rpc = process.argv[2] ?? "https://testnet-rpc.monad.xyz";

export const DELEGATION_MANAGER: Address = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
export const AUSD: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const FEE = 3000;
const TICK_SPACING = 60;
const OBSERVATIONS = 16;

// Pool shape. The price starts at the mainnet WMON/USDC level read on 2026-10-02 (about 0.0343 USDC per MON). A thin
// band around it (TOP_LOW to TOP_HIGH) is pushed through by a small market sell, so a demo can cross a stop line
// with testnet-sized amounts; under it, a deeper aUSD-only band (BIDS_LOW to TOP_LOW) absorbs the stop sells near
// the line instead of collapsing the price.
const START_PRICE = 0.0343;
const TOP_LOW = 0.0325;
const TOP_HIGH = 0.036;
const BIDS_LOW = 0.02;
const PUSH_MON = 0.25; // MON a market sell needs to move the price from START_PRICE to TOP_LOW
const BIDS_AUSD = 150; // aUSD resting in the bid band

const keys = JSON.parse(fs.readFileSync(path.join(root, "..", "demo", ".keys.json"), "utf8")) as { deployer: Hex };
const account = privateKeyToAccount(keys.deployer);
const pub = createPublicClient({ transport: http(rpc) });
const wallet = createWalletClient({ account, transport: http(rpc) });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: `monad-${chainId}`, nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;

const outFile = process.env.DEPLOY_OUT ?? path.join(root, "deployments", `${chainId}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const dep: Record<string, string> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const save = () => fs.writeFileSync(outFile, JSON.stringify(dep, null, 2) + "\n");

function artifact(rel: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const bytecode = (j.bytecode?.object ?? j.bytecode) as Hex;
  return { abi: j.abi, bytecode: bytecode.startsWith("0x") ? bytecode : (`0x${bytecode}` as Hex) };
}

async function confirm(hash: Hex, label: string) {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000, retryCount: 10 });
  if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: ${hash} gas ${r.gasUsed}`);
  return r;
}

async function deploy(name: string, rel: string, args: unknown[] = []): Promise<Address> {
  if (dep[name]) return dep[name] as Address;
  const { abi, bytecode } = artifact(rel);
  const data = encodeDeployData({ abi, bytecode, args });
  const hash = await wallet.sendTransaction({ chain, data });
  const r = await confirm(hash, `deploy ${name}`);
  const addr = r.contractAddress as Address;
  const code = await pub.getCode({ address: addr });
  if (!code || code === "0x") throw new Error(`${name}: no code at ${addr}`);
  dep[name] = addr;
  dep[`${name}Tx`] = hash;
  save();
  return addr;
}

async function send(to: Address, data: Hex, label: string, value = 0n) {
  const hash = await wallet.sendTransaction({ chain, to, data, value });
  await confirm(hash, label);
  return hash;
}

console.log(`chain ${chainId}, deployer ${account.address}, balance ${(await pub.getBalance({ address: account.address })) / 10n ** 15n} mMON`);

const wmon = await deploy("wmon", "out/WMON.sol/WMON.json");
const factory = await deploy("factory", "node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const router = await deploy(
  "router",
  "node_modules/@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json",
  ["0x0000000000000000000000000000000000000000", factory, "0x0000000000000000000000000000000000000000", wmon],
);
// V=2 deploys a new enforcer and plan book beside the old ones (same WMON, router and pool); earlier plans keep theirs.
const V = process.env.V ?? "";
const enforcer = await deploy(`enforcer${V}`, "out/TripwirePlanEnforcer.sol/TripwirePlanEnforcer.json", [DELEGATION_MANAGER]);
const planBook = await deploy(`planBook${V}`, "out/PlanBook.sol/PlanBook.json", [DELEGATION_MANAGER, enforcer]);
const seeder = await deploy("seeder", "out/PoolSeeder.sol/PoolSeeder.json");

const factoryAbi = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)",
]);
const poolAbi = parseAbi([
  "function initialize(uint160)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function increaseObservationCardinalityNext(uint16)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
]);
const wmonAbi = parseAbi(["function deposit() payable", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const seederAbi = parseAbi(["function mint(address,int24,int24,uint128) returns (uint256,uint256)"]);

// WMON is token0 when its address sorts first. Uniswap's price is token1 per token0 in raw units (WMON 18, aUSD 6).
const wmonIsToken0 = BigInt(wmon) < BigInt(AUSD);
const rawPrice = (p: number) => (wmonIsToken0 ? p * 1e-12 : 1e12 / p);
const tickOf = (p: number) => Math.log(rawPrice(p)) / Math.log(1.0001);
const snap = (t: number) => Math.round(t / TICK_SPACING) * TICK_SPACING;
const sqrtX96 = (p: number) => BigInt(Math.floor(Math.sqrt(rawPrice(p)) * 2 ** 96));
const sqrtAtTick = (t: number) => Math.sqrt(1.0001 ** t);
const range = (pa: number, pb: number) => {
  const [a, b] = [snap(tickOf(pa)), snap(tickOf(pb))];
  return a < b ? [a, b] : [b, a];
};

let pool = (await pub.readContract({ address: factory, abi: factoryAbi, functionName: "getPool", args: [wmon, AUSD, FEE] })) as Address;
if (pool === "0x0000000000000000000000000000000000000000") {
  await send(factory, encodeFunctionData({ abi: factoryAbi, functionName: "createPool", args: [wmon, AUSD, FEE] }), "createPool");
  pool = (await pub.readContract({ address: factory, abi: factoryAbi, functionName: "getPool", args: [wmon, AUSD, FEE] })) as Address;
}
dep.pool = pool;
dep.wmonIsToken0 = String(wmonIsToken0);
save();

const slot0 = (await pub.readContract({ address: pool, abi: poolAbi, functionName: "slot0" })) as readonly [bigint, number, number, number, number, number, boolean];
if (slot0[0] === 0n) {
  await send(pool, encodeFunctionData({ abi: poolAbi, functionName: "initialize", args: [sqrtX96(START_PRICE)] }), "initialize pool");
}
if (slot0[3] < OBSERVATIONS) {
  await send(pool, encodeFunctionData({ abi: poolAbi, functionName: "increaseObservationCardinalityNext", args: [OBSERVATIONS] }), "observations");
}

if (!dep.seeded) {
  const [, tickNow] = (await pub.readContract({ address: pool, abi: poolAbi, functionName: "slot0" })) as readonly [bigint, number];
  const sNow = sqrtAtTick(tickNow);
  const [topA, topB] = range(TOP_LOW, TOP_HIGH);
  const [bidA, bidB] = range(BIDS_LOW, TOP_LOW);
  const sTopA = sqrtAtTick(topA), sTopB = sqrtAtTick(topB), sBidA = sqrtAtTick(bidA), sBidB = sqrtAtTick(bidB);

  // Thin band: liquidity sized so PUSH_MON of WMON moves the price from now to TOP_LOW. WMON as token0 moves the
  // sqrt price down (dx = L(1/sLow - 1/sNow)); as token1 it moves it up (dy = L(sHigh - sNow)).
  const push = PUSH_MON * 1e18;
  const lTop = wmonIsToken0 ? push / (1 / sTopA - 1 / sNow) : push / (sTopB - sNow);
  // Bid band holds only aUSD: as token1 below the price (dy = L(sB - sA)); as token0 above it (dx = L(1/sA - 1/sB)).
  const bids = BIDS_AUSD * 1e6;
  const lBid = wmonIsToken0 ? bids / (sBidB - sBidA) : bids / (1 / sBidA - 1 / sBidB);

  const wmonNeeded = parseEther("0.25");
  const held = (await pub.readContract({ address: wmon, abi: wmonAbi, functionName: "balanceOf", args: [account.address] })) as bigint;
  if (held < wmonNeeded) await send(wmon, encodeFunctionData({ abi: wmonAbi, functionName: "deposit" }), "wrap MON", wmonNeeded - held);
  await send(wmon, encodeFunctionData({ abi: wmonAbi, functionName: "approve", args: [seeder, 2n ** 256n - 1n] }), "approve WMON to seeder");
  await send(AUSD, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [seeder, 2n ** 256n - 1n] }), "approve aUSD to seeder");
  await send(seeder, encodeFunctionData({ abi: seederAbi, functionName: "mint", args: [pool, topA, topB, BigInt(Math.floor(lTop))] }), "mint thin band");
  await send(seeder, encodeFunctionData({ abi: seederAbi, functionName: "mint", args: [pool, bidA, bidB, BigInt(Math.floor(lBid))] }), "mint bid band");
  dep.seeded = "true";
  dep.bands = JSON.stringify({ top: [topA, topB], bids: [bidA, bidB] });
  save();
}

const liq = await pub.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" });
const [, tick] = (await pub.readContract({ address: pool, abi: poolAbi, functionName: "slot0" })) as readonly [bigint, number];
const poolAusd = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [pool] });
const poolWmon = await pub.readContract({ address: wmon, abi: erc20Abi, functionName: "balanceOf", args: [pool] });
if (liq === 0n || poolAusd === 0n) throw new Error("pool has no active liquidity or no aUSD");
const human = wmonIsToken0 ? 1.0001 ** tick * 1e12 : 1e12 / 1.0001 ** tick;
console.log(JSON.stringify({ chainId, wmon, factory, router, enforcer, planBook, pool, wmonIsToken0, tick, price: human.toFixed(5), activeLiquidity: String(liq), poolAusd: String(poolAusd), poolWmon: String(poolWmon) }));
console.log(`deployer balance after: ${(await pub.getBalance({ address: account.address })) / 10n ** 15n} mMON`);
