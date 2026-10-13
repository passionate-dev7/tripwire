// Funds one mainnet demo holder from the keeper, once, with a hard cap.
//   bun run demo/fund-mainnet-holder.ts <holder> <mon>
// Refuses: chain other than 143, amount above CAP_MON, a holder already funded by this script (ledger in
// demo/runs/mainnet-funding.json), or a cumulative total above TOTAL_CAP_MON. The key is read from demo/.keys.json
// and never printed. Post-condition: receipt success and the holder's balance rose by the amount.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, getAddress, http, parseEther, formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CAP_MON = 1.5;
const TOTAL_CAP_MON = 3;
const RPC = process.env.MONAD_MAINNET_RPC_URL ?? "https://rpc1.monad.xyz";
const here = path.dirname(new URL(import.meta.url).pathname);
const ledgerFile = path.join(here, "runs", "mainnet-funding.json");

const [holderArg, monArg] = process.argv.slice(2);
if (!holderArg || !monArg) throw new Error("usage: fund-mainnet-holder.ts <holder> <mon>");
const holder = getAddress(holderArg);
const mon = Number(monArg);
if (!(mon > 0) || mon > CAP_MON) throw new Error(`amount must be in (0, ${CAP_MON}] MON`);

const ledger: { holder: string; mon: number; tx: string; at: string }[] = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : [];
if (ledger.some((e) => e.holder === holder)) throw new Error(`${holder} was already funded by this script`);
const spent = ledger.reduce((s, e) => s + e.mon, 0);
if (spent + mon > TOTAL_CAP_MON) throw new Error(`cumulative cap ${TOTAL_CAP_MON} MON would be exceeded (already ${spent})`);

const keys = JSON.parse(fs.readFileSync(path.join(here, ".keys.json"), "utf8")) as { keeper: Hex };
const account = privateKeyToAccount(keys.keeper);
const chain = { id: 143, name: "Monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4 }) });
if ((await pub.getChainId()) !== 143) throw new Error("not Monad mainnet");
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const before = await pub.getBalance({ address: holder });
const hash = await wallet.sendTransaction({ to: holder, value: parseEther(String(mon)), gas: 21000n });
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
if (receipt.status !== "success") throw new Error(`funding tx ${hash} reverted`);
const after = await pub.getBalance({ address: holder });
if (after - before !== parseEther(String(mon))) throw new Error(`balance moved by ${formatEther(after - before)}, expected ${mon}`);

fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
ledger.push({ holder, mon, tx: hash, at: new Date().toISOString() });
fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
console.log(JSON.stringify({ holder, mon, tx: hash, block: String(receipt.blockNumber), holderBalance: formatEther(after) }));
