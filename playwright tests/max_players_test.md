# Max Players Formatting Test

## Purpose

Check that the game board layout holds up when a room is filled to `MAX_PLAYERS` (6, see
`server/src/game/constants.js`) — specifically the opponents row wrapping, player-card sizing,
and overall spacing in `board-layout` (action rail / board center / log panel).

## Status

Done — ran successfully at two viewport widths (1440x900 desktop, 820x1000 narrow). See
**Findings**.

## Prerequisites

Run from the repo root (`/home/cholladay/projects/coup`):

```bash
npm install playwright-core --no-save
npx playwright install chromium
sudo npx playwright install-deps chromium
```

The local dev stack must also be running:

```bash
npm run dev   # server on :3001, client on :5173
```

## Approach

Manually recruiting 6 human players isn't practical, so this test drives **one real browser
session** via Playwright (the "Viewer", who creates the room and starts the game) plus **5
lightweight Socket.io bot connections** that join the same room directly against the server's
game protocol. The bots don't need a UI — they just need to occupy the other 5 player slots so
the Viewer's browser renders a genuine 6-player board. We then screenshot the result.

## Script

Save as `playwright tests/max_players_test.cjs`:

```js
const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173');

  await page.fill('input[placeholder="Enter a name"]', 'Viewer');
  // Home has two "Create Room" buttons: the mode-toggle tab and the form's submit button.
  // Target the submit button specifically (class "primary") to avoid clicking the tab.
  await page.click('button.primary:has-text("Create Room")');

  await page.waitForSelector('.room-code-box strong', { timeout: 10000 });
  const roomCode = (await page.textContent('.room-code-box strong'))?.trim();
  console.log('room code:', roomCode);
  if (!roomCode || roomCode.length !== 4) throw new Error(`unexpected room code: "${roomCode}"`);

  const bots = [];
  for (let i = 2; i <= 6; i++) {
    const s = io('http://localhost:3001');
    await new Promise((resolve, reject) => {
      s.on('connect', () => {
        s.emit('room:join', { code: roomCode, name: `Player${i}` }, (res) => {
          if (res?.ok) resolve(); else reject(new Error(res?.error));
        });
      });
    });
    bots.push(s);
  }
  console.log('5 bots joined');

  await page.waitForTimeout(1000);
  await page.click('button:has-text("Start Game")');
  await page.waitForSelector('.game-screen', { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'playwright tests/max_players_screenshot.png', fullPage: true });
  console.log('screenshot saved');

  for (const s of bots) s.disconnect();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Running it

Run from the **repo root** (the script's screenshot path is relative to it):

```bash
node "playwright tests/max_players_test.cjs"
```

Screenshot is written to `playwright tests/max_players_screenshot.png`.

## What to check in the screenshot

- The opponents row (5 cards) wraps cleanly without overlapping or overflowing the viewport.
- The action rail and log panel stay legible and aren't squeezed out at common widths.
- `.player-card`'s effective min-width (driven by its two `.card.small` children) doesn't force
  horizontal scrolling on the page.
- Row-to-row spacing when opponents wrap onto a second line looks consistent with the gap above
  the self-row.
- Text (names, "(you)" tag, coin counts) doesn't clip or overlap card art at 6 players.

## Findings

Ran at two viewports; screenshots saved alongside this file (not committed — regenerable, see
`.gitignore`).

**Desktop (1440x900):** Clean. Opponents wrap into a 2+2+1 grid, each wrapped row centered
independently, no card overlap, no horizontal scroll. Action rail and log panel both stay
comfortably sized. The earlier "(you)" tag / cards-row overlap fix (16px header margin) holds up
fine even with a card in its "claimed" glow state.

**Narrow (820x1000):** The `board-layout` responsive breakpoint (980px) correctly stacks the log
panel below the board instead of beside it. Opponents still wrap 2+2+1 with no overlap or
overflow. Action panel buttons reflow to fewer per row and stay legible.

**One observation, not a bug:** the floating "?" rules button (`position: fixed`, bottom-right)
stays pinned to the viewport corner. On the narrow layout, where the page is taller than the
viewport, it can end up sitting on top of whatever card is scrolled into that corner. This is the
standard trade-off of any floating action/help button (e.g. chat widgets do the same) — flagging
it here in case it's ever worth revisiting (e.g. nudging it up when a modal/panel is open nearby),
but not something I'd change unprompted.

**Bugs found and fixed in the test script itself** (not the app): Home screen has two "Create
Room" buttons (mode-toggle tab + form submit) with identical text — the original selector clicked
the wrong one. Also, the room code text has no whitespace separating it from surrounding labels
in the DOM (`Room Code5FP4Share...`), so a body-text regex couldn't isolate it; fixed by reading
`.room-code-box strong` directly. Both fixes are reflected in the script above.

**Real bug found and fixed** (in the app, via this test): at 6 players the page grows taller than
one viewport, but `html, body, #root` were pinned to `height: 100%` while `.screen` uses
`min-height: 100vh` and grows past it. The body's radial-gradient background is painted only
within its own box, so past the first viewport height there was no gradient at all — visible as a
flat/dark seam right around where the self-row lands. Fixed in `client/src/index.css` by changing
`height: 100%` to `min-height: 100%` on `html, body, #root`, so the background box grows with the
content. (A `background-attachment: fixed` variant was tried first but rejected — it produced a
black void in `fullPage` Playwright screenshots, a stitching artifact, not a real rendering bug,
but confusing for screenshot-based review, so plain `min-height` was kept instead.) Re-ran this
test after the fix at both viewports to confirm — screenshots now show a consistent gradient with
no seam.

**Conclusion:** Formatting itself needs no changes at max players. One real background-sizing bug
was found and fixed via this test (see above).
