// Deploys tripwire's two contracts on Monad MAINNET (chain 143): TripwirePlanEnforcer and PlanBook. Everything else
// they touch (DelegationManager, SwapRouter02, the WMON/USDC 0.3% pool) is already deployed there and is only read.
//   bun run script/deploy-mainnet.ts --dry-run      estimate gas against mainnet and print the MON cost, send nothing
//   bun run script/deploy-mainnet.ts                deploy for real (needs the deployer funded)
// RPC: MONAD_MAINNET_RPC_URL, default https://rpc1.monad.xyz. Refuses any chain id but 143.
// Monad charges a transaction's gas LIMIT, not the gas it used, so the limit is the estimate plus a small margin and the
// cost shown is limit x price. The deployer key is read from ../demo/.keys.json (gitignored) and never printed.
// Resumable: a finished step is in deployments/143.json and is skipped on the next run. Each step is checked by its
// receipt status and by code at the address. deployments/143.json is the source the keeper reads; the web app bundles
// web/lib/mainnet.json, written here with the same enforcer, plan book and start block.
import fs from "node:fs";
import path from "node:path";
import {
  type Abi,
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  getContractAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const rpc = process.env.MONAD_MAINNET_RPC_URL ?? "https://rpc1.monad.xyz";
const dryRun = process.argv.includes("--dry-run");

const DELEGATION_MANAGER: Address = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const ROUTER: Address = "0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900";
const POOL: Address = "0x659bD0BC4167BA25c62E05656F78043E7eD4a9da";
const WMON: Address = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
const USDC: Address = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const GAS_MARGIN_PCT = 15n; // on top of eth_estimateGas
const FEE_HEADROOM_NUM = 3n; // maxFeePerGas = gas price x 3/2, only a ceiling: the charge is base fee plus tip
const FEE_HEADROOM_DEN = 2n;
const RESERVE_BUFFER_PCT = 25n; // balance required beyond the planned cost

const keys = JSON.parse(fs.readFileSync(path.join(root, "..", "demo", ".keys.json"), "utf8")) as { deployer: Hex };
const account = privateKeyToAccount(keys.deployer);
const pub = createPublicClient({ transport: http(rpc, { retryCount: 4 }) });
const chainId = await pub.getChainId();
if (chainId !== 143) {
  console.error(`refusing: ${rpc} is chain ${chainId}, this script deploys only to Monad mainnet (143)`);
  process.exit(1);
}
const chain = { id: 143, name: "monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

const outFile = path.join(root, "deployments", "143.json");
const webFile = path.join(root, "..", "web", "lib", "mainnet.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const dep: Record<string, string | number> = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const save = () => {
  fs.writeFileSync(outFile, JSON.stringify(dep, null, 2) + "\n");
  if (dep.enforcer && dep.planBook && dep.planBookFromBlock) {
    fs.writeFileSync(webFile, JSON.stringify({ enforcer: dep.enforcer, planBook: dep.planBook, planBookFromBlock: dep.planBookFromBlock }, null, 2) + "\n");
  }
};

function artifact(rel: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const bytecode = (j.bytecode?.object ?? j.bytecode) as Hex;
  return { abi: j.abi, bytecode: bytecode.startsWith("0x") ? bytecode : (`0x${bytecode}` as Hex) };
}

const gasPrice = await pub.getGasPrice();
const maxFeePerGas = (gasPrice * FEE_HEADROOM_NUM) / FEE_HEADROOM_DEN;
const maxPriorityFeePerGas = 2_000_000_000n;
const nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
const balance = await pub.getBalance({ address: account.address });
const enforcerArt = artifact("out/TripwirePlanEnforcer.sol/TripwirePlanEnforcer.json");
const planBookArt = artifact("out/PlanBook.sol/PlanBook.json");

// The plan book needs the enforcer's address, which the deployer's next CREATE address already determines.
const enforcerAddr = dep.enforcer ? (dep.enforcer as Address) : getContractAddress({ from: account.address, nonce: BigInt(nonce) });
const enforcerData = encodeDeployData({ abi: enforcerArt.abi, bytecode: enforcerArt.bytecode, args: [DELEGATION_MANAGER] });
const planBookData = encodeDeployData({ abi: planBookArt.abi, bytecode: planBookArt.bytecode, args: [DELEGATION_MANAGER, enforcerAddr] });

// eth_estimateGas against mainnet from the deployer, with no fee fields so a zero balance does not cap the estimate.
async function estimate(data: Hex): Promise<bigint> {
  return pub.estimateGas({ account: account.address, data });
}
const limitOf = (est: bigint) => est + (est * GAS_MARGIN_PCT) / 100n;

const estEnforcer = dep.enforcer ? 0n : await estimate(enforcerData);
const estPlanBook = dep.planBook ? 0n : await estimate(planBookData);
const limitEnforcer = limitOf(estEnforcer);
const limitPlanBook = limitOf(estPlanBook);
const costAt = (gas: bigint, price: bigint) => gas * price;
const totalLimit = limitEnforcer + limitPlanBook;
const expected = costAt(totalLimit, gasPrice);
const ceiling = costAt(totalLimit, maxFeePerGas);

console.log(`chain ${chainId} via ${rpc}`);
console.log(`deployer ${account.address} nonce ${nonce} balance ${formatEther(balance)} MON`);
console.log(`gas price ${gasPrice / 10n ** 9n} gwei (fee ceiling ${maxFeePerGas / 10n ** 9n} gwei)`);
console.log(`TripwirePlanEnforcer  estimate ${estEnforcer} limit ${limitEnforcer}${dep.enforcer ? " (already deployed)" : ""}`);
console.log(`PlanBook              estimate ${estPlanBook} limit ${limitPlanBook}${dep.planBook ? " (already deployed)" : ""}`);
console.log(`cost at current price ${formatEther(expected)} MON (gas limit x gas price), at the fee ceiling ${formatEther(ceiling)} MON`);
if (dryRun) {
  console.log("dry run: nothing sent");
  process.exit(0);
}

const need = ceiling + (ceiling * RESERVE_BUFFER_PCT) / 100n;
if (balance < need) {
  console.error(`refusing: deployer holds ${formatEther(balance)} MON, needs ${formatEther(need)} MON (ceiling cost plus ${RESERVE_BUFFER_PCT}%)`);
  process.exit(1);
}

async function send(name: "enforcer" | "planBook", data: Hex, gas: bigint): Promise<Address> {
  const hash = await wallet.sendTransaction({ chain, data, gas, maxFeePerGas, maxPriorityFeePerGas });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000, retryCount: 10 });
  if (r.status !== "success") throw new Error(`${name} deploy reverted: ${hash}`);
  const addr = r.contractAddress as Address;
  const code = await pub.getCode({ address: addr });
  if (!code || code === "0x") throw new Error(`${name}: no code at ${addr}`);
  console.log(`${name}: ${addr} tx ${hash} gas used ${r.gasUsed} of ${gas} at block ${r.blockNumber}`);
  dep[name] = addr;
  dep[`${name}Tx`] = hash;
  dep[`${name}Block`] = Number(r.blockNumber);
  save();
  return addr;
}

if (!dep.enforcer) {
  const addr = await send("enforcer", enforcerData, limitEnforcer);
  if (addr.toLowerCase() !== enforcerAddr.toLowerCase()) throw new Error(`enforcer landed at ${addr}, plan book was built for ${enforcerAddr}`);
}
if (!dep.planBook) await send("planBook", planBookData, limitPlanBook);

// Post-condition only a correct deploy produces: both contracts point at the real DelegationManager and each other.
const read = (address: Address, abi: Abi, functionName: string) => pub.readContract({ address, abi, functionName }) as Promise<Address>;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
if (!same(await read(dep.enforcer as Address, enforcerArt.abi, "delegationManager"), DELEGATION_MANAGER)) throw new Error("enforcer does not name the DelegationManager");
if (!same(await read(dep.planBook as Address, planBookArt.abi, "manager"), DELEGATION_MANAGER)) throw new Error("plan book does not name the DelegationManager");
if (!same(await read(dep.planBook as Address, planBookArt.abi, "enforcer"), dep.enforcer as string)) throw new Error("plan book does not name the enforcer");

Object.assign(dep, {
  chainId: 143,
  delegationManager: DELEGATION_MANAGER,
  router: ROUTER,
  pool: POOL,
  wmon: WMON,
  usdc: USDC,
  deployer: account.address,
  planBookFromBlock: Math.min(Number(dep.enforcerBlock), Number(dep.planBookBlock)),
});
save();
console.log(`wrote ${outFile} and ${webFile}; verify with: cast code ${dep.enforcer} --rpc-url ${rpc} | head -c 20`);
