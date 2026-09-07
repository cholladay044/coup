export const CHARACTERS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];

export const COPIES_PER_CHARACTER = 3;

export const STARTING_COINS = 2;
export const STARTING_CARDS = 2;
export const FORCED_COUP_COINS = 10;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// Action definitions: the single source of truth for cost, claim, and
// whether an action can be challenged or blocked, and by which characters.
export const ACTIONS = {
  income: {
    cost: 0,
    claim: null,
    challengeable: false,
    blockedBy: [],
    requiresTarget: false,
  },
  foreign_aid: {
    cost: 0,
    claim: null,
    challengeable: false,
    blockedBy: ['Duke'],
    requiresTarget: false,
  },
  coup: {
    cost: 7,
    claim: null,
    challengeable: false,
    blockedBy: [],
    requiresTarget: true,
  },
  tax: {
    cost: 0,
    claim: 'Duke',
    challengeable: true,
    blockedBy: [],
    requiresTarget: false,
  },
  assassinate: {
    cost: 3,
    claim: 'Assassin',
    challengeable: true,
    blockedBy: ['Contessa'],
    requiresTarget: true,
  },
  steal: {
    cost: 0,
    claim: 'Captain',
    challengeable: true,
    blockedBy: ['Captain', 'Ambassador'],
    requiresTarget: true,
  },
  exchange: {
    cost: 0,
    claim: 'Ambassador',
    challengeable: true,
    blockedBy: [],
    requiresTarget: false,
  },
};

export function buildDeck() {
  const deck = [];
  for (const character of CHARACTERS) {
    for (let i = 0; i < COPIES_PER_CHARACTER; i++) {
      deck.push(character);
    }
  }
  return deck;
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
