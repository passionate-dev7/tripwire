# How tripwire works

tripwire puts a stop-loss inside a permission. The holder signs one MetaMask delegation to a keeper, and the delegation carries `TripwirePlanEnforcer`, a caveat enforcer that re-checks the whole plan, price included, every time the keeper tries to use it. The keeper decides only *when to try*. Whether a sale happens is decided by the enforcer, inside the transaction, against terms the holder signed.

Source: [contracts/src/TripwirePlanEnforcer.sol](../contracts/src/TripwirePlanEnforcer.sol), [contracts/src/PlanBook.sol](../contracts/src/PlanBook.sol), [keeper/keeper.ts](../keeper/keeper.ts), [web/lib/plan.ts](../web/lib/plan.ts), [web/lib/holder.ts](../web/lib/holder.ts).

## The plan as signed terms

The enforcer's terms are one ABI-encoded struct, covered by the holder's delegation signature:

| Field | Meaning |
|---|---|
| `router`, `pool`, `wmon`, `usdc`, `fee` | the one Uniswap V3 route a sale may take (SwapRouter02, the WMON/stablecoin pool, its fee tier) |
| `twapSeconds` | the price window; plans use 60 seconds |
| `recipient` | the holder's own address, the only place proceeds may go |
| `perplAccountId`, `perplMarketId`, `perplPositionLots` | the Perpl position reference recorded with the plan |
| `tranches[]` | 1 to 16 rows of `(lineTick, amountIn, minOutPerUnit, atOrAbove)`: the line as a price tick, the exact WMON to sell, the floor in stablecoin units per 1 WMON, and whether the row is a stop (falls to the line) or a target (rises to it) |

The second caveat is MetaMask's stock `TimestampEnforcer`, carrying the plan's end date.

Editing any term after signing changes the delegation hash and breaks the signature, so the DelegationManager rejects the redemption outright (`test_terms_edited_after_signing_revert`).

## The checks, in the order they run

`beforeHook` runs on every redemption, before the DelegationManager executes the swap from the holder's account. Each line below is a `require`; the string is the revert reason a block explorer or `cast` shows.

| # | Check | Revert reason |
|---|---|---|
| 1 | The caller is MetaMask's DelegationManager. The hook writes storage, so this keeps strangers from burning a holder's tranches. | `Tripwire:only-manager` |
| 2 | Execution mode is a single call. | `Tripwire:mode` |
| 3 | The plan names a Perpl account and market. | `Tripwire:perpl-position` |
| 4 | The plan has between 1 and 16 tranches. | `Tripwire:plan-size` |
| 5 | The keeper's unsigned argument is exactly one 32-byte tranche index. | `Tripwire:args` |
| 6 | That index exists in the plan. | `Tripwire:index` |
| 7 | That tranche has not filled under this delegation hash. The enforcer marks it spent here; a revert anywhere later rolls the mark back. | `Tripwire:spent` |
| 8 | The execution is long enough to hold a target, a value and `exactInputSingle` calldata. | `Tripwire:exec-length` |
| 9 | The call goes to the signed router. | `Tripwire:target` |
| 10 | The function is `exactInputSingle` (`0x04e45aaf`). | `Tripwire:selector` |
| 11 | The calldata is exactly one `exactInputSingle` struct, nothing appended. | `Tripwire:calldata-length` |
| 12 | Native value is zero. WMON moves as an ERC-20, so Monad's reserve balance rule never applies to a sale. | `Tripwire:value` |
| 13 | The route is WMON in, the signed stablecoin out, at the signed fee. | `Tripwire:route` |
| 14 | The swap pays the holder. | `Tripwire:recipient` |
| 15 | `amountIn` equals the tranche amount, to the wei. | `Tripwire:amount` |
| 16 | `amountOutMinimum × 1e18 ≥ amountIn × minOutPerUnit`, so the router itself reverts any fill under the floor and a sandwich has nothing to take. | `Tripwire:min-out` |
| 17 | The pool's TWAP over `twapSeconds`, oriented as MON's price, is at or below `lineTick` for a stop... | `Tripwire:above-line` |
| 17b | ...or at or above `lineTick` for a target. Both bounds are inclusive. | `Tripwire:below-line` |

When every check passes the enforcer emits `TrancheFilled(delegationHash, recipient, index, amountIn, amountOutMinimum, priceTick)`, and the DelegationManager runs the swap. MetaMask's `TimestampEnforcer` adds one more refusal after the end date: `TimestampEnforcer:expired-delegation`.

### The price check

`monPriceTick` calls `observe([twapSeconds, 0])` on the pool and takes the arithmetic mean tick over the window, rounded toward negative infinity, exactly as Uniswap's own oracle library does. Uniswap prices token1 in token0, so when WMON sorts after the stablecoin the enforcer negates the tick; a higher number always means a higher MON price. The price comes from the same pool the sale executes in, read at the moment of the sale, so the trigger and the fill describe one market at one instant. Moving a 60 second average means holding the pool off its price across many blocks, and the floor in check 16 bounds the fill price on top of that.

## The delegation flow

1. **Sign.** In the browser the holder's Category Labs Mera passkey signs the delegation: delegate is the keeper, delegator is the holder's own address, caveats are the enforcer with the plan and the `TimestampEnforcer` with the end date.
2. **Wrap.** A plain transaction wraps the planned MON into WMON. It goes first and alone because Monad's reserve balance rule stops a delegated account under 10 MON from spending native value.
3. **Upgrade, approve, post.** One transaction carries the EIP-7702 authorization that makes the holder's address MetaMask's stateless DeleGator. In the same batch the address approves SwapRouter02 for exactly the plan's total and posts the signed delegation to `PlanBook`. The address, its history and its tokens stay where they are.
4. **Publish.** `PlanBook.post` accepts only the delegator's own plan (`PlanBook:not-delegator`), only one whose first caveat is the tripwire enforcer (`PlanBook:enforcer`), and only once (`PlanBook:duplicate`). The full delegation travels in the `PlanPosted` event, so any keeper can rebuild every plan from logs. Posting grants nothing the signature had not already granted.
5. **Fill.** The keeper calls `redeemDelegations` on the DelegationManager with the delegation, the tranche index as the caveat argument, and the swap as the execution. The DelegationManager verifies the signature, runs both enforcers, then executes the swap from the holder's account.
6. **Revoke.** The holder calls `disableDelegation` on the DelegationManager (`disabledDelegations` reads true after) in one transaction, and turns any leftover WMON back into MON.

## The keeper loop

[keeper/keeper.ts](../keeper/keeper.ts) runs every two seconds:

1. Index `PlanPosted` from PlanBook and `TrancheFilled` from the enforcer, forward in 100-block windows from the deploy block, with the cursor persisted. Nothing scans logs in a request path.
2. Read the price through the enforcer's own `monPriceTick`, so the keeper and the contract compute the same number.
3. For each live plan: skip it once past its end date or revoked; for each tranche whose line is crossed and whose `spent` bit is clear, build the redemption and ask Monad's `eth_estimateGas`. A refusal from the estimate means the chain would revert the sale, so the keeper never sends it. Otherwise it sends with the estimate plus 20% as the limit, because Monad charges the full limit, and the fee cap read from the chain just before sending.
4. Snapshot status, plans and fills into memory, which the web app reads through `/api/status`, `/api/plans` and `/api/recent`.

The keeper key pays gas and holds no other power. One plan's failed send never stops the loop, the other plans or the heartbeat.

## The attack catalogue

`POST /api/attack {planId, kind}` turns the keeper hostile on purpose. It builds a redemption the plan forbids, signs it with the real keeper key, and sends it on chain, so the holder reads the enforcer's refusal from a real receipt. Try to cheat on the Watch tab calls it.

| Kind | What the keeper sends | Refused with | Monad mainnet receipt | Monad testnet receipt |
|---|---|---|---|---|
| `line` | a fill of a tranche whose line the TWAP has not reached | `Tripwire:above-line` | `0x31de32af5dc239fe69b5890348364f831f0c75c4dc06f3c0f86e07f2c194d951` | `0x819043c97c4c814482cf23858bbfd88d76a697d0c75369ea39b028be9aef1bf5` |
| `floor` | the right tranche, with `amountOutMinimum` at half the floor | `Tripwire:min-out` | `0x95afd4e0977b977893ae941ce5b77a94ab61f2745f0d89e6e97d01da9de78fb6` | `0x5053789a5c74addef0a92d3ff7e166d53dee0a457d0993d76dddb19ec4ac2c82` |
| `recipient` | the right tranche and floor, paid to the keeper's own address | `Tripwire:recipient` | `0x2acd2cd19571cf7c4a51cef6a660402038f583a9bc675daf852cef37875c860e` | `0xa962ac8e8e8b9cbc5fb31db42f75835fc975b3dedbd40b7866b337600ebab478` |
| `expiry` | a fill after the plan's end date | `TimestampEnforcer:expired-delegation` | | `0x45f500de80022f04dbd692deec5a52959040e65eed4b06d581ddbc9accf17268` |
| early target | a target fill before MON reaches it | `Tripwire:below-line` | | `0x22dc276807f75419a5a60248c353127be0ea4b22b3b2e021d9df1cde577646ed` |

All three mainnet refusals hit the same plan whose first tranche sold for real in `0xb2989ce6fdef893c5fc63ee5fcf4b56666861a208d3e8845ba40c619c615007b` (status success, block 113073240): 0.3 MON for 0.007267 USDC paid to the holder, above its 0.007101 floor. Each mainnet refusal above reads `status 0x0` from `eth_getTransactionReceipt` on https://rpc1.monad.xyz.

Live totals across every plan, read 2026-10-14 00:04 UTC:

```
curl -s https://tripwire-three.vercel.app/api/recent | jq .totals
# {"plans":40,"sales":37,"forbiddenSent":61,"forbiddenReverted":61,"forbiddenPaidOut":0}
curl -s https://tripwire-three.vercel.app/api/mainnet/recent | jq .totals
# {"plans":1,"sales":1,"forbiddenSent":3,"forbiddenReverted":3,"forbiddenPaidOut":0}
```

The fork suite covers what the live keeper is never asked to try: a wrong amount (`Tripwire:amount`), native value (`Tripwire:value`), another router (`Tripwire:target`), a changed token or fee (`Tripwire:route`), a bad index or argument (`Tripwire:index`, `Tripwire:args`), a second fill of one tranche (`Tripwire:spent`), a stranger calling the hook (`Tripwire:only-manager`), edited terms, an expired plan and a revoked plan.

## How the guards are proven

- **19 tests on a Monad mainnet fork**, with the real DelegationManager, SwapRouter02 and WMON/USDC pool at block 109704919:
  `cd contracts && forge test --fork-url https://rpc1.monad.xyz --fork-block-number 109704919 --fork-retries 12 --fork-retry-backoff 2000`
- **6 fuzz properties at 512 runs each:** never other than the tranche amount, never below the floor, never to anyone else, a stop only at or below its line, a target only at or above its line, never more than the plan across any fill order.
- **Mutation proof.** Deleting any one guard turns its tests red. The logs live in [contracts/results/](../contracts/results/): `mutant-above-line.txt`, `mutant-amount.txt`, `mutant-min-out.txt`, `mutant-recipient.txt`, `mutant-spent.txt`, `mutant-target-as-stop.txt`, `mutant-target-check.txt`, `mutant-value.txt`.
- **Read any plan back from chain** and replay the hostile calls: `bun run demo/verify-live.ts <holder> --attack`.
