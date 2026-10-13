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

