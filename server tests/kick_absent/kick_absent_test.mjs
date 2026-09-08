// "Drop them & return to lobby": skipping the reconnect countdown when the other players
// have plainly gone. Run the dev stack first: npm run dev
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

console.log('\nCASE 1: the waiting player skips the countdown and lands in the lobby');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);

  b.socket.disconnect();
  c.socket.disconnect();
  await sleep(800);

  check('a countdown is running', a.view.game?.forfeitInMs > 0,
    `forfeitInMs=${a.view.game?.forfeitInMs}`);
  check('game has not ended yet — this is the wait being complained about',
    a.view.game?.phase === 'playing');

  a.view.lobby = null; // so the assertions below cannot pass on pre-game state
  const started = Date.now();
  const res = await em(a.socket, 'room:kickAbsentAndReturn');
  await sleep(300);
  const elapsed = Date.now() - started;

  check('accepted', res.ok, JSON.stringify(res));
  check('returned to the lobby without waiting out the countdown', elapsed < 3000,
    `took ${elapsed}ms (countdown is 30000ms)`);
  check('A is in the lobby', !!a.view.lobby);
  check('absent players were dropped',
    (a.view.lobby?.players || []).map((p) => p.name).join(',') === 'A',
    `roster=${(a.view.lobby?.players || []).map((p) => p.name)}`);
  check('A holds the lead', a.view.lobby?.hostId === a.playerId);

  // The win is still recorded, it just isn't sat through.
  const b2 = await seat('B2', a.roomCode);
  await sleep(200);
  const restart = await em(a.socket, 'room:start');
  await sleep(300);
  check('a new game can be started straight away', restart.ok, JSON.stringify(restart));

  [a, b, c, b2].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 2: not offered when there is nobody to drop');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);

  const res = await em(a.socket, 'room:kickAbsentAndReturn');
  check('refused while everyone is still connected',
    !res.ok && /nobody to drop/i.test(res.error || ''), JSON.stringify(res));
  check('game unaffected', a.view.game?.phase === 'playing');

  [a, b].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 3: a player who left cannot use it to end someone else\'s game');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);

  // C drops; A and B are both still here, so no countdown and nobody may skip one.
  c.socket.disconnect();
  await sleep(500);
  check('no countdown with two players present', !a.view.game?.forfeitInMs,
    `forfeitInMs=${a.view.game?.forfeitInMs}`);
  const res = await em(b.socket, 'room:kickAbsentAndReturn');
  check('refused — the game is still playable', !res.ok, JSON.stringify(res));
  check('game still running', a.view.game?.phase === 'playing');

  [a, b, c].forEach((s) => s.socket.disconnect());
}

console.log(`\n${failures === 0 ? 'ALL CASES PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
