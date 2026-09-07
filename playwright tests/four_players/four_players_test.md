# Four Players Formatting Test

## Purpose

Check the game board layout at a mid-range player count (4) — between `min_players_test.md`
(2) and `max_players_test.md` (6, `MAX_PLAYERS`). At 4 players the opponents row wraps into an
uneven 2+1 grid, which is a different shape than either extreme and worth checking on its own.

## Status

Done — ran successfully at 1440x900 (desktop) and 820x1000 (narrow). See **Findings**.

## Prerequisites

Same as `max_players_test.md`:

```bash
npm install playwright-core --no-save
npx playwright install chromium
sudo npx playwright install-deps chromium
```

The local dev stack must also be running (`npm run dev` from the repo root; server on :3001,
client on :5173).

## Approach

Same pattern as the other two tests: one real Playwright browser session (the "Viewer", who
creates the room and starts the game) plus **3** Socket.io bot connections joining as the other
players, for 4 total. Screenshot the result.

## Script

Save as `playwright tests/four_players/four_players_test.cjs`:

```js
const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

const TOTAL_PLAYERS = 4; // a mid-range count between MIN_PLAYERS (2) and MAX_PLAYERS (6)

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
  for (let i = 2; i <= TOTAL_PLAYERS; i++) {
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
  console.log(`${TOTAL_PLAYERS - 1} bot(s) joined`);

  await page.waitForTimeout(1000);
  await page.click('button:has-text("Start Game")');
  await page.waitForSelector('.game-screen', { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'playwright tests/four_players/four_players_screenshot.png', fullPage: true });
  console.log('screenshot saved');

  for (const s of bots) s.disconnect();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Running it

Run from the **repo root** (the script's screenshot path is relative to it):

```bash
node "playwright tests/four_players/four_players_test.cjs"
```

Screenshot is written to `playwright tests/four_players/four_players_screenshot.png`.

## What to check in the screenshot

- The 2+1 opponents grid (2 in the first row, 1 alone in the second) wraps and centers cleanly,
  same as the 2+2+1 case at 6 players.
- The lone third-row card doesn't look misaligned relative to the pair above it.
- No overlap, no horizontal scroll, log panel and action panel sized normally.

## Findings

**Desktop (1440x900):** Clean. Opponents wrap into a 2+1 grid — Player2/Player3 in the first
row, Player4 centered alone in the second, consistent with the centering behavior already
verified for the 6-player 2+2+1 case. No overlap or overflow. Everything else (action panel, log
panel, self-row, help button) matches the other player counts.

**Narrow (820x1000):** Clean. Same 2+1 wrap. The `board-layout` responsive breakpoint (980px)
now stacks the log panel *above* the board and the action panel *below* the self-row — swapped
from the desktop order for a more mobile-friendly flow (see `min_players_test.md` for the
rationale and a note on `fullPage` screenshot artifacts around the fixed help button). Re-ran
with 8 rounds of real turns to check the log under load: caps correctly at 160px with a
scrollbar. Verified no help-button/action-panel overlap by scrolling to the true bottom rather
than trusting the `fullPage` capture.

**Log panel centering (narrow only):** the log panel is capped with `max-width: 480px` and
centered with `margin: 0 auto` instead of stretching full-width (see `min_players_test.md` for
the two false starts along the way — an `align-self`/`width: 100%` interaction that under-sized
it, then a CSS source-order pitfall). Confirmed it renders at the full 480px and stays centered,
even populated with real data.

**Conclusion:** No layout changes needed at 4 players, at either width.
