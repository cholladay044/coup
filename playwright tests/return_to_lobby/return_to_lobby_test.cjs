// The end-of-game screen, through real browsers: the lead takes everyone back to the same
// lobby, and a non-lead gets a confirmation before leaving for the home screen.
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

// A context per player — the client keeps its session in localStorage, so a shared context
// would make the second browser resume the first one's seat.
async function openSeat(browser, name, code, errors) {
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
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

// Plays whatever the UI is currently asking this seat for. Assassinate when affordable so
// games finish quickly, otherwise Income; always allow, so nothing needs a bluff decision.
async function driveSeat(page) {
  const exchange = page.locator('.modal', { hasText: 'card(s) to keep' });
  if (await exchange.count()) {
    const need = parseInt((await exchange.locator('h3').textContent()).match(/Choose (\d+)/)[1], 10);
    for (let i = 0; i < need; i++) await exchange.locator('.card-choice').nth(i).click();
    await exchange.locator('button.primary').click();
    return true;
  }
  const loss = page.locator('.modal', { hasText: 'Choose an influence to give up' });
  if (await loss.count()) {
    await loss.locator('.card-choice').first().click();
    return true;
  }
  const allow = page.locator('.response-buttons button.secondary');
  if (await allow.count()) {
    await allow.first().click();
    return true;
  }
  for (const label of ['Assassinate', 'Coup']) {
    const btn = page.locator('.action-btn', { hasText: label });
    if ((await btn.count()) && !(await btn.first().isDisabled())) {
      await btn.first().click();
      const target = page.locator('.target-btn');
      await target.first().waitFor({ timeout: 5000 });
      await target.first().click();
      return true;
    }
  }
  const income = page.locator('.action-btn', { hasText: 'Income' });
  if (await income.count()) {
    await income.first().click();
    return true;
  }
  return false;
}

// Starts a 3-player game, drops the bot straight away (its seat is held, so no forfeit
// fires while two browsers are still connected), then plays the two browser seats to a
// real finish. The dropped bot is what the pruning assertion later checks.
async function playToWinner(lead, other, code) {
  const bot = io(SERVER);
  await new Promise((r) => bot.on('connect', r));
  await em(bot, 'room:join', { code, name: 'Bot' });
  await sleep(400);
  await lead.page.click('button:has-text("Start Game")');
  await lead.page.waitForSelector('.game-screen', { timeout: 15000 });
  await sleep(400);
  bot.disconnect();
  await sleep(500);

  for (let i = 0; i < 400; i++) {
    if (await lead.page.locator('.modal', { hasText: 'wins!' }).count()) break;
    const moved = (await driveSeat(lead.page)) || (await driveSeat(other.page));
    await sleep(moved ? 80 : 200);
  }
  await lead.page.waitForSelector('.modal:has-text("wins!")', { timeout: 20000 });
  await other.page.waitForSelector('.modal:has-text("wins!")', { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  console.log('\nCASE 1: the lead returns everyone to the lobby they played from');
  {
    const lead = await openSeat(browser, 'Lead', null, errors);
    const code = (await lead.page.textContent('.room-code-box strong')).trim();
    const other = await openSeat(browser, 'Other', code, errors);
    await sleep(400);
    await playToWinner(lead, other, code);

    check('lead sees "Back to Lobby"',
      (await lead.page.locator('button:has-text("Back to Lobby")').count()) > 0);
    check('non-lead does not see "Back to Lobby"',
      (await other.page.locator('button:has-text("Back to Lobby")').count()) === 0);
    check('non-lead is told who they are waiting on',
      /Waiting for Lead/.test((await other.page.locator('.modal').textContent()) || ''),
      (await other.page.locator('.modal').textContent())?.replace(/\s+/g, ' ').trim());
    check('the old "Back to Home" wording is gone from the lead\'s primary action',
      (await lead.page.locator('button.primary:has-text("Back to Home")').count()) === 0);

    await lead.page.click('button:has-text("Back to Lobby")');
    await sleep(1000);

    check('lead lands in the lobby, not the home screen',
      (await lead.page.locator('.lobby-screen').count()) > 0 &&
        (await lead.page.locator('.home-screen').count()) === 0);
    check('the other player is taken back too',
      (await other.page.locator('.lobby-screen').count()) > 0);
    check('it is the same lobby',
      (await other.page.textContent('.room-code-box strong')).trim() === code);
    check('both players are still on the roster',
      (await lead.page.locator('.player-list li').count()) === 2,
      `roster=${JSON.stringify(await lead.page.locator('.player-list li').allTextContents())}`);
    check('the disconnected bot was pruned',
      !(await lead.page.locator('.player-list li').allTextContents()).some((t) => t.includes('Bot')));
    check('they can start another game immediately',
      (await lead.page.locator('button:has-text("Start Game")').count()) > 0);

    await lead.page.screenshot({ path: 'playwright tests/return_to_lobby/return_to_lobby_screenshot.png' });
    await lead.context.close();
    await other.context.close();
  }

  console.log('\nCASE 2: a non-lead leaving is confirmed first, and only removes them');
  {
    const lead = await openSeat(browser, 'Lead', null, errors);
    const code = (await lead.page.textContent('.room-code-box strong')).trim();
    const other = await openSeat(browser, 'Other', code, errors);
    await sleep(400);
    await playToWinner(lead, other, code);

    await other.page.click('button:has-text("Back to Home")');
    await sleep(400);
    check('a confirmation is shown rather than leaving straight away',
      (await other.page.locator('.modal:has-text("Leave this lobby?")').count()) > 0);
    check('still in the session while the prompt is up',
      (await other.page.locator('.home-screen').count()) === 0);

    await other.page.click('button:has-text("Stay")');
    await sleep(300);
    check('"Stay" returns to the result screen',
      (await other.page.locator('.modal:has-text("wins!")').count()) > 0 &&
        (await other.page.locator('.home-screen').count()) === 0);

    await other.page.click('button:has-text("Back to Home")');
    await other.page.click('button:has-text("Leave Lobby")');
    await sleep(900);
    check('confirming sends them to the home screen',
      (await other.page.locator('.home-screen').count()) > 0);

    await lead.page.click('button:has-text("Back to Lobby")');
    await sleep(900);
    check('the lead still reaches the lobby',
      (await lead.page.locator('.lobby-screen').count()) > 0);
    check('the player who left is not on the roster',
      (await lead.page.locator('.player-list li').count()) === 1,
      `roster=${JSON.stringify(await lead.page.locator('.player-list li').allTextContents())}`);

    await lead.context.close();
    await other.context.close();
  }

  console.log('\nSUMMARY');
  check('no uncaught client errors', errors.length === 0, errors.join('; '));

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
