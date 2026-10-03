/** How many more fills the keeper's gas pays for, from the gas balance and per-fill cost the keeper's status serves. */
export const salesLeft = (gas: string | undefined, cost: string | undefined): number | null =>
  gas && cost && BigInt(cost) > 0n ? Number(BigInt(gas) / BigInt(cost)) : null;
