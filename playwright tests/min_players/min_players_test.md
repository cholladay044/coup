# Min Players Formatting Test

## Purpose

Check that the game board layout looks right at the opposite extreme from
`max_players_test.md`: a room filled to only `MIN_PLAYERS` (2, see
`server/src/game/constants.js`) — specifically that a single opponent card doesn't look
lost/off-center, and that the board isn't awkwardly sparse.

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

Same pattern as the max-players test: one real Playwright browser session (the "Viewer", who
creates the room and starts the game) plus **1** Socket.io bot connection joining as the second
player — the minimum needed to start a game at all (`MIN_PLAYERS`). Screenshot the result.

## Script

Save as `playwright tests/min_players/min_players_test.cjs`:

```js
const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

const TOTAL_PLAYERS = 2; // MIN_PLAYERS

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

  await page.screenshot({ path: 'playwright tests/min_players/min_players_screenshot.png', fullPage: true });
  console.log('screenshot saved');

  for (const s of bots) s.disconnect();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Running it

Run from the **repo root** (the script's screenshot path is relative to it):

```bash
node "playwright tests/min_players/min_players_test.cjs"
```

Screenshot is written to `playwright tests/min_players/min_players_screenshot.png`.

## What to check in the screenshot

- The single opponent card in `.opponents-row` is centered, not stranded to one side.
- The board doesn't look broken/sparse with only one opponent — spacing between the opponents
  row and self-row should look intentional, not like something's missing.
- Action panel, log panel, and help button are all in their normal spots (this is the shortest
  possible game screen, so it's the most likely case to reveal any layout that assumed more
  content height).

## Findings

**Desktop (1440x900):** Clean. The single opponent card centers correctly under
`justify-content: center` on `.opponents-row` (that rule holds for any card count, including
one). The gap and divider above the self-row look proportionate, not sparse. Action panel, log
panel (single "Game started with 2 players." entry), and the bottom-right help button all sit in
their normal, non-overlapping positions.

**Narrow (820x1000):** Clean. Same centered single-opponent-card behavior. The `board-layout`
responsive breakpoint (980px) stacks the log panel above the board and the action panel below
the self-row (see Note below) — a swap from the panel order used at desktop width, done for a
more mobile-friendly flow: glance at recent history first, then act near your own cards. Re-ran
with several turns of real activity (not just the initial "Game started" message) to check the
log under load: it correctly caps at the narrow-screen 160px height with a scrollbar,
auto-scrolled to the latest entry. `.screen` has extra bottom padding on narrow widths so the
fixed help button doesn't collide with the action panel now that it's last in the stack —
confirmed no overlap by scrolling to the true bottom (a `fullPage` screenshot alone is misleading
here, see Note).

**Note on `fullPage` screenshots and fixed elements:** `page.screenshot({ fullPage: true })`
doesn't correctly composite `position: fixed` elements against tall pages — the help button can
appear to overlap content in the screenshot that it doesn't actually overlap for a real, scrolled
user. When checking anything near the help button, scroll to the bottom and take a normal
(non-fullPage) screenshot instead, or compare bounding boxes after scrolling.

**Log panel centering (narrow only):** the log panel was stretching full-width via
`align-items: stretch` on `.board-layout`. First attempt used `align-self: center` +
`width: 100%` + `max-width: 480px`, which rendered at only ~300px — `width: 100%` doesn't
reliably resolve against the container once `align-self` opts an item out of stretch. Switched to
the standard pattern instead: leave the item stretched (default), cap it with `max-width: 480px`,
and center the leftover space with `margin: 0 auto`.

**CSS source-order pitfall (second occurrence):** that fix initially still rendered at 300px for
an unrelated reason — this file has an unconditional `.log-panel { width: 300px }` rule (for
desktop) that sits *later* in `App.css` than the narrow media-query override, so it won its
cascade regardless of viewport width, exactly like the `.log-feed` `max-height` bug documented in
`max_players_test.md`. Fixed the same way: moved the narrow override to immediately after the
base `.log-panel` rule instead of leaving it earlier in the file. Worth remembering when adding
any future narrow-only override in this stylesheet — check where the unconditional rule for that
selector lives, not just whether the media query condition is correct.

**Conclusion:** No layout changes needed at min players, at either width.
