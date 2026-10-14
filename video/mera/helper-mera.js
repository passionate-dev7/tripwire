// Callouts pinned to live DOM elements, drawn into the page so the screencast carries them.
(() => {
  if (window.__call) return;
  const items = new Map();
  const root = () => document.getElementById("__co") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "__co", style: "position:fixed;inset:0;pointer-events:none;z-index:2147483600" }));
  const place = () => {
    for (const [, it] of items) {
      const el = it.find();
      if (!el) { it.box.style.opacity = 0; continue; }
      const r = el.getBoundingClientRect(), p = it.pad;
      Object.assign(it.box.style, { left: r.left - p + "px", top: r.top - p + "px", width: r.width + 2 * p + "px", height: r.height + 2 * p + "px", opacity: 1 });
      const c = it.chip, cw = c.offsetWidth, ch = c.offsetHeight;
      let x = r.left - p, y = r.bottom + p + 10;
      if (it.pos === "above") y = r.top - p - ch - 10;
      if (it.pos === "left") { x = r.left - p - cw - 12; y = r.top + r.height / 2 - ch / 2; }
      if (it.pos === "right") { x = r.right + p + 12; y = r.top + r.height / 2 - ch / 2; }
      if (it.align === "end") x = r.right + p - cw;
      x = Math.max(8, Math.min(innerWidth - cw - 8, x)); y = Math.max(8, Math.min(innerHeight - ch - 8, y));
      Object.assign(c.style, { left: x + "px", top: y + "px", opacity: 1 });
    }
    requestAnimationFrame(place);
  };
  requestAnimationFrame(place);
  window.__call = (find, label, pos = "below", pad = 6, key = label, align = "start") => {
    const f = typeof find === "string" ? () => document.querySelector(find) : find;
    window.__uncall(key);
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;border:2px solid #f4f4f6;border-radius:8px;box-shadow:0 0 0 1px rgba(7,8,10,.7);opacity:0;transition:opacity .25s";
    const chip = document.createElement("div");
    chip.textContent = label;
    chip.style.cssText = "position:fixed;left:0;top:0;white-space:nowrap;background:#f4f4f6;color:#07080a;font:600 15px/1 'IBM Plex Sans',system-ui,sans-serif;padding:8px 12px;border-radius:7px;opacity:0;transition:opacity .25s;box-shadow:0 6px 24px rgba(0,0,0,.45)";
    root().append(box, chip);
    items.set(key, { find: f, box, chip, pos, pad, align });
  };
  window.__uncall = (key) => { const it = items.get(key); if (it) { it.box.remove(); it.chip.remove(); items.delete(key); } };
  window.__clear = () => { for (const k of [...items.keys()]) window.__uncall(k); };
})();
window.__set = (sel, v) => { const el = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };


// Stopwatch, tap counter and passkey-prompt counter drawn into the page so the screencast carries them.
// Taps are trusted clicks on buttons/links after __hud.start(); prompts are WebAuthn ceremonies (create/get with publicKey).
(() => {
  if (window.__hud || !/tripwire/.test(location.hostname)) return;
  const s = { t0: null, tStop: null, taps: 0, prompts: 0, ms: {}, flash: 0 };
  const now = () => performance.now();
  const cr = navigator.credentials;
  for (const m of ["create", "get"]) {
    const orig = cr[m].bind(cr);
    cr[m] = (...a) => { if (a[0] && a[0].publicKey && s.t0 !== null) { s.prompts++; s.flash = now(); } return orig(...a); };
  }
  addEventListener("click", (e) => { if (s.t0 !== null && s.tStop === null && e.isTrusted && e.target.closest && e.target.closest("button,a")) s.taps++; }, true);
  const mark = (k) => { if (!s.ms[k]) s.ms[k] = { t: (now() - s.t0) / 1000, taps: s.taps, prompts: s.prompts }; };
  const scan = () => {
    if (s.t0 === null) return;
    for (const li of document.querySelectorAll("ol[aria-label=Transactions] li")) {
      const txt = li.innerText, hasTx = !!li.querySelector("a[href*='/tx/']");
      if (hasTx && /testnet MON received/.test(txt)) mark("funded");
      if (hasTx && /MON set aside/.test(txt)) { mark("signed"); if (s.tStop === null) s.tStop = now(); }
      if (hasTx && /Plan armed/.test(txt)) mark("armed");
    }
  };
  const el = document.createElement("div");
  el.id = "__hud";
  el.style.cssText = "position:fixed;top:7px;left:262px;z-index:2147483640;pointer-events:none;display:flex;gap:0;font:500 15px/1 'IBM Plex Mono',ui-monospace,monospace;color:#f4f4f6;background:rgba(7,8,10,.94);border:1px solid rgba(255,255,255,.28);border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.55)";
  const cell = (id, label) => `<div style="padding:8px 14px;border-right:1px solid rgba(255,255,255,.16)"><div style="font-size:10px;letter-spacing:.14em;color:#9c9c9d;margin-bottom:4px">${label}</div><div id="${id}" style="font-size:22px;font-variant-numeric:tabular-nums">0.0</div></div>`;
  el.innerHTML = cell("__h1", "SECONDS") + cell("__h2", "TAPS") + cell("__h3", "PASSKEY PROMPTS") + `<div id="__h4" style="padding:8px 14px;min-width:210px;font-size:12px;color:#9c9c9d;display:flex;align-items:center">landing page, clock ready</div>`;
  const toast = document.createElement("div");
  toast.style.cssText = "position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:2147483641;pointer-events:none;font:600 17px/1 'IBM Plex Sans',system-ui,sans-serif;background:#f4f4f6;color:#07080a;padding:11px 18px;border-radius:9px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .15s;white-space:nowrap";
  const mount = () => { if (!document.body) return setTimeout(mount, 30); document.body.append(el, toast); };
  mount();
  const tick = () => {
    scan();
    const t = s.t0 === null ? 0 : ((s.tStop ?? now()) - s.t0) / 1000;
    const g = (i) => document.getElementById(i);
    if (g("__h1")) {
      g("__h1").textContent = t.toFixed(1); g("__h2").textContent = s.taps; g("__h3").textContent = s.prompts;
      const done = s.tStop !== null;
      g("__h1").style.color = done ? "#7dffb0" : "#f4f4f6";
      g("__h4").style.color = done ? "#7dffb0" : "#9c9c9d";
      g("__h4").textContent = s.t0 === null ? "landing page, clock ready" : done ? "first transaction confirmed" : "running";
    }
    toast.style.opacity = s.flash && now() - s.flash < 1500 ? 1 : 0;
    if (s.flash) toast.textContent = "Passkey prompt " + s.prompts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__hud = { start: () => { s.t0 = now(); s.taps = 0; s.prompts = 0; s.tStop = null; s.ms = {}; }, read: () => JSON.stringify({ s: { taps: s.taps, prompts: s.prompts, t: s.t0 === null ? 0 : ((s.tStop ?? now()) - s.t0) / 1000 }, ms: s.ms }), done: () => s.tStop !== null };
})();
