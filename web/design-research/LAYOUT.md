# tripwire: layout map

Structure is stolen from named real screens in REFS.md, not invented. Entry numbers below refer to REFS.md. Pixel values are the references' measured values (REFS.md says which are tokens and which are counted from the PNG); where tripwire sets its own number it says "set".

System: DESIGN.md (raycast, with the tripwire adaptation). Canvas #07080a, one red accent #ff6161 for the stop line only, Inter with tabular numbers, mono for addresses, hashes and the terminal. Largest type is the 56 px live price.

Shared rules for every region:
- Row pitch: 40 px for editable rows (Raycast list 40, Coinbase ticket 40), 31 px for key-value fact rows (Raycast Information 31), 32 px for fills and activity sentences (Linear 32), 25 px for any numeric table (Hyperliquid 25).
- Radius 8 on rows and inputs (Raycast), 10 on cards (set, from the Design Read), 9999 on the one white pill button per screen (Raycast Download is 8 with a 14 px label; the pill is the Kuru nav button, 9999).
- Hairline 1 px #242728 between regions, no shadows, no gradient, 24 px between cards (set).
- Right-align every number, left-align every label (Hyperliquid, Kuru, Coinbase).

## Plan screen

### 1440 px wide

| Region | Stolen from | Values |
|---|---|---|
| App bar | Raycast window header (1) | 56 px tall, wordmark left, Plan / Watch / Terminal tabs, connect button right at 35 px tall radius 8 (Raycast Download 116 x 35) |
| Price row | Kuru market header (6), Hyperliquid stats strip (4) | 60 px strip: MON / USDC label, live price at 56 px weight 500 tracking 0.2 px (set from DESIGN.md), then three label-over-value stats at 12 px (24 h range, 60 s average, spot) |
| Chart | Kuru chart with the limit line (6), TradingView axis tag (8) | Column 0 to 880 px (set, Kuru chart 800, Hyperliquid 897), 420 px tall (set). Red line 1 px solid at the line price across the full width, label riding it 117 x 20 px (Kuru "Place limit buy" tag), axis tag 65 x 33 px with the line price over its USDC value (TradingView). Faint red band from line to floor, rgba(255,97,97,0.15). Price curve in ink, 60 s average as a second 1 px mute curve. Dotted 1 px current-price line (TradingView y 152 pattern). No candles, no left toolbar, no volume pane |
| Ticket column | Kuru ticket (6), Coinbase ticket (7), Uniswap (5) | Column 880 + 16 gutter to 1200 (width 330, Kuru ticket 330). Contains the three regions below |
| Line input | Uniswap sentence input (5) | One sentence: "Sell 25% when 1 MON is worth [0.033] USDC". The number is 36 px weight 500 (Uniswap Basel 36 / 54 leading), preset chips under it at 28 px tall: Market, -5%, -10%, -20% below spot (Uniswap +1%, +5%, +10%; Kuru MID, BID, 1%, 5%, 10%) |
| Tranche rows | Coinbase parameter rows (7) | Up to 3 rows at a 40 px pitch, label left in mute, value right: Sell (MON amount), Line, Floor. Floor label sits inside the field above its value (Coinbase field 246 x 42, label inside) |
| What the keeper can do | Raycast Information block (1), Safe intent lines (9) | Five key-value rows at a 31 px pitch with 1 px hairlines between: Sells, At or below, Pays only to (address full width with copy icon, as Safe "To"), Largest single sale, Stops on. Footer bar 40 px (Raycast) holds Sign plan right-aligned and a "?" hint left |
| Sign + risk | Uniswap CTA and warning (5) | Sign plan button 330 x 54 px (Uniswap 480 x 54, narrowed to the column), directly under it the risk block 63 px tall at 14 px (Uniswap warning box): "A stop is not a guaranteed price..." |
| Venue check | Coinbase Subtotal / Est. Fee / Total (7) | Three label-value rows at 20 px pitch: Uniswap v3 quote, Kuru book quote, signed floor. Read time in mono mute beside each |

### 390 px wide

Single column, 16 px side padding (content 358 px, set). Order top to bottom, no horizontal scroll:
1. App bar 56 px, tabs collapse to Plan | Watch (Terminal moves behind the Actions key, Raycast "Actions" footer pattern).
2. Price row: 56 px price, stats wrap under it, 12 px.
3. Chart full bleed 390 x 260 px (set). Line label 20 px tall, axis tag 65 x 33 px as at 1440, line stays draggable with a 44 px touch target (set, a 1 px line with a 44 px hit area).
4. Line sentence input, same 36 px number, chips scroll horizontally in one 28 px row.
5. Tranche rows at a 40 px pitch, full width.
6. What the keeper can do: five rows at 31 px pitch, address wraps to two lines on mono.
7. Sign plan 358 x 54 px (Uniswap CTA 54), risk block directly under it, then the venue check rows.

## Watch screen

### 1440 px wide

| Region | Stolen from | Values |
|---|---|---|
| Status sentence | Raycast My Schedule opener (1), Linear activity line (10) | 88 px tall opener (Raycast): "MON 0.0412. Your first line is 0.033, 19.9% below." in 14 px, one bright figure per clause. Under it the strip: Armed, 3 permissions, last keeper check 14 s ago, expires in 53 days 4 h, as one 13 px line, not pills |
| Chart | Kuru and TradingView (6, 8) | Same 880 x 420 chart as Plan, lines solid after signing. On a fire: line pulses once (opacity 0.4 to 1, 200 ms), a marker drops to the fills list |
| Heartbeat | GitHub status bars (11) | Row under the chart: last 60 polls as 3 px wide bars at a 5 px pitch (GitHub 90 bars in 448 px), 24 px tall, ink; a missed poll is a gap with one red bar. Caption in 13 px: "last check 14 s ago", with hairlines either side (GitHub caption row 14 px) |
| Distance rows | Hyperliquid numeric table (4), Coinbase rows (7) | One row per tranche at a 25 px pitch: Line, Floor, Distance in percent and in USDC for the holder's balance, all right-aligned, tabular figures |
| Fills list | Linear activity (10), Safe audit log (9) | Right column or below chart, 32 px pitch sentences at 13 px: "Sold 1,205 MON at 0.0329. 39.6 USDC to 0x4a..e1, block 109,712,330", tx link in mono at the right; a tick for "Paid to your address". A refused call is the same line shape: "Keeper tried to sell above your line. Reverted: Tripwire:above-line" |
| Permissions | Safe Signed (1/3) steps (9), Raycast list (1) | Column 880 + 16 to 1200 (330 wide). Three rows at a 40 px pitch, each: id, status text (armed, fired, revoked), and a Revoke secondary button 72 x 31 px, hairline outline, radius 8 (Raycast pricing secondary 304 x 38 outline pattern, narrowed). Revoke is never in a menu |
| Try to cheat | Coinbase ticket rows (7), Safe audit log (9) | Card in the same column, 330 wide. Rows at 40 px: Attack (select: above the line, below the floor, past the plan, to another address), Amount. One button "Make the keeper try it" 330 x 36 (Kuru Connect 302 x 36). Result block under it, mono 13 px, Safe-style steps: Sent, Mined, Reverted by enforcer with the reason string read from the receipt, tx hash link |

### 390 px wide

Single column, 16 px padding: status sentence (88 px), chart 390 x 260, heartbeat bars (3 px bars at 5 px pitch fit 71 bars in 358 px, show the last 60 and 11 px of margin), distance rows 25 px pitch, fills list 32 px pitch with the tx link on the second line in mono, permissions rows 40 px with Revoke 72 x 31 px at the right, Try to cheat card last, result block full width. Page does not scroll horizontally.

## Three first-screen sketches for the Plan screen (1440 px)

### A. Chart first, ticket right (Kuru market page, Hyperliquid three-panel logic)

```
+--------------------------------------------------------------------------------------+
| tripwire     Plan  Watch  Terminal                                    [Connect]  56px |
+--------------------------------------------------------------------------------------+
| MON/USDC  0.0412      60 s avg 0.0409 | 24h 0.0388 - 0.0431            60px      |
+------------------------------------------------------+-------------------------------+
|                                           0.0431 .   | Sell 25% when 1 MON is worth  |
|                                  /\    ..            |  [ 0.033 ] USDC               |
|            ____        /\ ______/  \__/              |  Market  -5%  -10%  -20%      |
|    ______/    \  /\___/                              |-------------------------------|
| ~~ ~~ ~~ ~~ ~~ \/ ~~ ~~ ~~ ~~ ~~ ~~ ~~ ~~ ~~ .0409  | Tranche 1  1,205 MON  0.033   |
|========================== STOP 0.033 =====[0.033]===| Tranche 2  ...               |
| ///////////////// floor band ///////////////// 0.030 | Tranche 3  ...               |
|                                                      |-------------------------------|
|                       880 x 420                      | What the keeper can do        |
|                                                      |  Sells         MON for USDC   |
|                                                      |  At or below   0.033          |
|                                                      |  Pays only to  0x4a..e1       |
|                                                      |  Largest sale  2,400 MON      |
|                                                      |  Stops on      24 Nov 2026    |
|                                                      |  ------------- [Sign plan]    |
|                                                      | A stop is not a guaranteed ...|
+------------------------------------------------------+-------------------------------+
```

The red line is the largest object on the screen and the first thing read. The enforced facts and Sign are visible in the same viewport without scrolling at 1440 x 900.

### B. Sentence first, one column (Uniswap limit, Linear's reading width)

```
+--------------------------------------------------------------------------------------+
| tripwire     Plan  Watch  Terminal                                    [Connect]  56px |
+--------------------------------------------------------------------------------------+
|                         +--------------------------------------+                     |
|                         | MON 0.0412                            |                     |
|                         | Sell 25% (1,205 MON) when 1 MON is    |                     |
|                         | worth                                 |                     |
|                         |   0.033  USDC       (36 px)           |                     |
|                         | Market  -5%  -10%  -20%               |                     |
|                         +--------------------------------------+                     |
|                         | [ chart strip 480 x 160, red line ]   |                     |
|                         +--------------------------------------+                     |
|                         | What the keeper can do (5 rows)       |                     |
|                         | [        Sign plan (3 permissions) ]  |  480 x 54           |
|                         | A stop is not a guaranteed price ...  |  63 px              |
|                         +--------------------------------------+                     |
+--------------------------------------------------------------------------------------+
```

The plan reads as a sentence and works identically at 390 px. The chart is a 160 px strip, so the red line is not the dominant object and the draggable line is small.

### C. Review first, the sheet is the screen (Safe transaction details, Raycast Information block)

```
+--------------------------------------------------------------------------------------+
| tripwire     Plan  Watch  Terminal                                    [Connect]  56px |
+--------------------------------------------------------------------------------------+
| Plan for 0x4a..e1                                          3 permissions to sign     |
|----------------------------------------------------------+---------------------------|
| Sells          MON for USDC                              |  MON 0.0412               |
| At or below    0.033  (60 s average)        [edit]       |  chart 360 x 240          |
| For no less    0.030 USDC per MON           [edit]       |  ---- red line ----       |
| Largest sale   2,400 MON of 4,820                        |                           |
| Pays only to   0x4a..e1 (you)                            |                           |
| Stops on       24 Nov 2026 00:00 UTC                     |                           |
|----------------------------------------------------------+---------------------------|
| A stop is not a guaranteed price ...                                [Sign plan]      |
+--------------------------------------------------------------------------------------+
```

The legal-sheet reading is the most trustworthy and mirrors the wallet's readable twin. The chart shrinks to a 360 px side panel, the line is drag-editable only through the sheet's edit fields, and the screen looks like a form, not an instrument.

## Recommendation: A

Why A:
1. The product is the line. The lead message is "your keeper cannot sell while MON is above your line". The red 1 px line across an 880 x 420 chart, with the floor band under it, is that sentence drawn. B and C make the chart a strip or a side panel, which turns the claim back into text.
2. It is the only layout where the draggable line, the tranche rows and the five enforced facts are visible together without scrolling at 1440 x 900, so the holder can move the line and watch the size, the return and the fact "At or below 0.033" update in the same frame.
3. Its structure is stolen whole from two real screens at the same price scale as the product's own market (Kuru MON / USDC with its limit line and 330 px ticket, Hyperliquid's three-panel split), so a Monad trader reads it on sight.
4. It collapses cleanly to 390 px (chart, sentence, rows, facts, Sign) in the same order, so one skeleton serves Plan and Watch and nothing is invented per screen.

What A borrows from B and C so it is not just a trading terminal: the sentence input and its 36 px number from Uniswap (B), the key-value fact rows with the Sign button in a footer bar from Raycast and Safe (C). What it refuses from all three: candles, a balance hero, coloured buy and sell, avatars.

The sketches are first-screen layouts for the cold-reader judge step. Per the protocol a fresh demo-judge picks one against REFS.md and the negative list before any code; this file records the recommendation only.
