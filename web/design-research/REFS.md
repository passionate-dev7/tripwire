# tripwire: design references

Captured 2026-10-02 with `~/.claude/skills/ui-craft/scripts/refshot.py` in the signed-in `deepsurge` profile at 1440 x 900 (some `--full`). Each PNG has a `.tokens.json` beside it with computed fonts, sizes, tracking, leading, colours and radii. Where an entry says "measured from PNG" the number was counted off the 1440 px native pixels (plus or minus 2 px), not read from CSS. Where it says "tokens" it was read from the page's computed style.

Pilot: raycast home, Hyperliquid trade, Uniswap limit and Kuru home were captured first and every PNG was opened and looked at before the rest were captured. Two fixes came out of the pilot: Kuru's home is a swap page, so the real market screen (`/markets/<MON-USDC address>/trade`) replaced it; and the Raycast homepage is a marketing frame, so its full-page capture was cropped to the real command-window mock for study. Rejected by the capture tool or on review and replaced: Linear `/features` (blurred mid-animation), Linear `/issue-tracking` (login wall), orbs.com dLIMIT page (404), CoW Swap limit (cartoon onboarding gate, no usable order form).

The product's own live-data check: Kuru's MON/USDC market showed 0.03351 USDC on 2026-10-02, so a stop line at 0.033 sits about 1.5 percent under spot. Every layout must stay legible when the line is that close to the price.

North star: Raycast (three entries, 1 to 3). Domain references: 4 to 8 and 9. Premium outside the domain, found by problem shape: Linear's activity log (a history that reads as sentences), GitHub status (a heartbeat history that shows uptime as bars), Safe's audit log (a signed thing with its signer count).

## 1. Raycast app window: list, status sentence, action list (north star, product screen)

Screens: `refs/raycast-calendar-full-1440.png` (My Schedule window, native crop y 650 to 1500) and `refs/raycast-home-full-1440.png` (Clipboard History window, native crop x 330 to 1110, y 1620 to 2120). This is Raycast's real product chrome, shown as an extension mock.

The move worth stealing: a window that is one column of rows with a muted group label ("Today", "Wednesday Oct 28" 12px, #9c9c9d), then rows with a muted time and a bright title. Measured from PNG: window 750px wide, header 56px (the filter input sits in it), list column 280px, list row pitch 40px, selected row 262 x 38px with an 8px radius and a 5 percent white fill, key-value "Information" rows at a 31px pitch with a hairline between them, a 40px footer bar holding one primary action on the right ("Copy to Clipboard" with an enter key hint) and "Actions" with a command-K hint. The My Schedule window opens with a status sentence in 14px ("Good Afternoon! You had one event planned for today") above the list, 88px tall, before any row.

How it shows numbers and the primary action: the value is right aligned in the row, the label left in mute. The primary action lives in the footer bar of the card, not floating, and carries its keyboard shortcut. For tripwire: the "What the keeper can do" card is this Information block (five key-value rows at 31px pitch), the Sign button sits in a footer bar of the plan card, the Watch status sentence is the My Schedule opener.

What NOT to take: the wallpaper gradient behind the window, the red glow behind the Clipboard window, the coloured dots in the list, and the macOS menu bar frame.

## 2. Raycast pricing: plan cards and one raised card

Screen: `refs/raycast-pricing-1440.png`. Product-adjacent: a plan chooser with a segmented control, three cards and one primary action per card.

The move worth stealing: the middle card is raised 15px (its top edge at y 251 against 266 for its neighbours) with a 1px hairline and no shadow, so "the recommended thing" is a position, not a colour. Measured from PNG: segmented toggle 280 x 60px, pill radius; three cards inside a 1110px grid, each about 370px wide; price numeral "$8" is 76 x 59px tall glyphs (about 64px type) with the unit "/ month" beside it in a mono face (GeistMono loaded) at 14px; card CTA 304 x 38px, white fill with a dark label for the primary card and a hairline outline for the others. Tokens: nav a 14px weight 500 tracking 0.2px colour rgb(156,156,157), button radius 8px padding 8px 12px.

How it shows numbers: the number is large, the unit and the billing note are mono and mute, and the struck-through original price sits under it in the same mono. For tripwire the tranche rows can use the same pairing: the line in Inter at 22px, the unit "USDC per MON" in mono mute beside it.

What NOT to take: the red stripe image behind the toggle, the blue badge ticks on the cards, the "-20%" pill.

## 3. Raycast site chrome: nav pill, buttons, type tokens (north star tokens)

Screen: `refs/raycast-home-1440.png` and `refs/raycast-calendar-1440.png` (article page on the same canvas). Read for tokens, not for layout.

Measured from tokens: body background rgb(7,8,10) which is #07080a; h1 Inter 64px weight 600 leading 70.4px (calendar page h1 48px weight 600 leading 62.4px tracking 0.2px); h2 20px weight 500 tracking 0.2px; p 18px weight 400, mute rgb(156,156,157) on the article page; nav links 14px weight 500 tracking 0.2px with 6px radius and 12px 8px padding; button 14px weight 500, background rgb(230,230,230), text rgb(47,48,49), radius 8px, padding 8px 12px, measured 116 x 35px; input 14px weight 500, background rgba(255,255,255,0.05), radius 8px, padding 8px 12px. From the PNG: the nav is a floating pill 1204 x 74px at y 17 with a hairline border and a surface fill slightly lighter than the canvas, links centred, one white button at the right.

The move worth stealing: the whole type system is one family at three weights (400, 500, 600), 14px for every control, with a small positive tracking (0.2px) that makes 14px read as crisp on near-black. Controls are 8px radius, not pills, except the single white CTA.

What NOT to take: the 64px headline, the diagonal red stripe hero, the app-icon grid on the store page. The product's largest type is the 56px price.

## 4. Hyperliquid trade: the dense three-column order screen

Screen: `refs/hyperliquid-trade-1440.png` (signed out, so the order ticket is empty but fully drawn).

The move worth stealing: the order of regions and how little chrome separates them. Measured from PNG: chart column 0 to 897px, order book 903 to 1167px (264px), ticket 1173 to 1437px (264px), panel gaps about 4px, a market header strip of about 60px with five labelled stats (Mark, Oracle, 24h Change, 24h Volume, Open Interest) each a label over a value, a bottom tab row (Balances, Positions, Open Orders, TWAP, Trade History) at y 752 with the active tab underlined in 1px accent. Tokens: OurFont 12px weight 400 leading 15px everywhere; ticket button 31px tall, radius 8px, padding 0 16px; order book rows at a 25px pitch (166, 191, 216), size and total columns right aligned with the price column left, depth shown as a tinted bar the full height of the row behind it.

How it shows numbers and the empty state: every numeric column right aligns, 5 to 8 significant digits, labels in mute above, and the empty positions table says "No open positions yet" in one line at 12px with the column headers still drawn. The primary action is the full-width Connect button, 31px, teal.

What NOT to take: the teal and red candle and book colouring, the announcements toast covering the corner, the 12px type (tripwire body is 13 to 16px because its numbers are few and carry money), the leverage controls.

## 5. Uniswap limit: the price as a sentence

Screen: `refs/uniswap-limit-1440.png`.

The move worth stealing: the limit price is written as a sentence with the number as the biggest thing in the card ("When 1 ETH is worth 2744.55 USDC"). Measured from tokens and PNG: column exactly 480px wide, input card 480 x 143px, the number is Basel 36px weight 485 leading 54px, label row 14px; under the number four preset chips (Market, +1%, +5%, +10%) at a 28px height; a second row "Expiry" with four chips (1 day, 1 week, 1 month, 1 year); the primary CTA is 480 x 54px, full width; below it a 63px warning box, 14px, that reads "Limits may not execute exactly when tokens reach the specified price. Learn more." with an icon, directly under the button.

How it shows the risk: the caveat is attached to the button, in the same width, visible without a click. For tripwire: the risk block from gtm/tripwire/DESIGN.md section 4 sits directly under Sign plan at the same 480px width, and the "line" input reads as one sentence with preset chips (Market, -5%, -10%, -20% below spot).

What NOT to take: the pink accent, the token pills with coin logos, the warning triangle icon, the cards-in-cards stack (two nested rounded fills).

## 6. Kuru trade (MON/USDC): a limit price drawn on the chart, in the product's own market

Screen: `refs/kuru-trade-1440.png` (kuru.io market page for MON / USDC, signed out). The consumer trading bounty target uses this venue, so the price on screen is the product's own.

The move worth stealing: the limit order is a dashed horizontal line across the whole chart with a small label riding it. Measured from PNG: dashed line at y 256 running x 56 to 733, the "Place limit buy" label tag about 117 x 20px at x 449 on the line, two stacked 62 x 16px price tags on the right axis (current price 0.03351 above, line price 0.03346 below) so the gap between price and line reads without a ruler. Layout: chart 0 to 800px, order book 800 to 1085px with rows at a 26px pitch and three right-aligned columns (Price USDC, Size, Total), ticket 1098 to 1428px (330px) with the limit price input at 36px tall, preset chips MID, BID, 1%, 5%, 10%, a percent slider, and a 302 x 36px full width Connect button. Tokens: Inter 14px, 20px leading, pill radius 9999 on nav buttons, canvas rgb(10,10,10).

How it shows numbers: Inter with a tabular feel, thousand-style abbreviations (485K, 15.4K) in the book, and a spread row between asks and bids with the percent. The primary action is the green Connect button.

What NOT to take: the lime green accent, candle colouring, the TradingView drawing toolbar on the left (36px of icons), the 1h candle view. tripwire draws one line series, not candles.

## 7. Coinbase Advanced limit ticket: honest order fields

Screen: `refs/coinbase-adv-1440.png` (BTC-USD, signed out).

The move worth stealing: the ticket lists every parameter that changes the outcome as its own labelled row. Measured from PNG: ticket column 1170 to 1440px (270px); Buy / Sell segmented control 31px tall at the top; type tabs "Limit  Market  Stop Limit" at 12px; Limit price field about 246 x 42px with the label inside the box above the value and the unit (USD) at the right; then Amount, Pay with, Execution ("Allow taker"), Time in Force ("Good Til Canceled") as one-line rows at a 40px pitch; then Subtotal, Est. Fee, Total as three label-value rows in 12px; one white 31px primary "Sign up" button. Order book rows at a 20px pitch, three right-aligned columns, price colour only on the price column. Fonts: CoinbaseSans plus CoinbaseTextTnumRegular (a dedicated tabular-figure face) at 12px with 16px leading.

How it shows numbers: tabular figures in every numeric column, fees and totals visible before the action. For tripwire: "Time in Force" maps to "Stops on 24 Nov 2026", "Execution" maps to "Pays only to 0x4a..e1", and the Subtotal / Est. Fee / Total block maps to "Cost to you: 0 MON. The keeper pays gas."

What NOT to take: the blue links, the 12px density, the green Buy segment, the left rail of drawing tools.

## 8. TradingView chart: the axis price tag and the horizontal dotted line

Screen: `refs/tradingview-1440.png` (ETHUSD 1D, signed out).

The move worth stealing: how a price level is marked. Measured from PNG: a dotted 1px horizontal line at y 152 from the left edge to the axis; on the right axis a tag about 65 x 33px holding the price (2,744.42) over a countdown (13:26:44) in the line's colour, 12px; axis labels at a 50px vertical pitch in 12px mute; gridlines at 1px, near invisible; the sell and buy quote chips (2,744.40 SELL, 2,744.42 BUY) as two 78 x 33px outlined boxes with a 0.02 spread between them at the chart's top left. Tokens: chart text 12px, controls 14px, toolbar button radius 14px.

How it shows numbers: the key level has one colour and one label on the axis, so the eye reads "the line is at X" without hunting for a legend. tripwire copies the mechanism: the red line carries an axis tag with the line price (0.033) and the 60 s average gets a second, quieter tag, so the gap the contract reads is visible.

What NOT to take: the white UI (tripwire is dark), candle volume pane, the watchlist and key-facts sidebar, the bright toolbar. The chart library is a canvas, so these lines are drawn, not DOM; tripwire draws its own chart.

## 9. Safe transaction details: what you are signing, with its signer count

Screen: `refs/safe-tx-1440.png` (a public executed Safe transaction, signed out, cookie banner open at the lower right).

The move worth stealing: a signed intent shown as plain labelled lines plus an audit log. Measured from PNG: sidebar 230px wide; account header pill 52px tall (y 25 to 80) with address, "3/5" signer count and balance; the transaction card from x 254 to 1415 with a 16px radius; a two-column body with the intent on the left (Sent 90,000 MANA, To GnosisSafeProxy with the full address and copy and explorer icons) and an Audit Log on the right, 387px wide, with steps at a 54px pitch (Created, Signed (1/3), Signed (2/3), Signed (3/3)) joined by a thin vertical line. Tokens: DM Sans, h3 24px weight 600 leading 28.8px, card and chip radius 16px and 12px, body bg rgb(28,28,28).

How it shows trust: the count (3/3) and the signer addresses are inline text, and the recipient is the full address with a copy affordance, never hidden. For tripwire: the readable twin above the wallet prompt is this "Sent / To" block with the five facts, and "Signed (1/3), (2/3), (3/3)" is the exact pattern for signing three permissions.

What NOT to take: the green accent, the "Pro" upsell card, the avatar blobs, the cookie panel, the nested card inside a card (Fees and Transaction details sit in boxes inside the transaction box).

## 10. Linear issue view: the activity log as sentences

Screen: `refs/linear-home-full-1440.png` (native crop y 500 to 1700: a real Linear issue window, "Faster app launch").

The move worth stealing: history written as sentences with a relative time, one per line, at a steady pitch. Measured from PNG: window 1320px wide, sidebar 240px, header row about 50px, activity lines at a 32px pitch ("Linear created the issue via Slack on behalf of Karri, 2min ago", "Triage Intelligence added the labels Performance and iOS, 2min ago") in 13px mute with the actor and the object in a brighter weight; comment blocks as a 1px hairline box with an 8px radius. Tokens: Inter Variable; h1 64px weight 510 tracking -1.408px leading 64px; h2 48px weight 510 tracking -1.056px; h3 20px weight 590 tracking -0.24px; p 15px weight 400 leading 24px tracking -0.165px; nav 13px leading 19.5px colour rgb(138,143,152); Berkeley Mono for the small caps labels.

How it shows state: a status icon at the left of each line, the verb is plain text. For tripwire: the fills list on Watch is these sentences at a 32px pitch ("Sold 1,205 MON at 0.0329. 39.6 USDC to 0x4a..e1. Block 109,712,330"), and a rejected hostile call is a line in the same list ("Keeper tried to sell above the line. Reverted: Tripwire:above-line").

What NOT to take: the AI chat panel, the 64px negative-tracked marketing headline, the blue accent, the dim icon grid on the hero, the dark-grey gradient halo beneath the window.

## 11. GitHub status: a heartbeat history as bars

Screen: `refs/status-github-1440.png` (githubstatus.com). Outside the domain, chosen by the problem's shape: tripwire's keeper heartbeat must show "alive" and "dead for 3 minutes" without a spinner.

The move worth stealing: a row of narrow bars, one per day, where a missed beat is a red bar among green ones, with the uptime percentage between two hairlines. Measured from PNG: 90 bars across 448px (a 5px pitch, 34px tall), the caption row "90 days ago, a hairline, 100 % uptime, a hairline, Today" 14px at 50px under the bars, two cells per row each 490px wide and about 157px tall, a status word under each ("Normal"). Tokens: system sans 14px, h2 20px weight 600 leading 29px.

How it shows state: absence is visible. tripwire's status strip can show the last 60 polls as 3px bars at a 5px pitch under the red line ("last check 14 s ago"), all ink, and a gap or a red bar when a check was missed.

What NOT to take: the light theme, the mascot illustration, the full-width green banner, the green bars (tripwire bars are ink, the one red marks a miss).
