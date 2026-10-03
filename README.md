# tripwire

An exit plan for your MON that a compromised keeper cannot break.

A holder writes up to three sales (how much MON, the price line, the floor), each one a stop (sell once MON falls to the line) or a target (sell once MON rises to it), signs once with a passkey, and a keeper sells each one when MON's 60 second average reaches its line. The keeper is allowed exactly that and nothing else: the contract refuses a sale before its line is reached, for less than the floor, of any amount other than the one signed, a second time, or paid to anyone but the holder.

Live on Monad testnet: https://tripwire-three.vercel.app

## How it works

The plan is one MetaMask delegation (DelegationManager v1.3.0, already deployed on Monad) from the holder to the keeper, carrying two caveats:

1. `TripwirePlanEnforcer` (contracts/src/TripwirePlanEnforcer.sol), with the plan as its terms: router, pool, WMON, stablecoin, fee, TWAP window, recipient, and the tranches `(lineTick, amountIn, minOutPerUnit, atOrAbove)`. Before every redemption it checks that the call is the router's `exactInputSingle` WMON to stablecoin swap, that the recipient is the holder, that the amount is exactly the tranche's, that the minimum out pays at least the floor, and that the pool's 60 s TWAP, oriented as MON's price, is at or below the line for a stop (`Tripwire:above-line` otherwise) or at or above it for a target (`Tripwire:below-line` otherwise). Each tranche fills once, recorded per delegation hash.
2. MetaMask's `TimestampEnforcer`, with the plan's end date.

The holder's address becomes MetaMask's stateless DeleGator through EIP-7702, so MON stays in the holder's own address until a sale. A Category Labs Mera passkey is the wallet: one prompt signs the plan and the account upgrade. `PlanBook` (contracts/src/PlanBook.sol) publishes signed plans so any keeper can find them.

The keeper (keeper/keeper.ts) indexes plans and fills, reads the TWAP every two seconds, and redeems a tranche only after Monad's own gas estimate says the chain will accept it. It also serves the web app's API from memory, and on request it turns hostile on purpose, sending a forbidden sale so the holder can watch the contract refuse it.

## Built for Monad

- Plans sell WMON, not native MON. Monad's reserve balance rule stops a delegated account under 10 MON from spending native value, so setup wraps the planned MON in a plain transaction first, and the EIP-7702 transaction that follows moves no MON.
- Gas limits come from Monad's `eth_estimateGas`. A fill costs about 407k gas on Monad testnet against 289k on an Ethereum-priced fork, and Monad charges the full limit.
- On testnet, where Uniswap V3 has no deployment, the factory and SwapRouter02 are deployed from Uniswap's published npm artifacts (the router's pool init-code hash matches the published pool bytecode) with a WMON/aUSD pool. The same enforcer and keeper point at Monad mainnet's WMON/USDC pool by address.

## Evidence

- 16 tests against a Monad mainnet fork with the real DelegationManager, SwapRouter02 and WMON/USDC pool, including 6 fuzz properties at 512 runs each: never other than the tranche amount, never below the floor, never to anyone else, a stop only at or below its line, a target only at or above its line, never more than the plan. Deleting any one of the guards turns its tests red (contracts/results/).
- First keeper sale on testnet: `0xc80cd805f0e1f88e743609d891a991ed9e68bdd1bd81a246ff4568049999aadf`.
- A target sale on testnet: plan 9 sold at a 60 s average of 0.03300 against its 0.03234 target, and the keeper's early try on an unreached target reverted `Tripwire:below-line` (`0x22dc276807f75419a5a60248c353127be0ea4b22b3b2e021d9df1cde577646ed`).
- Refused on chain, reasons read from the mined transactions: `Tripwire:above-line` `0x819043c97c4c814482cf23858bbfd88d76a697d0c75369ea39b028be9aef1bf5`, `Tripwire:min-out` `0x5053789a5c74addef0a92d3ff7e166d53dee0a457d0993d76dddb19ec4ac2c82`, `Tripwire:recipient` `0xa962ac8e8e8b9cbc5fb31db42f75835fc975b3dedbd40b7866b337600ebab478`.
- Eighteen holder flows click-tested on the live site at 1440 and 390 px (passkey, plan from a link, presets, custom end date, keeper sale, three refused cheats, revoke, unwrap, returning sign-in, keeper heartbeat), listed in docs/feature-matrix.md, logged in demo/runs/ and read back from chain by `demo/verify-live.ts`. The first screen shows the keeper's heartbeat and how many more sales its gas pays for.

Testnet addresses (contracts/deployments/10143.json): enforcer `0xc66cc7B7B91B893ABfd0661c0312f6c45eAd056B`, PlanBook `0x6a1fcB214a1C43F53AFb9d31014e1Cdc92Fa593e` (plans before targets live on enforcer `0x9643F0ab360c5e10838E3BDF3a4a203E3c5CFF37` and PlanBook `0xDd26F52338cc714830E23ff6999961bF2503D77A`, and still read and fill), WMON/aUSD pool `0x75E6B52BF8AEFFa56908b6C565944Db9D4C638F5`, SwapRouter02 `0x13c320c4488d4e18ea85e11c46b0d6d29a335e96`.

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
