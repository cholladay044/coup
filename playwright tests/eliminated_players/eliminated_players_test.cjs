const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3001';
const CLIENT = 'http://localhost:5173';
const ROUNDS = 4; // full games to play
const STALL_MS = 10000; // no state change for this long => the game is stuck

const em = (s, e, p = {}) => new Promise((r) => s.emit(e, p, (res) => r(res)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The browser seat plays a deliberately simple policy so every choice is reachable through
// real UI controls: Income when possible, Coup (with target pick) when forced at 10 coins,
// always Allow on responses, always the first option in the loss/exchange modals.
async function driveBrowserSeat(page) {
  const exchange = page.locator('.modal', { hasText: 'card(s) to keep' });
  if (await exchange.count()) {
    const keep = exchange.locator('.card-choice');
    const need = parseInt((await exchange.locator('h3').textContent()).match(/Choose (\d+)/)[1], 10);
    for (let i = 0; i < need; i++) await keep.nth(i).click();
    await exchange.locator('button.primary').click();
    return 'exchange';
  }

  const loss = page.locator('.modal', { hasText: 'Choose an influence to give up' });
  if (await loss.count()) {
    await loss.locator('.card-choice').first().click();
    return 'chooseLoss';
  }

  // Responding to someone else's claim: always allow, so games actually progress.
  const allow = page.locator('.response-buttons button.secondary');
  if (await allow.count()) {
    await allow.first().click();
    return 'allow';
  }

  const income = page.locator('.action-btn', { hasText: 'Income' });
  if (await income.count()) {
    await income.first().click();
    return 'income';
  }

  // Forced coup at 10+ coins: Income is not offered, so pick a target.
  const coup = page.locator('.action-btn', { hasText: 'Coup' });
  if (await coup.count()) {
    await coup.first().click();
    const target = page.locator('.target-btn');
    await target.first().waitFor({ timeout: 5000 });
    await target.first().click();
    return 'coup';
  }

  return null; // nothing for this seat to do right now
}

async function playGame(browser, roundIdx, pageErrors) {
  // A fresh context per round: the client stores a session in localStorage and would
  // otherwise auto-rejoin the previous room instead of creating a new one.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(CLIENT);
  await page.fill('input[placeholder="Enter a name"]', 'Viewer');
  await page.click('button.primary:has-text("Create Room")');
  await page.waitForSelector('.room-code-box strong', { timeout: 15000 });
  const code = (await page.textContent('.room-code-box strong')).trim();

  const bots = [];
  for (const name of ['BotA', 'BotB']) {
    const s = io(SERVER);
    await new Promise((r) => s.on('connect', r));
    await em(s, 'room:join', { code, name });
    bots.push({ name, socket: s });
  }

  let st = null;
  let lastChange = Date.now();
  bots[0].socket.on('game:state', (next) => {
    if (JSON.stringify(next) !== JSON.stringify(st)) lastChange = Date.now();
    st = next;
  });

  await sleep(400);
  await page.click('button:has-text("Start Game")');
  await page.waitForSelector('.game-screen', { timeout: 15000 });
  while (!st) await sleep(50);

  const nameOf = (id) => st.players.find((p) => p.id === id)?.name;
  const seatOf = (n) => bots.find((b) => b.name === n)?.socket;
  const observed = { fizzle: false, midActionElimination: false, turnOnDead: false };

  while (st.phase === 'playing') {
    if (Date.now() - lastChange > STALL_MS) {
      const pa = st.pendingAction;
      throw new Error(
        `STALL in round ${roundIdx}: no progress for ${STALL_MS}ms. ` +
          `phase=${pa ? pa.phase : 'no pendingAction'} pendingLoss=${
            st.pendingLoss ? nameOf(st.pendingLoss.playerId) : 'none'
          } current=${nameOf(st.currentPlayerId)}`,
      );
    }

    // The turn pointer must never rest on an eliminated player.
    const cur = st.players.find((p) => p.id === st.currentPlayerId);
    if (cur && cur.eliminated) observed.turnOnDead = true;

    // Nor may the game ever ask an eliminated player to respond. This is the direct
    // assertion of the property; without it the stall only shows up as a timeout.
    const deadResponder = (st.pendingAction?.eligibleResponderIds || [])
      .map((id) => st.players.find((p) => p.id === id))
      .find((p) => p && p.eliminated);
    if (deadResponder) observed.waitingOnDead = deadResponder.name;

    if (st.log.some((e) => /fizzles — they are already out/.test(e.message))) observed.fizzle = true;

    // Whoever the game is waiting on acts. Bots go through sockets, the browser seat
    // through real UI controls.
    let acted = false;

    if (st.pendingLoss) {
      const who = nameOf(st.pendingLoss.playerId);
      const sock = seatOf(who);
      if (sock) {
        const p = st.players.find((x) => x.name === who);
        await em(sock, 'game:chooseLoss', { cardId: p.cards.find((c) => !c.revealed).id });
        acted = true;
      }
    } else if (st.pendingAction) {
      const pa = st.pendingAction;
      if (pa.phase === 'exchange-selection') {
        const who = nameOf(pa.actorId);
        const sock = seatOf(who);
        if (sock) {
          const mine = st.players.find((x) => x.name === who).cards.filter((c) => !c.revealed);
          await em(sock, 'game:exchangeSelect', {
            keepCardIds: mine.slice(0, pa.exchangeKeepCount).map((c) => c.id),
          });
          acted = true;
        }
      } else {
        // Deliberately never answer for an eliminated seat — a knocked-out player has no
        // reason to respond, and may well have closed the tab. If the game is waiting only
        // on the dead, it is stuck, and the watchdog below should say so.
        const waiting = (pa.eligibleResponderIds || [])
          .filter((id) => !pa.respondedIds.includes(id))
          .filter((id) => !st.players.find((p) => p.id === id)?.eliminated);
        const botTurn = waiting.map(nameOf).find((n) => seatOf(n));
        if (botTurn) {
          // Bots challenge aggressively — that is what drives eliminations mid-action,
          // which is the case that used to hang the game.
          const sock = seatOf(botTurn);
          const canChallenge = pa.phase === 'action-challenge' || pa.phase === 'block-challenge';
          await em(sock, canChallenge ? 'game:challenge' : 'game:pass');
          acted = true;
        }
      }
    } else {
      const who = nameOf(st.currentPlayerId);
      const sock = seatOf(who);
      if (sock) {
        const me = st.players.find((x) => x.name === who);
        // Prefer whoever is closest to elimination. Combined with the always-challenge
        // policy below, this is what reliably produces the case that used to hang: the
        // target of an assassination challenges it and loses their *last* influence.
        const alive = (p) => p.cards.filter((c) => !c.revealed).length;
        const foes = st.players
          .filter((p) => p.id !== me.id && !p.eliminated)
          .sort((x, y) => alive(x) - alive(y));
        const before = st.players.filter((p) => p.eliminated).length;
        const move =
          me.coins >= 7
            ? { type: 'coup', targetId: foes[0].id }
            : me.coins >= 3
              ? { type: 'assassinate', targetId: foes[0].id }
              : { type: 'income' };
        await em(sock, 'game:action', move);
        if (move.type === 'assassinate' && before < st.players.filter((p) => p.eliminated).length) {
          observed.midActionElimination = true;
        }
        acted = true;
      }
    }

    if (!acted) {
      // It is the browser seat's move.
      const did = await driveBrowserSeat(page);
      if (did) acted = true;
    }

    await sleep(acted ? 60 : 150);
  }

  const winner = nameOf(st.winnerId);
  const eliminated = st.players.filter((p) => p.eliminated).map((p) => p.name);
  await sleep(400);

  // Client-side assertions: the winner modal, and no "Current Turn" badge on a dead seat.
  const modalShown = (await page.locator('.modal', { hasText: 'wins!' }).count()) > 0;
  const deadWithTurnBadge = await page.locator('.player-card.eliminated .turn-tag').count();
  const deadSeats = await page.locator('.player-card.eliminated').count();

  if (roundIdx === ROUNDS) {
    await page.screenshot({ path: 'playwright tests/eliminated_players/eliminated_players_screenshot.png' });
  }

  for (const b of bots) b.socket.disconnect();
  await context.close();

  return { winner, eliminated, observed, modalShown, deadWithTurnBadge, deadSeats };
}

async function main() {
  const browser = await chromium.launch();
  const pageErrors = [];

  let failures = 0;
  const check = (label, cond, detail = '') => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!cond) failures++;
  };

  let sawFizzle = false;
  for (let i = 1; i <= ROUNDS; i++) {
    console.log(`\nROUND ${i}`);
    const r = await playGame(browser, i, pageErrors);
    console.log(`  winner=${r.winner} eliminated=[${r.eliminated.join(',')}]`);
    check('game reached a winner without stalling', !!r.winner);
    check('never waited on an eliminated player to respond', !r.observed.waitingOnDead,
      r.observed.waitingOnDead ? `blocked on eliminated "${r.observed.waitingOnDead}"` : '');
    check('turn pointer never rested on an eliminated player', !r.observed.turnOnDead);
    check('winner modal rendered', r.modalShown);
    check('no "Current Turn" badge on an eliminated seat', r.deadWithTurnBadge === 0);
    check('eliminated seats rendered with eliminated styling', r.deadSeats === r.eliminated.length,
      `styled=${r.deadSeats} expected=${r.eliminated.length}`);
    if (r.observed.fizzle) sawFizzle = true;
  }

  console.log('\nSUMMARY');
  check('no uncaught client errors', pageErrors.length === 0, pageErrors.join('; '));
  console.log(
    `  NOTE  target-died-mid-action ("fizzles") path was ${sawFizzle ? 'exercised' : 'not hit'} this run` +
      ' (random hands; the deterministic cover for it is in server tests/eliminated_players/).',
  );

  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
