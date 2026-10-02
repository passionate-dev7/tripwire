// Reading why a mined transaction reverted, from the chain itself.
// First choice is the transaction's own execution trace (debug_traceTransaction with the call tracer), which is the
// mined run, not a re-run. Fallback replays the call at the parent block with a raw eth_call and decodes Error(string).
// Raw JSON-RPC on purpose: Monad returns the revert data in error.data, and client libraries nest it differently.
import { type Hex, decodeErrorResult, toHex } from "viem";

const ERROR_STRING = [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }] as const;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<{ result?: T; error?: { message?: string; data?: Hex } }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return res.json();
}

export function decodeReason(data: Hex | undefined): string | null {
  if (!data || !data.startsWith("0x08c379a0")) return null;
  return decodeErrorResult({ abi: ERROR_STRING, data }).args[0];
}

export async function revertReason(url: string, hash: Hex): Promise<string> {
  const trace = await rpc<{ revertReason?: string; output?: Hex; error?: string }>(url, "debug_traceTransaction", [hash, { tracer: "callTracer" }]);
  if (trace.result?.revertReason) return trace.result.revertReason;
  const fromOutput = decodeReason(trace.result?.output);
  if (fromOutput) return fromOutput;

  const tx = await rpc<{ from: Hex; to: Hex; input: Hex; value: Hex; gas: Hex; blockNumber: Hex }>(url, "eth_getTransactionByHash", [hash]);
  if (!tx.result) return "transaction not found";
  const { from, to, input, value, gas, blockNumber } = tx.result;
  const replay = await rpc<Hex>(url, "eth_call", [{ from, to, data: input, value, gas }, toHex(BigInt(blockNumber) - 1n)]);
  if (!replay.error) return trace.result?.error ?? "replay did not revert";
  return decodeReason(replay.error.data) ?? replay.error.message ?? "no reason string";
}
