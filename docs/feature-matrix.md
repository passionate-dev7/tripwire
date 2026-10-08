# tripwire feature matrix (Monad testnet, https://tripwire-three.vercel.app, updated 2026-10-08)

PASS = exercised through the real UI on the live deploy, as a holder would, with the result read back from chain
(`demo/plan-state.ts`, `demo/verify-live.ts`) or from the keeper API. Click-through logs are in `demo/runs/`; the
scripted steps are `demo/ui-run.json` (desktop 1440 and phone 390x844) and `demo/ui-run-mobile.json` (phone, plan link).

| # | Feature | How a holder does it | Status | Evidence |
|---|---|---|---|---|
| 1 | Live price, keeper heartbeat and keeper gas | open the site | PASS | 2026-10-08 read-only proof: heartbeat age 5,702 ms, `loopError=null`, keeperGas 5.125757462 MON. Fill `0x5a6b045b9f6389e857bb1dbbedb610f93ecbc9943068b6f9cfbb6a331319eb42` succeeded on TESTNET.keeper with receipt gasUsed 467,538 and tx gas limit 467,538. At its 110 gwei max fee, the receipt-derived conservative fill cost is 0.05142918 MON and runway is 99 fills, above the five-holder target. The live status uses the more conservative configured 0.0517 MON estimate and also displays 99; evidence: `demo/runs/keeper-health-2026-10-08.json` |
| 2 | Heartbeat goes silent and recovers | isolated local status fixture, values swapped while app is open | PASS | At 390x844 the fixture first showed "Keeper silent for 67 s. Nothing sells until it is back." and 96 sales from fixture gas values. After changing only `lastLoop`, it showed "Keeper checked 5 s ago"; document width remained 390/390. The shared keeper was untouched; evidence: `demo/runs/keeper-health-2026-10-08.json` |
| 3 | Create a passkey wallet | name it, Create | PASS | address shown, no extension, no seed phrase (plan 21 holder `0x1017f1fF71B320cf513311cBa5785EEc17899553`) |
| 4 | Testnet MON for a new passkey | Get 0.1 testnet MON | PASS | balance read on the ticket; a second request returns 400 "This passkey already got testnet MON from tripwire." |
| 5 | Plan from a link | open `?sell=<MON>@<line>/<floor>` (add `up` for a target) | PASS | five per-holder links open with their own rows and directions (`demo/runs/plan-links-2026-10-03.json`); a link on a phone arms a plan (plan 12) |
| 6 | Edit sales: presets, direction, line, floor, amount, add and remove rows | +10% preset, rises/falls switch, type into rows | PASS | preset set line 0.03564 and floor 0.03279 from a 0.0324 price; a floor above its line reads "the tranche could never fill" |
| 7 | Custom end date | set Plan stops on | PASS | 2026-10-20 in the signed Timestamp caveat, read from chain (`endsAt` in plan-state for plans 13, 20, 21) |
| 8 | Fit to my balance | enter 1 MON, Fit to my balance | PASS | rows rescale to 0.0447 and 0.0004 so the plan plus setup gas fits the 0.1 MON |
| 9 | Sign plan with one passkey prompt | Sign plan | PASS | wraps MON, upgrades the account (EIP-7702) and posts to PlanBook: plan 21 posted in `0x3e91630c9a8a215a7f363cd62916482d631c55c0c4fba03632bcb60bb52af96e`, pays only the holder |
| 10 | Target sale through the enforcer | keeper sells a target once MON is at or above its line | PASS | plan 21 sale 1 sold exactly 0.02 WMON in `0x5a6b045b9f6389e857bb1dbbedb610f93ecbc9943068b6f9cfbb6a331319eb42`, received 0.000646 aUSD against a 0.000583 floor |
| 11 | Stop stays unsold while its line is not reached | stop 35% below the price | PASS | plan 21 sale 2 unspent, "35.0% to stop"; verify-live negative case |
| 12 | Three refusals on chain | Try to cheat: sell early, below the floor, to the keeper | PASS | plan 21 `0xcf90b819132f81806ed4b0d264f247957a319afeb52d5257500aa7c28766877a` Tripwire:above-line, `0x17aaf7feaca041953754fca659071bc3aec18db6276b4c0209a7934fb1de5ec3` Tripwire:min-out, `0x069b1363002fd69e9bde2f9f7c01f0012b0f0e6af7dedc293ec66066ab271789` Tripwire:recipient; all three receipts status 0 |
| 13 | Revoke a plan | Revoke | PASS | `disabledDelegations` true at the DelegationManager for plans 10, 12, 13, 20, 21 |
| 14 | Turn WMON back into MON | Turn back into MON | PASS | WMON held 0 after (plan-state `wmonHeld`) |
| 15 | Returning sign-in | reload, Sign in with passkey | PASS | same address `0x1017f1fF...9553` returns with its plans |
| 16 | Signed-out proof | open Watch without signing in | PASS | every refused call with its reason and the totals (sent, reverted, paid out) from the keeper index |
| 17 | Phone layout 390x844 | open on a phone | PASS | no horizontal overflow, chart above the ticket, full flow (create, drip, sign, sale, three refusals, revoke, unwrap, sign in) on plan 13 |
| 18 | First viewport says what tripwire is | open the site | PASS | h1 "An exit plan for your MON that a compromised keeper cannot break." inside the first viewport |
