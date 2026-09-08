// Leaving a lobby, seen through real browsers: the roster updates for everyone still in
// the room, and when the lead leaves the host-only controls move to the next player.
const { chromium } = require('playwright-core');

const CLIENT = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// A separate context per player: the client keeps its session in localStorage, so sharing
// one would make the second "player" resume the first one's seat.
async function openSeat(browser, name, code) {
  const context = await browser.newContext({ viewport: { width: 700, height: 900 } });
  const page = await context.newPage();
  await page.goto(CLIENT);
  await page.fill('input[placeholder="Enter a name"]', name);
  if (code) {
    await page.click('.mode-toggle button:has-text("Join Room")');
    await page.fill('input[placeholder="ABCD"]', code);
    await page.click('button.primary:has-text("Join Room")');
  } else {
    await page.click('button.primary:has-text("Create Room")');
  }
  await page.waitForSelector('.room-code-box strong', { timeout: 15000 });
  return { name, context, page };
}

const roster = (seat) => seat.page.locator('.player-list li').allTextContents();
const hasStartButton = async (seat) =>
  (await seat.page.locator('button:has-text("Start Game")').count()) +
    (await seat.page.locator('button:has-text("Need at least 2 players")').count()) >
  0;
const isHostBadged = async (seat, name) =>
  (await seat.page.locator('.player-list li', { hasText: name }).locator('.badge', { hasText: 'Host' }).count()) > 0;

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  console.log('\nCASE 1: lead leaves — host controls move to the next player by join order');
  const sloth = await openSeat(browser, 'Sloth');
  sloth.page.on('pageerror', (e) => errors.push('Sloth: ' + e.message));
  const code = (await sloth.page.textContent('.room-code-box strong')).trim();
  const liv = await openSeat(browser, 'Liv', code);
  liv.page.on('pageerror', (e) => errors.push('Liv: ' + e.message));
  const david = await openSeat(browser, 'David', code);
  david.page.on('pageerror', (e) => errors.push('David: ' + e.message));
  await sleep(600);

  check('Sloth (lead) sees the start control', await hasStartButton(sloth));
  check('Liv does not see the start control', !(await hasStartButton(liv)));
  check('Liv sees the waiting message',
    (await liv.page.locator('.waiting-text').count()) > 0);
  check('everyone is listed for David', (await roster(david)).length === 3,
    `roster=${JSON.stringify(await roster(david))}`);

  await sloth.page.click('button:has-text("Leave Lobby")');
  await sleep(800);

  check('Sloth is returned to the home screen',
    (await sloth.page.locator('.home-screen').count()) > 0);
  check("Liv's roster drops Sloth immediately",
    !(await roster(liv)).some((t) => t.includes('Sloth')), `roster=${JSON.stringify(await roster(liv))}`);
  check('Liv is now badged Host', await isHostBadged(liv, 'Liv'));
  check('Liv now sees the start control', await hasStartButton(liv));
  check('David still does not see the start control', !(await hasStartButton(david)));

  console.log('\nCASE 2: lead leaves again — control moves on to David');
  await liv.page.click('button:has-text("Leave Lobby")');
  await sleep(800);
  check('David is now badged Host', await isHostBadged(david, 'David'));
  check('David now sees the start control', await hasStartButton(david));
  check('only David remains', (await roster(david)).length === 1,
    `roster=${JSON.stringify(await roster(david))}`);
  check('start is disabled with one player',
    (await david.page.locator('button:has-text("Need at least 2 players")').count()) > 0);

  await david.page.screenshot({ path: 'playwright tests/lobby_leave/lobby_leave_screenshot.png' });

  console.log('\nCASE 3: last player leaves — the room is gone');
  await david.page.click('button:has-text("Leave Lobby")');
  await sleep(600);
  check('David is returned to the home screen',
    (await david.page.locator('.home-screen').count()) > 0);

  // Stay on the home screen for this one — openSeat() would create a fresh room.
  const ghostContext = await browser.newContext({ viewport: { width: 700, height: 900 } });
  const ghostPage = await ghostContext.newPage();
  await ghostPage.goto(CLIENT);
  await ghostPage.fill('input[placeholder="Enter a name"]', 'Ghost');
  await ghostPage.click('.mode-toggle button:has-text("Join Room")');
  await ghostPage.fill('input[placeholder="ABCD"]', code);
  await ghostPage.click('button.primary:has-text("Join Room")');
  await sleep(800);
  const ghostError = (await ghostPage.locator('.error-text').textContent().catch(() => '')) || '';
  check('rejoining the deleted room code is refused', /not found/i.test(ghostError),
    ghostError || '(no error shown)');
  check('Ghost stays on the home screen',
    (await ghostPage.locator('.home-screen').count()) > 0);
  await ghostContext.close();

  console.log('\nSUMMARY');
  check('no uncaught client errors', errors.length === 0, errors.join('; '));

  for (const s of [sloth, liv, david]) await s.context.close();
  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
