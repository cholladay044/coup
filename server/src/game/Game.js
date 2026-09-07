import { nanoid } from 'nanoid';
import {
  ACTIONS,
  buildDeck,
  shuffle,
  STARTING_COINS,
  STARTING_CARDS,
  FORCED_COUP_COINS,
} from './constants.js';

function makeCard(type) {
  return { id: nanoid(8), type, revealed: false };
}

export class Game {
  constructor(players) {
    // players: [{ id, name }]
    this.deck = shuffle(buildDeck());
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      coins: STARTING_COINS,
      cards: Array.from({ length: STARTING_CARDS }, () => makeCard(this.deck.pop())),
      connected: true,
    }));
    this.turnOrder = this.players.map((p) => p.id);
    this.turnIndex = 0;
    this.phase = 'playing'; // 'playing' | 'ended'
    this.winnerId = null;
    this.pendingAction = null;
    this.pendingLoss = null;
    this.log = [];

    this._pushLog(`Game started with ${this.players.length} players.`);
  }

  // ---------- helpers ----------

  _pushLog(message) {
    this.log.push({ id: nanoid(6), message, ts: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  isEliminated(player) {
    return player.cards.every((c) => c.revealed);
  }

  activePlayers() {
    return this.players.filter((p) => !this.isEliminated(p));
  }

  get currentPlayerId() {
    return this.turnOrder[this.turnIndex];
  }

  _assertNoBlockingState() {
    if (this.phase !== 'playing') throw new Error('Game has ended.');
    if (this.pendingLoss) throw new Error('Waiting for a player to choose a card to lose.');
  }

  // ---------- turn management ----------

  _advanceTurnIndex() {
    const n = this.turnOrder.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turnIndex + step) % n;
      const candidate = this.getPlayer(this.turnOrder[idx]);
      if (candidate && !this.isEliminated(candidate)) {
        this.turnIndex = idx;
        return;
      }
    }
  }

  endTurn() {
    this.pendingAction = null;
    if (this._checkGameOver()) return;
    this._advanceTurnIndex();
    const player = this.getPlayer(this.currentPlayerId);
    this._pushLog(`${player.name}'s turn.`);
  }

  _checkGameOver() {
    const active = this.activePlayers();
    if (active.length <= 1) {
      this.phase = 'ended';
      this.winnerId = active[0]?.id ?? null;
      this._pushLog(active[0] ? `${active[0].name} wins the game!` : 'Game over.');
      return true;
    }
    return false;
  }

  // ---------- losing influence ----------

  _initiateLoss(playerId, reason, onResolved) {
    const player = this.getPlayer(playerId);
    const unrevealed = player.cards.filter((c) => !c.revealed);
    if (unrevealed.length === 0) {
      this._continueAfterLoss(onResolved);
      return;
    }
    if (unrevealed.length === 1) {
      this._revealCard(player, unrevealed[0].id, reason);
      this._continueAfterLoss(onResolved);
      return;
    }
    this.pendingLoss = { playerId, reason, onResolved };
    this._pushLog(`${player.name} must choose an influence to give up (${reason}).`);
  }

  _revealCard(player, cardId, reason) {
    const card = player.cards.find((c) => c.id === cardId);
    card.revealed = true;
    this._pushLog(`${player.name} reveals ${card.type} (${reason}).`);
  }

  chooseLoss(playerId, cardId) {
    if (!this.pendingLoss || this.pendingLoss.playerId !== playerId) {
      throw new Error('You do not need to choose a card right now.');
    }
    const player = this.getPlayer(playerId);
    const card = player.cards.find((c) => c.id === cardId && !c.revealed);
    if (!card) throw new Error('Invalid card selection.');
    this._revealCard(player, cardId, this.pendingLoss.reason);
    const { onResolved } = this.pendingLoss;
    this.pendingLoss = null;
    this._continueAfterLoss(onResolved);
  }

  _continueAfterLoss(onResolved) {
    if (this._checkGameOver()) return;
    switch (onResolved.type) {
      case 'cancel-action-end-turn':
        this.endTurn();
        break;
      case 'proceed-after-action-challenge':
        this._advanceAfterChallengeWindow();
        break;
      case 'block-succeeds-end-turn':
        this.endTurn();
        break;
      case 'block-fails-resolve-action':
        this._resolveActionEffect();
        break;
      case 'end-turn':
        this.endTurn();
        break;
      default:
        this.endTurn();
    }
  }

  // ---------- declaring an action ----------

  declareAction(actorId, { type, targetId }) {
    this._assertNoBlockingState();
    if (this.pendingAction) throw new Error('An action is already pending.');
    if (actorId !== this.currentPlayerId) throw new Error('It is not your turn.');

    const actor = this.getPlayer(actorId);
    if (!actor || this.isEliminated(actor)) throw new Error('Invalid actor.');

    const def = ACTIONS[type];
    if (!def) throw new Error('Unknown action type.');

    if (actor.coins >= FORCED_COUP_COINS && type !== 'coup') {
      throw new Error('You have 10+ coins and must coup.');
    }
    if (actor.coins < def.cost) throw new Error('Not enough coins.');

    let target = null;
    if (def.requiresTarget) {
      target = this.getPlayer(targetId);
      if (!target || this.isEliminated(target) || target.id === actorId) {
        throw new Error('Invalid target.');
      }
    }

    actor.coins -= def.cost;

    this.pendingAction = {
      type,
      actorId,
      targetId: target?.id ?? null,
      claim: def.claim,
      challengeable: def.challengeable,
      blockedBy: def.blockedBy,
      phase: null,
      responded: new Set(),
      blockerId: null,
      blockClaim: null,
      exchangePool: null,
    };

    const targetPart = target ? ` targeting ${target.name}` : '';
    const claimPart = def.claim ? ` (claiming ${def.claim})` : '';
    this._pushLog(`${actor.name} attempts ${this._actionLabel(type)}${claimPart}${targetPart}.`);

    if (def.challengeable) {
      this._openChallengeWindow();
    } else if (def.blockedBy.length > 0) {
      this._openBlockWindow();
    } else {
      this._resolveActionEffect();
    }
  }

  _actionLabel(type) {
    return {
      income: 'Income',
      foreign_aid: 'Foreign Aid',
      coup: 'Coup',
      tax: 'Tax',
      assassinate: 'Assassinate',
      steal: 'Steal',
      exchange: 'Exchange',
    }[type];
  }

  // ---------- challenge window on the action's claim ----------

  _openChallengeWindow() {
    this.pendingAction.phase = 'action-challenge';
    this.pendingAction.responded = new Set();
  }

  _eligibleChallengers() {
    const { actorId } = this.pendingAction;
    return this.activePlayers().filter((p) => p.id !== actorId).map((p) => p.id);
  }

  _eligibleBlockers() {
    const { type, actorId, targetId } = this.pendingAction;
    if (type === 'foreign_aid') {
      return this.activePlayers().filter((p) => p.id !== actorId).map((p) => p.id);
    }
    if (type === 'assassinate' || type === 'steal') {
      return targetId ? [targetId] : [];
    }
    return [];
  }

  pass(playerId) {
    this._assertNoBlockingState();
    const pa = this.pendingAction;
    if (!pa) throw new Error('No pending action.');

    if (pa.phase === 'action-challenge') {
      const eligible = this._eligibleChallengers();
      if (!eligible.includes(playerId)) throw new Error('You cannot respond right now.');
      pa.responded.add(playerId);
      if (eligible.every((id) => pa.responded.has(id))) {
        this._advanceAfterChallengeWindow();
      }
    } else if (pa.phase === 'block-window') {
      const eligible = this._eligibleBlockers();
      if (!eligible.includes(playerId)) throw new Error('You cannot respond right now.');
      pa.responded.add(playerId);
      if (eligible.every((id) => pa.responded.has(id))) {
        this._resolveActionEffect();
      }
    } else if (pa.phase === 'block-challenge') {
      const eligible = this.activePlayers().filter((p) => p.id !== pa.blockerId).map((p) => p.id);
      if (!eligible.includes(playerId)) throw new Error('You cannot respond right now.');
      pa.responded.add(playerId);
      if (eligible.every((id) => pa.responded.has(id))) {
        this._pushLog(`The block stands.`);
        this.endTurn();
      }
    } else {
      throw new Error('Nothing to pass on right now.');
    }
  }

  _advanceAfterChallengeWindow() {
    const pa = this.pendingAction;
    if (!pa) return;
    if (pa.blockedBy.length > 0) {
      this._openBlockWindow();
    } else {
      this._resolveActionEffect();
    }
  }

  _openBlockWindow() {
    const pa = this.pendingAction;
    const eligible = this._eligibleBlockers();
    if (eligible.length === 0) {
      this._resolveActionEffect();
      return;
    }
    pa.phase = 'block-window';
    pa.responded = new Set();
  }

  // ---------- challenging a claim (action claim or block claim) ----------

  challenge(challengerId) {
    this._assertNoBlockingState();
    const pa = this.pendingAction;
    if (!pa) throw new Error('No pending action.');

    if (pa.phase === 'action-challenge') {
      const eligible = this._eligibleChallengers();
      if (!eligible.includes(challengerId)) throw new Error('You cannot challenge right now.');
      this._resolveChallenge({
        claimantId: pa.actorId,
        claim: pa.claim,
        challengerId,
        onClaimHolds: { type: 'proceed-after-action-challenge' },
        onClaimFails: { type: 'cancel-action-end-turn' },
      });
    } else if (pa.phase === 'block-challenge') {
      const eligible = this.activePlayers().filter((p) => p.id !== pa.blockerId).map((p) => p.id);
      if (!eligible.includes(challengerId)) throw new Error('You cannot challenge right now.');
      this._resolveChallenge({
        claimantId: pa.blockerId,
        claim: pa.blockClaim,
        challengerId,
        onClaimHolds: { type: 'block-succeeds-end-turn' },
        onClaimFails: { type: 'block-fails-resolve-action' },
      });
    } else {
      throw new Error('Nothing to challenge right now.');
    }
  }

  _resolveChallenge({ claimantId, claim, challengerId, onClaimHolds, onClaimFails }) {
    const claimant = this.getPlayer(claimantId);
    const challenger = this.getPlayer(challengerId);
    this._pushLog(`${challenger.name} challenges ${claimant.name}'s claim of ${claim}.`);

    const matchingCard = claimant.cards.find((c) => !c.revealed && c.type === claim);

    if (matchingCard) {
      this._pushLog(`${claimant.name} reveals ${claim} — the challenge fails.`);
      matchingCard.revealed = true;
      this.deck.push(matchingCard.type);
      this.deck = shuffle(this.deck);
      matchingCard.revealed = false;
      matchingCard.type = this.deck.pop();
      this._pushLog(`${claimant.name} draws a replacement card.`);
      this._initiateLoss(challengerId, `lost a challenge against ${claimant.name}`, onClaimHolds);
    } else {
      this._pushLog(`${claimant.name} cannot reveal ${claim} — the challenge succeeds.`);
      this._initiateLoss(claimantId, 'bluff called', onClaimFails);
    }
  }

  // ---------- claiming a block ----------

  block(playerId, character) {
    this._assertNoBlockingState();
    const pa = this.pendingAction;
    if (!pa || pa.phase !== 'block-window') throw new Error('No block window is open.');

    const eligible = this._eligibleBlockers();
    if (!eligible.includes(playerId)) throw new Error('You cannot block right now.');
    if (!pa.blockedBy.includes(character)) throw new Error('That character cannot block this action.');

    const blocker = this.getPlayer(playerId);
    pa.blockerId = playerId;
    pa.blockClaim = character;
    pa.phase = 'block-challenge';
    pa.responded = new Set();

    this._pushLog(`${blocker.name} blocks with ${character}.`);
  }

  // ---------- resolving the underlying effect ----------

  _resolveActionEffect() {
    const pa = this.pendingAction;
    const actor = this.getPlayer(pa.actorId);
    const target = pa.targetId ? this.getPlayer(pa.targetId) : null;

    switch (pa.type) {
      case 'income':
        actor.coins += 1;
        this._pushLog(`${actor.name} takes Income (+1 coin).`);
        this.endTurn();
        break;

      case 'foreign_aid':
        actor.coins += 2;
        this._pushLog(`${actor.name} takes Foreign Aid (+2 coins).`);
        this.endTurn();
        break;

      case 'tax':
        actor.coins += 3;
        this._pushLog(`${actor.name} collects Tax (+3 coins).`);
        this.endTurn();
        break;

      case 'steal': {
        const amount = Math.min(2, target.coins);
        target.coins -= amount;
        actor.coins += amount;
        this._pushLog(`${actor.name} steals ${amount} coin(s) from ${target.name}.`);
        this.endTurn();
        break;
      }

      case 'coup':
        this._pushLog(`${actor.name} launches a coup against ${target.name}.`);
        this._initiateLoss(target.id, 'hit by a coup', { type: 'end-turn' });
        break;

      case 'assassinate':
        this._pushLog(`${actor.name}'s assassination of ${target.name} succeeds.`);
        this._initiateLoss(target.id, 'assassinated', { type: 'end-turn' });
        break;

      case 'exchange': {
        const drawn = [this.deck.pop(), this.deck.pop()].filter(Boolean).map(makeCard);
        const unrevealed = actor.cards.filter((c) => !c.revealed);
        pa.phase = 'exchange-selection';
        pa.exchangePool = [...unrevealed, ...drawn];
        pa.exchangeKeepCount = unrevealed.length;
        this._pushLog(`${actor.name} draws cards to exchange with the court deck.`);
        break;
      }

      default:
        throw new Error('Unknown action to resolve.');
    }
  }

  exchangeSelect(playerId, keepCardIds) {
    this._assertNoBlockingState();
    const pa = this.pendingAction;
    if (!pa || pa.phase !== 'exchange-selection') throw new Error('No exchange in progress.');
    if (playerId !== pa.actorId) throw new Error('Only the exchanging player may choose.');
    if (keepCardIds.length !== pa.exchangeKeepCount) {
      throw new Error(`You must keep exactly ${pa.exchangeKeepCount} card(s).`);
    }
    const pool = pa.exchangePool;
    const keepSet = new Set(keepCardIds);
    if (![...keepSet].every((id) => pool.some((c) => c.id === id))) {
      throw new Error('Invalid card selection.');
    }

    const actor = this.getPlayer(playerId);
    const kept = pool.filter((c) => keepSet.has(c.id));
    const returned = pool.filter((c) => !keepSet.has(c.id));

    const revealedCards = actor.cards.filter((c) => c.revealed);
    actor.cards = [...revealedCards, ...kept];

    for (const c of returned) this.deck.push(c.type);
    this.deck = shuffle(this.deck);

    this._pushLog(`${actor.name} returns cards to the court deck.`);
    this.endTurn();
  }

  // ---------- serialization for clients ----------

  getPublicState(forPlayerId) {
    const pa = this.pendingAction;
    let pendingActionView = null;
    if (pa) {
      pendingActionView = {
        type: pa.type,
        actorId: pa.actorId,
        targetId: pa.targetId,
        claim: pa.claim,
        phase: pa.phase,
        blockerId: pa.blockerId,
        blockClaim: pa.blockClaim,
        blockedBy: pa.blockedBy,
        respondedIds: pa.responded ? [...pa.responded] : [],
        eligibleResponderIds:
          pa.phase === 'action-challenge'
            ? this._eligibleChallengers()
            : pa.phase === 'block-window'
              ? this._eligibleBlockers()
              : pa.phase === 'block-challenge'
                ? this.activePlayers().filter((p) => p.id !== pa.blockerId).map((p) => p.id)
                : [],
        exchangePool:
          pa.phase === 'exchange-selection' && pa.actorId === forPlayerId ? pa.exchangePool : null,
        exchangeKeepCount: pa.exchangeKeepCount ?? null,
      };
    }

    return {
      phase: this.phase,
      winnerId: this.winnerId,
      currentPlayerId: this.phase === 'playing' ? this.currentPlayerId : null,
      deckCount: this.deck.length,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        coins: p.coins,
        connected: p.connected,
        eliminated: this.isEliminated(p),
        cards: p.cards.map((c) =>
          c.revealed || p.id === forPlayerId ? { id: c.id, type: c.type, revealed: c.revealed } : { id: c.id, revealed: false },
        ),
      })),
      pendingAction: pendingActionView,
      pendingLoss: this.pendingLoss
        ? { playerId: this.pendingLoss.playerId, reason: this.pendingLoss.reason }
        : null,
      log: this.log.slice(-40),
    };
  }
}
