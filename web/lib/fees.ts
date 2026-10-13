// Monad's fee cap, derived from the chain's own gas price instead of a fixed number. eth_gasPrice is the base fee plus
// a tip (102 gwei on both nets while the base fee sits at its 100 gwei floor). The cap carries 50% headroom so a rising
// base fee between reading and inclusion never strands a transaction; the charge is the real price, not the cap, but
// the sender must hold gas limit x cap up front.
export const FEE_PRIORITY = 2_000_000_000n;

export const feeCap = (gasPrice: bigint): bigint => (gasPrice * 3n) / 2n;

/** Read right before each send. Any viem public client fits. */
export async function liveFees(pub: { getGasPrice(): Promise<bigint> }) {
  return { maxFeePerGas: feeCap(await pub.getGasPrice()), maxPriorityFeePerGas: FEE_PRIORITY };
}
