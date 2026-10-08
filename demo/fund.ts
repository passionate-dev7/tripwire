// Sends a capped testnet gas top-up to the persisted disposable holder.
//   bun run demo/fund.ts <persisted-holder-address> <mon <= 0.2>
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex, createWalletClient, erc20Abi, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FEES, SETUP_GAS_BUDGET, clients } from "../web/lib/holder";
import { TESTNET } from "../web/lib/plan";

const [to, mon] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "") || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(mon ?? "")) throw new Error("usage: fund.ts <persisted-holder-address> <mon <= 0.2>");
const amount = parseEther(mon!);
if (amount <= 0n || amount > parseEther("0.2")) throw new Error("funding amount must be greater than zero and at most 0.2 MON");
const dir = path.dirname(new URL(import.meta.url).pathname);
const keys = JSON.parse(fs.readFileSync(path.join(dir, ".keys.json"), "utf8")) as { deployer: Hex; holder: Hex };
const holder = privateKeyToAccount(keys.holder);
if (holder.address.toLowerCase() !== to!.toLowerCase()) throw new Error("funding target must match the persisted holder key");
const funder = privateKeyToAccount(keys.deployer);
if (funder.address.toLowerCase() === holder.address.toLowerCase()) throw new Error("holder and demo funder must be different accounts");
const ownerLog = path.join(dir, "owners.log");
if (fs.existsSync(ownerLog) && fs.readFileSync(ownerLog, "utf8").split("\n").some((line) => line.toLowerCase().includes(holder.address.toLowerCase()) && line.includes("gas top-up"))) {
  throw new Error("this holder already has a logged gas top-up");
}
const { chain, pub } = clients(TESTNET);
if (await pub.getChainId() !== 10143) throw new Error("funding is allowed only on Monad testnet (chainId 10143)");
const recipient = holder.address as Address;
const [holderBefore, funderBalance, wmon] = await Promise.all([
  pub.getBalance({ address: recipient }),
  pub.getBalance({ address: funder.address }),
  pub.readContract({ address: TESTNET.wmon, abi: erc20Abi, functionName: "balanceOf", args: [recipient] }),
]);
if (wmon < parseEther("0.01")) throw new Error("persisted holder must already have 0.01 WMON; this top-up is gas only");
if (holderBefore + amount < SETUP_GAS_BUDGET + parseEther("0.02")) throw new Error("top-up would leave less than setup gas plus the required reserve");
if (funderBalance < amount + 300_000n * FEES.maxFeePerGas) throw new Error("Tripwire demo funder cannot cover the top-up and gas");

const hash = await createWalletClient({ account: funder, chain, transport: http(TESTNET.rpc) }).sendTransaction({ to: recipient, value: amount, ...FEES });
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000, retryCount: 5 });
if (receipt.status !== "success") throw new Error(`funding reverted: ${hash}`);
const run = new Date().toISOString();
fs.appendFileSync(ownerLog, `${recipient} holder gas top-up ${formatEther(amount)} MON from Tripwire demo deployer, ${run}, ${hash}\n`);
const holderAfter = await pub.getBalance({ address: recipient });
if (holderAfter < holderBefore + amount) throw new Error(`funding receipt succeeded but recipient balance did not increase: ${hash}`);
console.log(JSON.stringify({ chainId: 10143, funder: funder.address, holder: recipient, amount: formatEther(amount), before: formatEther(holderBefore), after: formatEther(holderAfter), hash, status: receipt.status }));
