# mkcallouts.py : plain-word callout pills as full-frame transparent PNGs (1920x1080), same look as the page's own callouts.
# anchor: tl/tr/bl/br = which corner of the pill sits at (x, y). Coordinates are in the frame the piece is composited in.
# pad=True: x, y are given in the source footage and mapped through the 90 percent scale with 96 px side bars (vf PAD in plan-pitch2.mjs).
from PIL import Image, ImageDraw, ImageFont
import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work2", "co")
os.makedirs(out, exist_ok=True)
FP = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
def P(text, anchor, x, y, size=25, h=44, pad=False): return dict(text=text, anchor=anchor, x=x, y=y, size=size, h=h, pad=pad)
C = {
  "live_above": P("live on Monad mainnet", "br", 1207, 392, 20, 32),
  "plan_q03": P("Dan's plan", "tr", 1270, 128),
  "plan_q05": P("Dan's plan", "tr", 1270, 40),
  "mined_q05": P("mined: confirmed on the chain", "tl", 100, 142),
  "wmon_s": P("WMON: MON wrapped so it can be traded", "tl", 1285, 592),
  "wmon_x1": P("WMON: MON wrapped so it can be traded", "tl", 1110, 636, pad=True),
  "num_x1": P("the small 2 means two zeros: 0.007267", "tl", 1110, 690, pad=True),
  "mm_x1": P("MetaMask's contract, already live on Monad", "tl", 870, 940, pad=True),
  "refused_c": P("refused: the rule it broke", "tr", 1850, 418),
  "tally_c": P("3 tried, 3 refused, 0 paid out", "tl", 100, 26, 30, 52),
  "fail_x2": P("fail: the chain refused it", "tl", 528, 560, pad=True),
  "mainnet_q01": P("mainnet: the live network, real money", "tr", 1883, 62, pad=True),
  "testnet_q01": P("testnet: a practice copy of the network", "tl", 98, 642, pad=True),
  "mon_q01": P("MON: the coin of the Monad network", "tr", 1270, 195, pad=True),
  "what_q01b": P("what Dan signs", "tr", 1270, 128, pad=True),
  "stoploss_q10": P("stop-loss", "tr", 1275, 316, pad=True),
  "target_q10": P("take-profit", "tr", 1275, 532, pad=True),
  "sixteen_q10": P("up to 16 sales in one signature", "tr", 1275, 636, pad=True),
  "dex_x": P("DEX: a website for trading coins", "tr", 1400, 336),
  "dex_r": P("DEX/frontend: a site for trading coins", "tr", 1790, 170),
  "noncex_r": P("non-CEX: not a centralized exchange", "tl", 140, 462),
}
for name, c in C.items():
    f = ImageFont.truetype(FP, c["size"])
    im = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    l, t, r, b = d.textbbox((0, 0), c["text"], font=f)
    w, h = r - l + 34, c["h"]
    x, y = c["x"], c["y"]
    if c["pad"]: x, y = 96 + 0.9 * x, 0.9 * y
    x0 = x - w if c["anchor"][1] == "r" else x
    y0 = y - h if c["anchor"][0] == "b" else y
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=9, fill=(255, 255, 255, 255))
    d.text((x0 + 17 - l, y0 + (h - (b - t)) / 2 - t), c["text"], font=f, fill=(12, 12, 14, 255))
    im.save(os.path.join(out, name + ".png"))
    print(name, round(x0), round(y0), round(x0 + w), round(y0 + h))
