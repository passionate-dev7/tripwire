// QA only, localhost only: funds a freshly created passkey address with testnet MON from the deployer during a
// scripted browser click-through, standing in for faucet.monad.xyz (whose Turnstile needs a person).
//   bun run demo/qa-fund-server.ts        listens on 127.0.0.1:3531, POST /fund?addr=0x...  (0.25 MON cap per address)
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FEES, clients } from "../web/lib/holder";
import { TESTNET } from "../web/lib/plan";

const keys = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), ".keys.json"), "utf8")) as { deployer: Hex };
const { chain, pub } = clients(TESTNET);
const wallet = createWalletClient({ account: privateKeyToAccount(keys.deployer), chain, transport: http(TESTNET.rpc) });
const funded = new Set<string>();
const cors = { "access-control-allow-origin": "http://localhost:3530" };
Bun.serve({
  hostname: "127.0.0.1",
  port: 3531,
  async fetch(req) {
    const addr = new URL(req.url).searchParams.get("addr") ?? "";
    if (req.method !== "POST" || !/^0x[0-9a-fA-F]{40}$/.test(addr) || funded.has(addr.toLowerCase())) return new Response("no", { status: 400, headers: cors });
    funded.add(addr.toLowerCase());
    const hash = await wallet.sendTransaction({ to: addr as Address, value: parseEther("0.25"), ...FEES });
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(`funded ${addr} ${hash} ${r.status}`);
    return new Response(JSON.stringify({ hash, status: r.status }), { headers: { ...cors, "content-type": "application/json" } });
  },
});
console.log("qa fund server on 127.0.0.1:3531");
