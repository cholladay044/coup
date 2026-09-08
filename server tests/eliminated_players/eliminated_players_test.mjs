import { Game } from '../../server/src/game/Game.js';

const card = (id, type, revealed = false) => ({ id, type, revealed });
const newGame = () => new Game([
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
]);
let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// ---------------------------------------------------------------------------
console.log('\nCASE 1: target is eliminated mid-action (challenged the assassin and lost)');
// A assassinates B. B has one influence left and challenges — A really holds Assassin, so
// B loses their last card and is eliminated *before* the block window would open on them.
{
  const g = newGame();
  g.getPlayer('a').cards = [card('a1', 'Assassin'), card('a2', 'Duke')];
  g.getPlayer('b').cards = [card('b1', 'Captain', true), card('b2', 'Contessa')];
  g.getPlayer('c').cards = [card('c1', 'Duke'), card('c2', 'Captain')];
  g.getPlayer('a').coins = 3;
  g.turnIndex = 0;

  g.declareAction('a', { type: 'assassinate', targetId: 'b' });
  check('block window not open yet', g.pendingAction.phase === 'action-challenge');
  g.challenge('b');

  check('B is eliminated', g.isEliminated(g.getPlayer('b')));
  check('no pending action left open', g.pendingAction === null,
    g.pendingAction ? `stuck in phase "${g.pendingAction.phase}"` : '');
  check('no pending loss left open', g.pendingLoss === null);
  check('game still playing (A and C alive)', g.phase === 'playing', `phase=${g.phase}`);
  check('turn moved off the dead player', g.currentPlayerId !== 'b', `current=${g.currentPlayerId}`);
  console.log('   log:', JSON.stringify(g.log.slice(-3).map((e) => e.message)));
}

// ---------------------------------------------------------------------------
console.log('\nCASE 2: player eliminated on their own turn (caught bluffing)');
// A bluffs Tax with one influence left; C challenges and A loses their last card.
{
  const g = newGame();
  g.getPlayer('a').cards = [card('a1', 'Captain', true), card('a2', 'Ambassador')];
  g.getPlayer('b').cards = [card('b1', 'Duke'), card('b2', 'Contessa')];
  g.getPlayer('c').cards = [card('c1', 'Duke'), card('c2', 'Captain')];
  g.turnIndex = 0;

  g.declareAction('a', { type: 'tax' });
  g.challenge('c');

  check('A is eliminated', g.isEliminated(g.getPlayer('a')));
  check('no pending action left open', g.pendingAction === null,
    g.pendingAction ? `stuck in phase "${g.pendingAction.phase}"` : '');
  check('no pending loss left open', g.pendingLoss === null);
  check('turn advanced off A', g.currentPlayerId !== 'a', `current=${g.currentPlayerId}`);
  check('turn went to a living player', !g.isEliminated(g.getPlayer(g.currentPlayerId)));
}

// ---------------------------------------------------------------------------
console.log('\nCASE 3: turn pointer never lands on an eliminated player');
{
  const g = newGame();
  g.getPlayer('a').cards = [card('a1', 'Duke'), card('a2', 'Captain')];
  g.getPlayer('b').cards = [card('b1', 'Duke', true), card('b2', 'Captain', true)]; // dead
  g.getPlayer('c').cards = [card('c1', 'Duke'), card('c2', 'Captain')];
  g.turnIndex = 0;

  const seen = [];
  for (let i = 0; i < 6; i++) { g.endTurn(); seen.push(g.currentPlayerId); }
  check('B never gets a turn', !seen.includes('b'), `sequence=${seen.join(',')}`);
  check('alternates between the living players', seen.every((id) => id === 'a' || id === 'c'));
}

// ---------------------------------------------------------------------------
console.log('\nCASE 4: cannot declare an action against an already-eliminated player');
{
  const g = newGame();
  g.getPlayer('a').cards = [card('a1', 'Assassin'), card('a2', 'Duke')];
  g.getPlayer('b').cards = [card('b1', 'Duke', true), card('b2', 'Captain', true)]; // dead
  g.getPlayer('c').cards = [card('c1', 'Duke'), card('c2', 'Captain')];
  g.getPlayer('a').coins = 7;
  g.turnIndex = 0;

  let threw = null;
  try { g.declareAction('a', { type: 'coup', targetId: 'b' }); } catch (e) { threw = e.message; }
  check('coup on a dead player is rejected', threw !== null, `threw=${JSON.stringify(threw)}`);
}

console.log(`\n${failures === 0 ? 'ALL CASES PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
