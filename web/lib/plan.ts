// A tripwire plan, from the holder's plain terms to the bytes the chain checks.
//
// One delegation carries the whole plan. Its first caveat is TripwirePlanEnforcer with the terms below; its second
// is MetaMask's TimestampEnforcer with the expiry. The holder signs it as EIP-712 typed data (DelegationManager v1),
// then sends two transactions from its own address: a plain WMON deposit of the planned MON, then one EIP-7702
// transaction that upgrades the address to MetaMask's stateless DeleGator and, in the same batch, approves the router
// for exactly the planned amount and posts the plan to PlanBook. The deposit goes first and alone because Monad's
// reserve balance rule lets an account under 10 MON spend value only in an "emptying transaction", which a
// transaction carrying a 7702 authorization never is (testnet tx 0x80e8c96e reverted "reserve balance violation"
// with the wrap inside the 7702 batch). A keeper can then fill each tranche once, only while the MON price is at or
// below its line, only for at least its floor, only to the holder. Shared by the web app, the keeper and the demos.
import {
  type Account,
  type Address,
  type Hex,
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  hashTypedData,
  pad,
  parseAbi,
  toHex,
} from "viem";
import { encodeCalls } from "@metamask/smart-accounts-kit/utils";

export type Net = {
  chainId: number;
  name: string;
  rpc: string;
  explorer: string;
  delegationManager: Address;
  statelessDeleGator: Address;
  timestampEnforcer: Address;
  router: Address;
  pool: Address;
  wmon: Address;
  stable: Address;
  stableSymbol: string;
  stableDecimals: number;
  fee: number;
  twapSeconds: number;
  enforcer: Address;
  planBook: Address;
  planBookFromBlock: bigint;
  keeper: Address;
  /** Earlier enforcer and plan book deployments whose plans still read and fill (terms without the direction bit). */
  legacy: { enforcer: Address; planBook: Address; planBookFromBlock: bigint }[];
};

// MetaMask delegation framework v1.3.0, same addresses on Monad mainnet and testnet (read with eth_getCode 2026-10-02).
const DELEGATION_MANAGER: Address = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const STATELESS_DELEGATOR: Address = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
const TIMESTAMP_ENFORCER: Address = "0x1046bb45C8d673d4ea75321280DB34899413c069";

export const TESTNET: Net = {
  chainId: 10143,
  name: "Monad testnet",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadvision.com",
  delegationManager: DELEGATION_MANAGER,
  statelessDeleGator: STATELESS_DELEGATOR,
  timestampEnforcer: TIMESTAMP_ENFORCER,
  // contracts/deployments/10143.json
  router: getAddress("0x13c320c4488d4e18ea85e11c46b0d6d29a335e96"),
  pool: getAddress("0x75E6B52BF8AEFFa56908b6C565944Db9D4C638F5"),
  wmon: getAddress("0x4c594690108f808d9e5603df548740b22e82703e"),
  stable: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  stableSymbol: "aUSD",
  stableDecimals: 6,
  fee: 3000,
  twapSeconds: 60,
  enforcer: getAddress("0xc66cc7b7b91b893abfd0661c0312f6c45ead056b"),
  planBook: getAddress("0x6a1fcb214a1c43f53afb9d31014e1cdc92fa593e"),
  planBookFromBlock: 67630820n,
  keeper: getAddress("0x8a916555418dC4a8A4b11E2Fc2B8e85127204468"),
  legacy: [{ enforcer: getAddress("0x9643f0ab360c5e10838e3bdf3a4a203e3c5cff37"), planBook: getAddress("0xdd26f52338cc714830e23ff6999961bf2503d77a"), planBookFromBlock: 67513065n }],
};

// Mainnet venue, read only until a mainnet enforcer and plan book are deployed.
export const MAINNET_VENUE = {
  chainId: 143,
  rpc: "https://rpc1.monad.xyz",
  router: "0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900" as Address,
  pool: "0x659bD0BC4167BA25c62E05656F78043E7eD4a9da" as Address,
  wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
  stable: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as Address,
  stableDecimals: 6,
};

export const ROOT_AUTHORITY: Hex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export type Caveat = { enforcer: Address; terms: Hex; args: Hex };
export type Delegation = {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: Caveat[];
  salt: bigint;
  signature: Hex;
};
/** atOrAbove false: a stop, sells once MON falls to the line. true: a target, sells once MON rises to it. */
export type Tranche = { lineTick: number; amountIn: bigint; minOutPerUnit: bigint; atOrAbove: boolean };

/** A tranche as the holder states it: sell `mon` MON once MON falls to `line` (or, with `up`, rises to it), for no
 * less than `floor` per MON. */
export type PlainTranche = { mon: string; line: number; floor: number; up?: boolean };

export const abis = {
  delegationManager: parseAbi([
    "function redeemDelegations(bytes[] permissionContexts, bytes32[] modes, bytes[] executionCallDatas)",
    "function disableDelegation((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature) delegation)",
    "function disabledDelegations(bytes32) view returns (bool)",
    "function getDomainHash() view returns (bytes32)",
    "function getDelegationHash((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature) input) pure returns (bytes32)",
  ]),
  planBook: parseAbi([
    "function post((address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms, bytes args)[] caveats, uint256 salt, bytes signature) d) returns (uint256)",
    "function count() view returns (uint256)",
    "function plan(uint256 id) view returns ((address holder, address keeper, uint64 postedAt, bytes32 delegationHash))",
    "function plansOf(address holder) view returns (uint256[])",
    "event PlanPosted(uint256 indexed id, address indexed holder, address indexed keeper, bytes32 delegationHash, bytes delegation)",
  ]),
  enforcer: parseAbi([
    "function spent(bytes32 delegationHash, uint256 index) view returns (bool)",
    "function monPriceTick(address pool, address wmon, address usdc, uint32 twapSeconds) view returns (int24)",
    "event TrancheFilled(bytes32 indexed delegationHash, address indexed recipient, uint256 indexed index, uint256 amountIn, uint256 amountOutMinimum, int24 priceTick)",
  ]),
  router: parseAbi([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
  ]),
  wmon: parseAbi([
    "function deposit() payable",
    "function withdraw(uint256)",
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
  ]),
  pool: parseAbi(["function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)"]),
};

const DELEGATION_TUPLE = {
  type: "tuple",
  components: [
    { name: "delegate", type: "address" },
    { name: "delegator", type: "address" },
    { name: "authority", type: "bytes32" },
    {
      name: "caveats",
      type: "tuple[]",
      components: [
        { name: "enforcer", type: "address" },
        { name: "terms", type: "bytes" },
        { name: "args", type: "bytes" },
      ],
    },
    { name: "salt", type: "uint256" },
    { name: "signature", type: "bytes" },
  ],
} as const;

const TERMS_TUPLE_V1 = {
  type: "tuple",
  components: [
    { name: "router", type: "address" },
    { name: "pool", type: "address" },
    { name: "wmon", type: "address" },
    { name: "usdc", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "twapSeconds", type: "uint32" },
    { name: "recipient", type: "address" },
    {
      name: "tranches",
      type: "tuple[]",
      components: [
        { name: "lineTick", type: "int24" },
        { name: "amountIn", type: "uint256" },
        { name: "minOutPerUnit", type: "uint256" },
      ],
    },
  ],
} as const;

const TERMS_TUPLE = {
  type: "tuple",
  components: [
    { name: "router", type: "address" },
    { name: "pool", type: "address" },
    { name: "wmon", type: "address" },
    { name: "usdc", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "twapSeconds", type: "uint32" },
    { name: "recipient", type: "address" },
    {
      name: "tranches",
      type: "tuple[]",
      components: [
        { name: "lineTick", type: "int24" },
        { name: "amountIn", type: "uint256" },
        { name: "minOutPerUnit", type: "uint256" },
        { name: "atOrAbove", type: "bool" },
      ],
    },
  ],
} as const;

// ---------- price units ----------
// The enforcer's tick is oriented so higher always means a pricier MON. For WMON (18 decimals) against a 6-decimal
// stablecoin that tick is log base 1.0001 of (price * 10^(6 - 18)), whichever token sorts first in the pool.

export function priceToTick(price: number, stableDecimals = 6): number {
  if (!(price > 0)) throw new Error("price must be above zero");
  return Math.floor(Math.log(price * 10 ** (stableDecimals - 18)) / Math.log(1.0001));
}

export function tickToPrice(tick: number, stableDecimals = 6): number {
  return 1.0001 ** tick * 10 ** (18 - stableDecimals);
}

/** Stablecoin base units owed per 1 WMON (1e18 wei) at `floor`, rounded up so the chain never accepts less. */
export function floorToMinOutPerUnit(floor: number, stableDecimals = 6): bigint {
  if (!(floor > 0)) throw new Error("floor must be above zero");
  return BigInt(Math.ceil(floor * 10 ** stableDecimals));
}

export function parseMon(mon: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(mon.trim());
  if (!m) throw new Error(`not a MON amount: ${mon}`);
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0"));
}

export function toTranches(plain: PlainTranche[], stableDecimals = 6): Tranche[] {
  if (plain.length === 0 || plain.length > 16) throw new Error("a plan has 1 to 16 tranches");
  return plain.map((p, i) => {
    if (!p.mon || !p.mon.trim()) throw new Error(`Enter how much MON sale ${i + 1} sells.`);
    if (!(p.line > 0) || !(p.floor > 0)) throw new Error(`Sale ${i + 1} needs a line and a floor above zero.`);
    if (!(p.floor <= p.line)) throw new Error(`floor ${p.floor} is above line ${p.line}: the tranche could never fill`);
    const amountIn = parseMon(p.mon);
    if (amountIn === 0n) throw new Error("a tranche sells more than 0 MON");
    return {
      lineTick: priceToTick(p.line, stableDecimals),
      amountIn,
      minOutPerUnit: floorToMinOutPerUnit(p.floor, stableDecimals),
      atOrAbove: p.up === true,
    };
  });
}

export function planTotal(tranches: Tranche[]): bigint {
  return tranches.reduce((s, t) => s + t.amountIn, 0n);
}

// ---------- the delegation ----------

export function encodeTerms(net: Net, recipient: Address, tranches: Tranche[]): Hex {
  return encodeAbiParameters(
    [TERMS_TUPLE],
    [{
      router: net.router,
      pool: net.pool,
      wmon: net.wmon,
      usdc: net.stable,
      fee: net.fee,
      twapSeconds: net.twapSeconds,
      recipient,
      tranches: tranches.map((t) => ({ lineTick: t.lineTick, amountIn: t.amountIn, minOutPerUnit: t.minOutPerUnit, atOrAbove: t.atOrAbove })),
    }],
  );
}

/** Decodes a plan's terms. Plans signed for a legacy enforcer carry no direction bit; every tranche there is a stop. */
export function decodeTranches(terms: Hex, enforcer?: Address): { recipient: Address; tranches: Tranche[] } {
  const legacy = enforcer !== undefined && TESTNET.legacy.some((l) => l.enforcer.toLowerCase() === enforcer.toLowerCase());
  if (legacy) {
    const [t] = decodeAbiParameters([TERMS_TUPLE_V1], terms);
    return { recipient: t.recipient, tranches: t.tranches.map((x) => ({ lineTick: Number(x.lineTick), amountIn: x.amountIn, minOutPerUnit: x.minOutPerUnit, atOrAbove: false })) };
  }
  const [t] = decodeAbiParameters([TERMS_TUPLE], terms);
  return {
    recipient: t.recipient,
    tranches: t.tranches.map((x) => ({ lineTick: Number(x.lineTick), amountIn: x.amountIn, minOutPerUnit: x.minOutPerUnit, atOrAbove: x.atOrAbove })),
  };
}

/** True when MON's price tick has reached the tranche's line from the side the tranche waits on. */
export function lineReached(t: Tranche, priceTick: number): boolean {
  return t.atOrAbove ? priceTick >= t.lineTick : priceTick <= t.lineTick;
}

export function timestampTerms(expiresAt: number): Hex {
  return encodePacked(["uint128", "uint128"], [0n, BigInt(expiresAt)]);
}

export function buildDelegation(
  net: Net,
  holder: Address,
  keeper: Address,
  tranches: Tranche[],
  expiresAt: number,
  salt: bigint,
): Delegation {
  return {
    delegate: keeper,
    delegator: holder,
    authority: ROOT_AUTHORITY,
    caveats: [
      { enforcer: net.enforcer, terms: encodeTerms(net, holder, tranches), args: "0x" },
      { enforcer: net.timestampEnforcer, terms: timestampTerms(expiresAt), args: "0x" },
    ],
    salt,
    signature: "0x",
  };
}

export const DELEGATION_TYPES = {
  Caveat: [
    { name: "enforcer", type: "address" },
    { name: "terms", type: "bytes" },
  ],
  Delegation: [
    { name: "delegate", type: "address" },
    { name: "delegator", type: "address" },
    { name: "authority", type: "bytes32" },
    { name: "caveats", type: "Caveat[]" },
    { name: "salt", type: "uint256" },
  ],
} as const;

export function delegationTypedData(net: Net, d: Delegation) {
  return {
    domain: { name: "DelegationManager", version: "1", chainId: net.chainId, verifyingContract: net.delegationManager },
    types: DELEGATION_TYPES,
    primaryType: "Delegation" as const,
    message: {
      delegate: d.delegate,
      delegator: d.delegator,
      authority: d.authority,
      caveats: d.caveats.map((c) => ({ enforcer: c.enforcer, terms: c.terms })),
      salt: d.salt,
    },
  };
}

/** The digest the holder's account signs; equals keccak(0x1901, DM.getDomainHash(), DM.getDelegationHash(d)). */
export function delegationDigest(net: Net, d: Delegation): Hex {
  return hashTypedData(delegationTypedData(net, d));
}

export async function signDelegation(net: Net, account: Account, d: Delegation): Promise<Delegation> {
  if (!account.signTypedData) throw new Error("this account cannot sign typed data");
  const signature = await account.signTypedData(delegationTypedData(net, d));
  return { ...d, signature };
}

export function encodeDelegation(d: Delegation): Hex {
  return encodeAbiParameters([DELEGATION_TUPLE], [d]);
}

export function decodeDelegation(data: Hex): Delegation {
  const [d] = decodeAbiParameters([DELEGATION_TUPLE], data);
  return { ...d, caveats: d.caveats.map((c) => ({ ...c })) } as Delegation;
}

// ---------- the holder's two setup transactions ----------

/** First transaction, sent while the address is still a plain account: wrap the planned MON. */
export function wrapCall(net: Net, total: bigint): { to: Address; value: bigint; data: Hex } {
  return { to: net.wmon, value: total, data: encodeFunctionData({ abi: abis.wmon, functionName: "deposit" }) };
}

/** Second transaction, carrying the 7702 authorization, run by the holder's own address: approve exactly the plan,
 * then post it. It moves no MON, so the reserve balance rule never blocks it. */
export function setupCalldata(net: Net, signed: Delegation, total: bigint): Hex {
  return encodeCalls([
    { to: net.wmon, value: 0n, data: encodeFunctionData({ abi: abis.wmon, functionName: "approve", args: [net.router, total] }) },
    { to: net.planBook, value: 0n, data: encodeFunctionData({ abi: abis.planBook, functionName: "post", args: [signed] }) },
  ]);
}

// ---------- the keeper's call ----------

export function swapCalldata(net: Net, recipient: Address, amountIn: bigint, amountOutMinimum: bigint): Hex {
  return encodeFunctionData({
    abi: abis.router,
    functionName: "exactInputSingle",
    args: [{ tokenIn: net.wmon, tokenOut: net.stable, fee: net.fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0n }],
  });
}

const SINGLE_DEFAULT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** DelegationManager.redeemDelegations calldata for one tranche: the keeper names `index` in the caveat args. */
export function redeemCalldata(net: Net, signed: Delegation, index: number, target: Address, value: bigint, data: Hex): Hex {
  const withArgs: Delegation = {
    ...signed,
    caveats: signed.caveats.map((c, i) => (i === 0 ? { ...c, args: encodeAbiParameters([{ type: "uint256" }], [BigInt(index)]) } : c)),
  };
  const context = encodeAbiParameters([{ type: "tuple[]", components: DELEGATION_TUPLE.components }], [[withArgs]]);
  const execution = concatHex([target, pad(toHex(value), { size: 32 }), data]);
  return encodeFunctionData({
    abi: abis.delegationManager,
    functionName: "redeemDelegations",
    args: [[context], [SINGLE_DEFAULT], [execution]],
  });
}

/** The exact fill the plan signed for tranche `index`: its amount, its floor, to the holder. */
export function fillCalldata(net: Net, signed: Delegation, index: number): Hex {
  const { recipient, tranches } = decodeTranches(signed.caveats[0].terms, signed.caveats[0].enforcer);
  const t = tranches[index];
  if (!t) throw new Error(`no tranche ${index}`);
  const minOut = (t.amountIn * t.minOutPerUnit + 10n ** 18n - 1n) / 10n ** 18n;
  return redeemCalldata(net, signed, index, net.router, 0n, swapCalldata(net, recipient, t.amountIn, minOut));
}
