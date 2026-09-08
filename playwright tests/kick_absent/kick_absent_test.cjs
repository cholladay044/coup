// The "Drop them & return to lobby" button on the reconnect countdown banner.
const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3001';
const CLIENT = 'http://localhost:5173';
const em = (s, e, p = {}) => new Promise((r) => s.emit(e, p, (res) => r(res)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(CLIENT);
  await page.fill('input[placeholder="Enter a name"]', 'Lead');
  await page.click('button.primary:has-text("Create Room")');
  await page.waitForSelector('.room-code-box strong', { timeout: 15000 });
  const code = (await page.textContent('.room-code-box strong')).trim();

  const bots = [];
  for (const name of ['BotA', 'BotB']) {
    const s = io(SERVER);
    await new Promise((r) => s.on('connect', r));
    await em(s, 'room:join', { code, name });
    bots.push(s);
  }
  await sleep(400);
  await page.click('button:has-text("Start Game")');
  await page.waitForSelector('.game-screen', { timeout: 15000 });
  await sleep(400);

  console.log('\nCASE 1: both opponents drop, leaving the lead waiting');
  bots.forEach((s) => s.disconnect());
  await page.waitForSelector('.forfeit-notice', { timeout: 15000 });
  check('the countdown banner appears', (await page.locator('.forfeit-notice').count()) > 0);
  check('it offers more time', (await page.locator('.forfeit-extend').count()) > 0);
  check('it offers to drop the absent players',
    (await page.locator('.forfeit-kick').count()) > 0);
  check('the label is pluralised for two absentees',
    /Drop them all & return to lobby/.test((await page.locator('.forfeit-kick').textContent()) || ''),
    await page.locator('.forfeit-kick').textContent());
  check('still mid-game while waiting',
    (await page.locator('.modal:has-text("wins!")').count()) === 0);

  await page.screenshot({ path: 'playwright tests/kick_absent/kick_absent_screenshot.png' });

  console.log('\nCASE 2: clicking it returns to the lobby immediately');
  const started = Date.now();
  await page.click('.forfeit-kick');
  await page.waitForSelector('.lobby-screen', { timeout: 10000 });
  const elapsed = Date.now() - started;

  check('landed in the lobby without waiting out the 30s countdown', elapsed < 5000,
    `took ${elapsed}ms`);
  check('it is the same room', (await page.textContent('.room-code-box strong')).trim() === code);
  check('the absent players were dropped from the roster',
    (await page.locator('.player-list li').count()) === 1,
    `roster=${JSON.stringify(await page.locator('.player-list li').allTextContents())}`);
  check('the lead can start another game', (await page.locator('button').allTextContents())
    .some((t) => /Start Game|Need at least 2 players/.test(t)));
  check('no win modal was left on screen',
    (await page.locator('.modal:has-text("wins!")').count()) === 0);

  console.log('\nSUMMARY');
  check('no uncaught client errors', errors.length === 0, errors.join('; '));

  await context.close();
  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
