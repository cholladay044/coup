// Returning to the lobby after a game ends. Run the dev stack first: npm run dev
import { io } from 'socket.io-client';

const SERVER = process.env.COUP_SERVER_URL || 'http://localhost:3001';
const em = (s, e, p = {}) => new Promise((r) => s.emit(e, p, (res) => r(res)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

async function seat(name, code) {
  const socket = io(SERVER);
  await new Promise((r) => socket.on('connect', r));
  const view = { lobby: null, game: null };
  socket.on('lobby:state', (s) => { view.lobby = s; });
  socket.on('game:state', (s) => { view.game = s; });
  const res = code
    ? await em(socket, 'room:join', { code, name })
    : await em(socket, 'room:create', { name });
  if (!res.ok) throw new Error(`${name} could not enter room: ${res.error}`);
  return { name, socket, view, playerId: res.playerId, roomCode: res.roomCode };
}

// Ends a game the quick way: everyone but one player leaves, so the forfeit resolves.
// Extending the timer is not needed — we just wait it out via the server's own countdown.
async function endGameByForfeit(winner, losers) {
  for (const l of losers) l.socket.disconnect();
  for (let i = 0; i < 120 && winner.view.game?.phase !== 'ended'; i++) await sleep(500);
  if (winner.view.game?.phase !== 'ended') throw new Error('game did not end via forfeit');
}

// Plays a real game to a winner, acting only for the seats we still control. A forfeit
// needs exactly one connected player, so this is the only way to finish a game while
// several players are still present — which is what the roster assertions need.
async function playToCompletion(seats, view) {
  const owned = new Map(seats.map((s) => [s.name, s.socket]));
  const nameOf = (id) => view.game.players.find((p) => p.id === id)?.name;
  for (let ops = 0; ops < 500 && view.game?.phase === 'playing'; ops++) {
    const st = view.game;
    if (st.pendingLoss) {
      const who = nameOf(st.pendingLoss.playerId);
      const sock = owned.get(who);
      if (sock) {
        const p = st.players.find((x) => x.name === who);
        await em(sock, 'game:chooseLoss', { cardId: p.cards.find((c) => !c.revealed).id });
      }
    } else if (st.pendingAction) {
      const pa = st.pendingAction;
      if (pa.phase === 'exchange-selection') {
        const who = nameOf(pa.actorId);
        const sock = owned.get(who);
        if (sock) {
          const mine = st.players.find((x) => x.name === who).cards.filter((c) => !c.revealed);
          await em(sock, 'game:exchangeSelect', {
            keepCardIds: mine.slice(0, pa.exchangeKeepCount).map((c) => c.id),
          });
        }
      } else {
        const waiting = (pa.eligibleResponderIds || [])
          .filter((id) => !pa.respondedIds.includes(id))
          .map(nameOf)
          .find((n) => owned.has(n));
        if (waiting) await em(owned.get(waiting), 'game:pass');
      }
    } else {
      const who = nameOf(st.currentPlayerId);
      const sock = owned.get(who);
      if (sock) {
        const me = st.players.find((x) => x.name === who);
        const foes = st.players.filter((p) => p.id !== me.id && !p.eliminated);
        const move =
          me.coins >= 7
            ? { type: 'coup', targetId: foes[0].id }
            : me.coins >= 3
              ? { type: 'assassinate', targetId: foes[0].id }
              : { type: 'income' };
        await em(sock, 'game:action', move);
      }
    }
    await sleep(50);
  }
  if (view.game?.phase !== 'ended') throw new Error('game did not reach a winner');
}

console.log('\nCASE 1: the lead takes everyone back to the lobby, roster intact');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  const d = await seat('D', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);
  check('game is running', a.view.game?.phase === 'playing');
  check('game state carries hostId for the end screen', a.view.game?.hostId === a.playerId,
    `hostId=${a.view.game?.hostId}`);

  // D walks out mid-game. Three players are still connected, so no forfeit fires and the
  // remaining three have to actually finish the game — which is the point: the roster
  // assertions below need survivors who are present *and* one who is not.
  await em(d.socket, 'room:leave');
  await sleep(300);
  await playToCompletion([a, b, c], a.view);
  check('game ended with a winner', a.view.game?.phase === 'ended',
    `phase=${a.view.game?.phase}`);

  // Clear the pre-game lobby state so the assertions below can't pass on stale data.
  [a, b, c].forEach((s) => { s.view.lobby = null; });

  const res = await em(a.socket, 'room:returnToLobby');
  await sleep(300);
  check('lead may return everyone', res.ok, JSON.stringify(res));
  check('A is back in a lobby', !!a.view.lobby);
  check('B is back in the same lobby', b.view.lobby?.code === a.roomCode,
    `code=${b.view.lobby?.code}`);
  check('every player still present is kept, even if they were eliminated',
    (a.view.lobby?.players || []).map((p) => p.name).sort().join(',') === 'A,B,C',
    `roster=${(a.view.lobby?.players || []).map((p) => p.name)}`);
  check('the player who left was pruned',
    !(a.view.lobby?.players || []).some((p) => p.name === 'D'));

  // And the whole point: they can immediately start again.
  const restart = await em(a.socket, 'room:start');
  await sleep(300);
  check('a new game can be started right away', restart.ok, JSON.stringify(restart));
  check('a fresh game is running', a.view.game?.phase === 'playing');

  [a, b, c, d].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 2: a non-lead cannot return everyone while the lead is present');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);
  // End it by having a third-party-free forfeit: B leaves, A wins after the countdown.
  await em(b.socket, 'room:leave');
  for (let i = 0; i < 120 && a.view.game?.phase !== 'ended'; i++) await sleep(500);
  check('game ended', a.view.game?.phase === 'ended');

  // B rejoins so there is a connected non-lead to test with.
  const back = io(SERVER);
  await new Promise((r) => back.on('connect', r));
  const bView = { lobby: null, game: null };
  back.on('lobby:state', (s) => { bView.lobby = s; });
  back.on('game:state', (s) => { bView.game = s; });
  await em(back, 'room:rejoin', { code: a.roomCode, playerId: b.playerId });
  await sleep(300);

  const denied = await em(back, 'room:returnToLobby');
  check('non-lead is refused', !denied.ok && /only the lead/i.test(denied.error || ''),
    JSON.stringify(denied));
  check('still on the end screen', a.view.game?.phase === 'ended');

  const allowed = await em(a.socket, 'room:returnToLobby');
  await sleep(300);
  check('the lead can still do it', allowed.ok, JSON.stringify(allowed));
  check('the rejoined player came back to the lobby too', !!bView.lobby);

  a.socket.disconnect(); b.socket.disconnect(); back.disconnect();
}

console.log('\nCASE 3: if the lead is gone, a remaining player can return everyone');
{
  const a = await seat('A'); // lead
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);

  // The lead drops out, then the game ends by forfeit in B's favour.
  await endGameByForfeit(b, [a, c]);
  check('game ended with the lead absent', b.view.game?.phase === 'ended');
  check('B is not the lead', b.view.game?.hostId !== b.playerId, `hostId=${b.view.game?.hostId}`);

  const res = await em(b.socket, 'room:returnToLobby');
  await sleep(300);
  check('a connected non-lead may act when the lead is absent', res.ok, JSON.stringify(res));
  check('B is in the lobby', !!b.view.lobby);
  check('absent players were pruned', (b.view.lobby?.players || []).map((p) => p.name).join(',') === 'B',
    `roster=${(b.view.lobby?.players || []).map((p) => p.name)}`);
  check('lead passed to the only player left', b.view.lobby?.hostId === b.playerId);

  [a, b, c].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 4: cannot return to the lobby while the game is still going');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);
  const res = await em(a.socket, 'room:returnToLobby');
  check('refused mid-game', !res.ok && /still in progress/i.test(res.error || ''), JSON.stringify(res));
  check('game unaffected', a.view.game?.phase === 'playing');
  [a, b].forEach((s) => s.socket.disconnect());
}

console.log(`\n${failures === 0 ? 'ALL CASES PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
