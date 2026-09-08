// Exercises leaving a lobby and host succession through the real Socket.io server.
// Run the dev stack first: npm run dev
import { io } from 'socket.io-client';

const SERVER = process.env.COUP_SERVER_URL || 'http://localhost:3001';
const em = (s, e, p = {}) => new Promise((r) => s.emit(e, p, (res) => r(res)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// Each seat keeps the latest lobby state it was pushed, so we can assert that *other*
// players see the change, not just the one who left.
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

const hostSeenBy = (s) => {
  const l = s.view.lobby;
  return l ? l.players.find((p) => p.id === l.hostId)?.name : null;
};
const rosterSeenBy = (s) => (s.view.lobby ? s.view.lobby.players.map((p) => p.name) : null);

console.log('\nCASE 1: host succession follows join order (Sloth -> Liv -> David)');
{
  const sloth = await seat('Sloth');
  const liv = await seat('Liv', sloth.roomCode);
  const david = await seat('David', sloth.roomCode);
  await sleep(200);

  check('Sloth starts as lead', hostSeenBy(david) === 'Sloth', `saw ${hostSeenBy(david)}`);

  await em(sloth.socket, 'room:leave');
  await sleep(250);
  check('after Sloth leaves, Liv leads', hostSeenBy(david) === 'Liv', `saw ${hostSeenBy(david)}`);
  check('Sloth is gone from the roster', !rosterSeenBy(david).includes('Sloth'),
    `roster=${rosterSeenBy(david)}`);

  await em(liv.socket, 'room:leave');
  await sleep(250);
  check('after Liv leaves, David leads', hostSeenBy(david) === 'David', `saw ${hostSeenBy(david)}`);
  check('only David remains', String(rosterSeenBy(david)) === 'David', `roster=${rosterSeenBy(david)}`);

  [sloth, liv, david].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 2: a non-host leaving does not move the lead');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  await sleep(200);

  await em(b.socket, 'room:leave');
  await sleep(250);
  check('lead stays with A', hostSeenBy(c) === 'A', `saw ${hostSeenBy(c)}`);
  check('B removed for everyone else', !rosterSeenBy(c).includes('B'), `roster=${rosterSeenBy(c)}`);
  check('A also sees B gone', !rosterSeenBy(a).includes('B'), `roster=${rosterSeenBy(a)}`);

  [a, b, c].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 3: join order is stable — a later joiner does not jump the queue');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  const c = await seat('C', a.roomCode);
  await sleep(150);
  // B leaves and comes back as a brand new player, so should now be *last* in join order.
  await em(b.socket, 'room:leave');
  await sleep(150);
  const bAgain = await seat('B2', a.roomCode);
  await sleep(200);

  await em(a.socket, 'room:leave');
  await sleep(250);
  check('lead goes to C (joined before B2), not the newcomer',
    hostSeenBy(c) === 'C', `saw ${hostSeenBy(c)}`);

  [a, b, c, bAgain].forEach((s) => s.socket.disconnect());
}

console.log('\nCASE 4: the last player leaving cleans the room up');
{
  const solo = await seat('Solo');
  const code = solo.roomCode;
  await sleep(150);
  await em(solo.socket, 'room:leave');
  await sleep(200);

  const stranger = io(SERVER);
  await new Promise((r) => stranger.on('connect', r));
  const res = await em(stranger, 'room:join', { code, name: 'Stranger' });
  check('room no longer exists', !res.ok && /not found/i.test(res.error || ''),
    `join returned ${JSON.stringify(res)}`);

  stranger.disconnect();
  solo.socket.disconnect();
}

console.log('\nCASE 5: leaving mid-game holds the seat so the player can rejoin');
{
  const a = await seat('A');
  const b = await seat('B', a.roomCode);
  await sleep(200);
  await em(a.socket, 'room:start');
  await sleep(300);

  const res = await em(b.socket, 'room:leave');
  await sleep(300);
  check('server reports the seat was kept', res.ok && res.removed === false && res.canRejoin === true,
    JSON.stringify(res));
  const stillListed = a.view.game?.players.some((p) => p.name === 'B');
  check('B still holds a seat in the game', !!stillListed);
  check('B shows as disconnected', a.view.game?.players.find((p) => p.name === 'B')?.connected === false);

  const back = io(SERVER);
  await new Promise((r) => back.on('connect', r));
  const rejoin = await em(back, 'room:rejoin', { code: a.roomCode, playerId: b.playerId });
  await sleep(250);
  check('B can rejoin the still-active session', rejoin.ok, JSON.stringify(rejoin));
  check('B shows as connected again', a.view.game?.players.find((p) => p.name === 'B')?.connected === true);

  [a, b].forEach((s) => s.socket.disconnect());
  back.disconnect();
}

console.log(`\n${failures === 0 ? 'ALL CASES PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
