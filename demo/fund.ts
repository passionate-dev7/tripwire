// Sends testnet MON from the deployer to a holder (a QA passkey address, or an outside holder who asked).
//   bun run demo/fund.ts <address> [mon, default 0.25]
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FEES, clients } from "../web/lib/holder";
import { TESTNET } from "../web/lib/plan";

const [to, mon = "0.25"] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "") || Number(mon) > 1) throw new Error("usage: fund.ts <address> [mon <= 1]");
const keys = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), ".keys.json"), "utf8")) as { deployer: Hex };
const { chain, pub } = clients(TESTNET);
const hash = await createWalletClient({ account: privateKeyToAccount(keys.deployer), chain, transport: http(TESTNET.rpc) }).sendTransaction({ to: to as Address, value: parseEther(mon), ...FEES });
const r = await pub.waitForTransactionReceipt({ hash });
console.log(`fund ${to} ${mon} MON ${hash} ${r.status}; balance ${formatEther(await pub.getBalance({ address: to as Address }))}`);
