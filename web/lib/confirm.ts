/** Polls a read until its post-condition holds. A receipt can arrive before a load-balanced RPC node serves the
 * state it produced, and the public RPC rejects reads under load, so one read right after the receipt can report a
 * landed transaction as not landed. A read that throws is retried until the deadline, then its error is raised. */
export async function confirmed<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000, every = 800): Promise<{ ok: boolean; value: T }> {
  const end = Date.now() + ms;
  let last: { value: T } | null = null;
  for (;;) {
    try {
      const value = await read();
      last = { value };
      if (ok(value)) return { ok: true, value };
    } catch (e) {
      if (Date.now() >= end) throw e;
    }
    if (Date.now() >= end && last) return { ok: false, value: last.value };
    await new Promise((r) => setTimeout(r, every));
  }
}
