export const CHARACTER_INFO = {
  Duke: { color: '#7b3fe4', ability: 'Take 3 coins (Tax). Blocks Foreign Aid.', action: 'Tax: +3' },
  Assassin: { color: '#2b2b2b', ability: 'Pay 3 coins to assassinate another player.', action: 'Kill: 3 coins' },
  Captain: { color: '#2b7de1', ability: 'Steal 2 coins from another player. Blocks stealing.', action: 'Steal: 2' },
  Ambassador: { color: '#2ea043', ability: 'Exchange cards with the court deck. Blocks stealing.', action: 'Exchange' },
  Contessa: { color: '#d1293d', ability: 'Blocks assassination.', action: 'Blocks Kill' },
};

export const ACTION_INFO = {
  income: { label: 'Income', desc: '+1 coin. Cannot be blocked or challenged.' },
  foreign_aid: { label: 'Foreign Aid', desc: '+2 coins. Can be blocked by the Duke.' },
  coup: { label: 'Coup', desc: '7 coins: force a player to lose an influence. Cannot be blocked.' },
  tax: { label: 'Tax (Duke)', desc: '+3 coins. Can be challenged.' },
  assassinate: { label: 'Assassinate', desc: '3 coins: target loses an influence. Blocked by Contessa.' },
  steal: { label: 'Steal (Captain)', desc: 'Take 2 coins from a player. Blocked by Captain/Ambassador.' },
  exchange: { label: 'Exchange (Ambassador)', desc: 'Draw 2 cards, choose which to keep.' },
};

export const ACTION_CLAIM = {
  tax: 'Duke',
  assassinate: 'Assassin',
  steal: 'Captain',
  exchange: 'Ambassador',
};
