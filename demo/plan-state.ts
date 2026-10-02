// Reads a holder's plans back from chain: end date in the signed Timestamp caveat, revoked or not, which sales
// happened, and what WMON and router allowance the account still holds.   bun run demo/plan-state.ts <holder>
import { type Address, createPublicClient, http } from "viem";
import { keeperApi } from "../web/lib/api";
import { TESTNET, abis, decodeDelegation, decodeTranches, tickToPrice } from "../web/lib/plan";

const holder = process.argv[2] as Address;
if (!/^0x[0-9a-fA-F]{40}$/.test(holder ?? "")) throw new Error("usage: plan-state.ts <holder>");
process.env.NEXT_PUBLIC_KEEPER_API ??= "https://tripwire-three.vercel.app";
const pub = createPublicClient({ transport: http(TESTNET.rpc, { retryCount: 6, retryDelay: 700 }) });
const { plans } = await (await fetch(`${process.env.NEXT_PUBLIC_KEEPER_API}/api/plans?holder=${holder}`)).json() as Awaited<ReturnType<typeof keeperApi.plans>>;
if (plans.length === 0) throw new Error(`no plans for ${holder}`);
for (const p of plans) {
  const d = decodeDelegation(p.delegation);
  const { recipient, tranches } = decodeTranches(d.caveats[0].terms);
  const expiry = Number(BigInt(`0x${d.caveats[1].terms.slice(-32)}`));
  const revoked = await pub.readContract({ address: TESTNET.delegationManager, abi: abis.delegationManager, functionName: "disabledDelegations", args: [p.delegationHash] });
  const spent: boolean[] = [];
  for (let i = 0; i < tranches.length; i++) spent.push(await pub.readContract({ address: TESTNET.enforcer, abi: abis.enforcer, functionName: "spent", args: [p.delegationHash, BigInt(i)] }));
  console.log(JSON.stringify({
    plan: p.id,
    endsAt: new Date(expiry * 1000).toISOString(),
    revoked,
    keeper: d.delegate,
    paysOnlyHolder: recipient.toLowerCase() === holder.toLowerCase(),
    sales: tranches.map((t, i) => ({ line: Number(tickToPrice(t.lineTick).toFixed(5)), mon: Number(t.amountIn) / 1e18, floorPerMon: Number(t.minOutPerUnit) / 1e6, sold: spent[i] })),
  }));
}
const wmon = await pub.readContract({ address: TESTNET.wmon, abi: abis.wmon, functionName: "balanceOf", args: [holder] });
const allowance = await pub.readContract({ address: TESTNET.wmon, abi: abis.wmon, functionName: "allowance", args: [holder, TESTNET.router] });
console.log(JSON.stringify({ wmonHeld: Number(wmon) / 1e18, routerAllowance: Number(allowance) / 1e18, mon: Number(await pub.getBalance({ address: holder })) / 1e18 }));
