# tripwire

Let a bot sell for you. The chain makes sure it can only make the sale you signed.

You sign one plan with a passkey: sell this much MON if the price falls to my line, never below this floor, only to my address, until this date. A keeper watches the Uniswap V3 pool and makes the sale when the line is crossed. Your MON stays in your own wallet until that moment. The keeper is untrusted by design, because the price trigger, the floor, the amount and the payout address live inside the permission you signed, and Monad checks every one of them on each sale. To prove it, the live keeper turns on its own users' plans when asked: press Try to cheat and it sends a sale the plan forbids, and every one of those sales has reverted on chain.

Live on Monad mainnet with real MON: https://tripwire-three.vercel.app/?net=mainnet. The same app runs on Monad testnet at https://tripwire-three.vercel.app with free test MON.

## Why it is different

A typical trading bot gets your key, a blanket token approval, or a deposit, and then you trust its server to sell at the right moment and to the right place. tripwire turns that trust into a contract check. The plan is a MetaMask delegation carrying `TripwirePlanEnforcer`, a caveat enforcer that reads the pool's 60 second TWAP on every redemption. A sale that is early, under the floor, for a different amount, to a different address, or after the end date reverts before a single token moves.

| | Typical trading bot | tripwire |
|---|---|---|
| Who holds the tokens | the bot's wallet, a deposit contract, or a key you exported | your own address, upgraded in place through EIP-7702 |
| What decides when to sell | the bot's server | the pool's 60 s TWAP, read on chain inside the permission at the moment of the sale |
| What stops a bad sale | the bot's own code and good intentions | `TripwirePlanEnforcer` reverts it: line, floor, exact amount, recipient, once per tranche, plus MetaMask's `TimestampEnforcer` for the end date |
| If the bot is hacked | the attacker inherits everything the key or approval reaches | the attacker holds a keeper key that can only make the sales you signed, to you, at your prices |
| Payout address | whatever the bot sends | the holder, written into the signed terms |
| Router allowance | often unlimited | exactly the plan's total |
| Proof | a dashboard | 64 forbidden sales sent by our own keeper on testnet and mainnet, 64 reverted, 0 paid out, each a public transaction (keeper API, read 2026-10-14 00:04 UTC) |

People asked for this by name. On 2026-08-24 a MON holder posted that they wanted "a real spot stop-loss" on a Monad DEX that keeps MON in their own wallet and sells to USDC automatically, with no exchange in the middle ([X](https://x.com/fine_tec_/status/2091984014424821959), [r/Monad](https://www.reddit.com/r/Monad/comments/1vxe6ha/)). tripwire is that, for self-custody holders who want a stop-loss without handing a bot their keys.

## See it in 90 seconds

- **Mainnet:** https://tripwire-three.vercel.app/?net=mainnet runs against Monad's WMON/USDC Uniswap V3 pool. The first mainnet plan sold 0.3 MON for 0.007267 USDC to its holder in [`0xb2989ce6…`](https://monadvision.com/tx/0xb2989ce6fdef893c5fc63ee5fcf4b56666861a208d3e8845ba40c619c615007b), above its 0.007101 floor, and three hostile sales against it reverted.
- **Testnet:** https://tripwire-three.vercel.app with free test MON. A passkey is the wallet, so there is no extension and no seed phrase.
- **Try to cheat:** after a plan is signed, press Try to cheat on the Watch tab. The keeper sends a sale your plan forbids (too early, under the floor, to itself) and the page shows the revert reason read from the mined transaction.
- **Live totals**, read 2026-10-14 00:04 UTC:
  - testnet: `curl -s https://tripwire-three.vercel.app/api/recent | jq .totals` returns 40 plans, 37 sales, 61 forbidden sales sent, 61 reverted, 0 paid out
  - mainnet: `curl -s https://tripwire-three.vercel.app/api/mainnet/recent | jq .totals` returns 1 plan, 1 sale, 3 forbidden sales sent, 3 reverted, 0 paid out

![tripwire architecture](docs/architecture.png)

[Open the interactive diagram](docs/architecture.html) · [The caveat, check by check](docs/how-it-works.md) · [Try it in three steps](docs/try-it.md)

## The 90-second loop

1. Open the site. The first screen shows the keeper's heartbeat, the pool's 60 second average, mainnet spot, and the Perpl position line 1 hedges (account 5429, market 10, long 5753 MON lots).
2. Pick a preset (-5%, -10%, -20%) or open a plan link such as `?sell=0.02@up0.03/0.028`. Each row is a line and a floor in aUSD per MON.
3. Create a passkey wallet. Press Get 0.1 testnet MON.
4. Press Sign plan. One passkey prompt wraps the planned MON, upgrades the address through EIP-7702, signs the delegation and posts it to PlanBook.
5. Watch the keeper. A row whose line is crossed sells once, to your address, at or above its floor, and the sale links to its transaction. A row that is not crossed stays unsold.
6. Press Try to cheat. The keeper sends a sale your plan forbids, the enforcer reverts it, and the Watch tab shows the reason read from the mined transaction.
7. Revoke any time, then turn WMON back into MON.

## How it works

The plan is one MetaMask delegation (DelegationManager v1.3.0, deployed on Monad) from the holder to the keeper, with two caveats:

1. `TripwirePlanEnforcer` ([contracts/src/TripwirePlanEnforcer.sol](contracts/src/TripwirePlanEnforcer.sol)), carrying the plan as its terms: router, pool, WMON, stablecoin, fee, TWAP window, recipient, the Perpl account, market and position size the plan hedges, and up to 16 tranches `(lineTick, amountIn, minOutPerUnit, atOrAbove)`. Before every redemption it checks that the call is the router's `exactInputSingle` WMON to stablecoin swap with zero native value, that the recipient is the holder, that the amount is exactly the tranche's, that the minimum out pays at least the floor, and that the pool's TWAP, oriented as MON's price, is at or below the line for a stop (`Tripwire:above-line` otherwise) or at or above it for a target (`Tripwire:below-line` otherwise). Each tranche fills once per delegation hash, and only the DelegationManager may call the hook, so a stranger has no way to burn a holder's tranches.
2. MetaMask's `TimestampEnforcer`, with the plan's end date.

The holder's address becomes MetaMask's stateless DeleGator through EIP-7702, so MON stays at the holder's own address until a sale, and the same transaction approves the router for exactly the plan's total. A Category Labs Mera passkey is the wallet. `PlanBook` ([contracts/src/PlanBook.sol](contracts/src/PlanBook.sol)) publishes signed plans so any keeper can find them; only the holder can post their own plan, and posting grants nothing beyond what the enforcer already bounds.

The keeper ([keeper/keeper.ts](keeper/keeper.ts)) indexes PlanBook and fills, reads the TWAP every two seconds, and redeems a tranche only after Monad's own gas estimate says the chain will accept it. It holds no judgment the chain does not re-check, its key only pays gas, and it charges the holder nothing. It serves the web app's read API from memory and, on request, turns hostile on purpose so the holder can watch the contract refuse a forbidden sale.

The web app (web/) is a static export with zero serverless functions. Vercel's CDN rewrites `/api/*` to the keeper. It reads the hedged Perpl position from Perpl's exchange contract on Monad mainnet.

The full check order, every revert string, the delegation flow and the attack catalogue with mainnet transactions are in [docs/how-it-works.md](docs/how-it-works.md).

## Built for Monad

- **TWAP-gated sales settle in Monad's 400 ms blocks.** The keeper reads the price every two seconds and a crossed line is a mined sale moments later, with the TWAP check running inside the same transaction.
- **Plans sell WMON, by design.** Monad's reserve balance rule stops a delegated account under 10 MON from spending native value, so setup wraps the planned MON in a plain transaction first, the EIP-7702 transaction that follows moves no MON, and the enforcer requires zero native value on every sale.
- **Gas from Monad's own estimate.** Monad charges the full gas limit, so the keeper sizes every fill with `eth_estimateGas` plus 20% rather than a guess. A fill costs about 407k gas on Monad testnet against 289k on an Ethereum-priced fork.
- **The keeper pays the gas and takes no fee.** The holder's sale proceeds arrive whole.
- **Same contracts, both networks.** Testnet has its own Uniswap V3 factory and SwapRouter02, deployed from Uniswap's published npm artifacts (the router's pool init-code hash matches the published pool bytecode) with a WMON/aUSD pool. The same enforcer and keeper point at Monad mainnet's WMON/USDC pool by address.

## What comes next

- **Open executors.** The next enforcer lets any address fill a crossed line, so a plan sells even when our keeper is offline, and the enforcer stays the only judge of the sale.
- **More pairs.** The enforcer already takes the pool, the stablecoin and the fee as signed terms, so on chain each new Monad pool is a new plan, not a new contract.
- **Holder onboarding.** Plan links prefilled with each holder's own numbers, sent to the people already writing exit plans by hand.

## Contracts on Monad mainnet (chain 143)

Read from contracts/deployments/143.json; bytecode at both addresses matches the compiled contracts (`cast code` against https://rpc1.monad.xyz).

| Contract | Address |
|---|---|
| TripwirePlanEnforcer | `0x4c594690108f808d9e5603df548740b22e82703e` (deployed at block 113042447, tx `0x4cd0069d11b5932aba49902ed34ac2f0305a1595d1cae1b9f8173fb4a0a571b4`) |
| PlanBook | `0xa3157a5a011404a70c033834a19826a9628e6928` (block 113042454, tx `0x4383696d693f402379be2770eaf3a6f8e51025f2946b51d3ebcfdc8def0805f9`) |
| DelegationManager (MetaMask v1.3.0) | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| WMON/USDC pool (Uniswap V3, 0.3%) | `0x659bD0BC4167BA25c62E05656F78043E7eD4a9da` |
| SwapRouter02 | `0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900` |

## Contracts on Monad testnet (chain 10143)

Read from contracts/deployments/10143.json and confirmed with `cast code` against https://testnet-rpc.monad.xyz.

| Contract | Address |
|---|---|
| TripwirePlanEnforcer (current) | `0xc603753555255ca5bcde5361625a1a130201df80` |
| PlanBook (current) | `0xb57a6f17261579455ff4869e729c9e74f1753382` |
| WMON/aUSD pool (Uniswap V3, 0.3%) | `0x75E6B52BF8AEFFa56908b6C565944Db9D4C638F5` |
| SwapRouter02 | `0x13c320c4488d4e18ea85e11c46b0d6d29a335e96` |
| WMON | `0x4c594690108f808d9e5603df548740b22e82703e` |
| Uniswap V3 factory | `0xa3157a5a011404a70c033834a19826a9628e6928` |

Earlier enforcer and PlanBook pairs (`0xc66cc7b7...` / `0x6a1fcb21...`, `0x9643f0ab...` / `0xdd26f523...`, `0x754ef1eb...` / `0x30ee5d42...`) stay readable and fillable, so every plan signed against them still shows its sales and refusals.

## Proof

| Claim | Proof |
|---|---|
| Full lifecycle on Monad mainnet with real MON | holder `0xDc53288B21C4B6E9C3de5f862B9638b7AC0a00ad`, plan of two rows (0.3 MON at a line of 0.02479, 0.2 MON stop at 0.02187): plan armed `0xe496d6cd2534847503746ef0a9d7615452235a95048a3152e7ff3d252ca8708a` (block 113073215); keeper sale `0xb2989ce6fdef893c5fc63ee5fcf4b56666861a208d3e8845ba40c619c615007b` (status success, block 113073240) sold exactly 0.3 MON and paid 0.007267 USDC to the holder, above its 0.007101 floor; the 0.2 MON stop stayed unsold; revoke `0xd3980d11accb41bb5b3a395c3be3b0c3b31817090ef22e67e6174219d86d5866`. Evidence in demo/runs/mainnet-demo-2026-10-13T15-13-53-347Z.json |
| A hostile keeper is refused on Monad mainnet | `Tripwire:above-line` `0x31de32af5dc239fe69b5890348364f831f0c75c4dc06f3c0f86e07f2c194d951`, `Tripwire:min-out` `0x95afd4e0977b977893ae941ce5b77a94ab61f2745f0d89e6e97d01da9de78fb6`, `Tripwire:recipient` `0x2acd2cd19571cf7c4a51cef6a660402038f583a9bc675daf852cef37875c860e` (all status failed, blocks 113073332 to 113073386). `curl -s https://tripwire-three.vercel.app/api/mainnet/recent` returns 3 forbidden sales sent, 3 reverted, 0 paid out |
| The enforcer holds under a hostile keeper | `cd contracts && forge test --fork-url https://rpc1.monad.xyz --fork-block-number 109704919 --fork-retries 12 --fork-retry-backoff 2000`: 19 tests against a Monad mainnet fork with the real DelegationManager, SwapRouter02 and WMON/USDC pool, including 6 fuzz properties at 512 runs each (never other than the tranche amount, never below the floor, never to anyone else, a stop only at or below its line, a target only at or above its line, never more than the plan). Re-run on 2026-10-13: 19 passed, 0 failed. |
| Each guard is load-bearing | Deleting any one guard turns its tests red: logs in contracts/results/ (`mutant-above-line.txt`, `mutant-amount.txt`, `mutant-min-out.txt`, `mutant-recipient.txt`, `mutant-spent.txt`, `mutant-target-as-stop.txt`, `mutant-target-check.txt`, `mutant-value.txt`) |
| The keeper sells a crossed line | tx `0xc80cd805f0e1f88e743609d891a991ed9e68bdd1bd81a246ff4568049999aadf`, status success at block 67518777 |
| A target sells at or above its line | plan 9 sold at a 60 s average of 0.03300 against its 0.03234 target. The keeper's early try on an unreached target reverted `Tripwire:below-line`: `0x22dc276807f75419a5a60248c353127be0ea4b22b3b2e021d9df1cde577646ed` (status failed) |
| Refused on chain, reasons read from the mined transactions | `Tripwire:above-line` `0x819043c97c4c814482cf23858bbfd88d76a697d0c75369ea39b028be9aef1bf5`, `Tripwire:min-out` `0x5053789a5c74addef0a92d3ff7e166d53dee0a457d0993d76dddb19ec4ac2c82`, `Tripwire:recipient` `0xa962ac8e8e8b9cbc5fb31db42f75835fc975b3dedbd40b7866b337600ebab478` (all status failed) |
| Full lifecycle on the current contracts | holder `0xd661b663c2E9fC4F7a07563dE9Fb97Ca345fB05d`: setup `0xdfc2783a3924c0b1c31598e0e1a1f158c42e074c881382632c43686c491cf026`, keeper fill `0x651e1ffa620c6c876483bd4768d4e2fdb4c24955b011c4f4dab83195ea67df6d` (sold exactly 0.005 WMON, status success at block 69245479), an uncrossed stop left unspent for 50.6 s, then revoke `0xc5814914c81965f0ac524798f9f0983e7d5ae80254a540d2af8a26b39c5fa2de`. Evidence in demo/runs/lifecycle-10143-2026-10-08T11-42-02-641Z.json |
| Eighteen holder flows click-tested on the live site | passkey, plan from a link, presets, custom end date, keeper sale, three refused cheats, revoke, unwrap, returning sign-in, keeper heartbeat, at 1440 and 390 px. Listed in docs/feature-matrix.md, logged in demo/runs/ |
| Any holder's plan reads back from chain | `bun run demo/verify-live.ts <holder> --attack` |
| The live keeper is running | `curl -s https://tripwire-three.vercel.app/api/status` returns `loopError: null`, the pool's TWAP and mainnet spot. `curl -s https://tripwire-three.vercel.app/api/recent` returns the plans with their sales and refusals; on 2026-10-14 at 00:04 UTC it listed 40 plans, 37 sales, 61 forbidden sales sent and 61 reverted, 0 paid out. The mainnet keeper answers at `/api/mainnet/status`, and `/api/mainnet/recent` listed 1 plan, 1 sale, 3 forbidden sales sent, 3 reverted, 0 paid out at the same read |

## Run it

```
# contracts: tests against a Monad mainnet fork
cd contracts && forge test --fork-url https://rpc1.monad.xyz --fork-block-number 109704919 --fork-retries 12 --fork-retry-backoff 2000

# web: static export; the keeper API is same-origin in production, set NEXT_PUBLIC_KEEPER_API for local use
cd web && bun install && bun test lib && NEXT_PUBLIC_KEEPER_API=https://<keeper-host> bunx next build

# keeper: needs a funded testnet key in ~/.config/tripwire/keeper.json ({"keeper":"0x..."})
cd web && bun install && cd .. && bun run keeper/keeper.ts

# prove any holder's plan from chain, and replay the hostile calls
bun run demo/verify-live.ts <holder> --attack
```

`scripts/build-static.sh` builds the zero-function Vercel bundle with the `/api` rewrite to the keeper.

## Layout

- `contracts/` Solidity (TripwirePlanEnforcer, PlanBook, PoolSeeder, WMON), forge tests, mutation logs, `deployments/10143.json`
- `keeper/` the keeper loop and its launchd unit
- `web/` Next.js static export: ticket, chart, Watch tab, passkey wallet, Perpl position read
- `demo/` live proofs: `verify-live.ts`, lifecycle and hostile runs, run logs
- `docs/` how it works, feature matrix, architecture diagram, try-it steps
- `scripts/` static build
