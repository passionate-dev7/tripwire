# Try tripwire in three steps (Monad testnet, no real funds)

1. Open your plan link, for example https://tripwire-three.vercel.app/?sell=0.02@up0.03/0.028 (sell 0.02 MON once MON rises to 0.03, never below 0.028). The rows are already filled in. Press **Create**: a passkey is your wallet, with no extension and no seed phrase.
2. Press **Get 0.1 testnet MON**, then **Sign plan**. One passkey prompt signs the plan and upgrades your address. A target already under the price sells within about a minute; a stop waits for its line.
3. On the **Watch** tab read the sale with its transaction link, then press **Try to cheat**: the keeper sends a sale your plan forbids and the contract refuses it, with the reason read from the mined transaction. **Revoke** ends the plan and **Turn back into MON** returns any MON still set aside.

What you get: your MON stays at your own address until a sale; the keeper can sell only the amounts you signed, only at or past your lines, never below your floors, and only to you.
