import { RANKS, SUITS, type Card, type JokerColor, type Rank, type Suit } from './types.js';

const SUIT_LETTER: Record<Suit, string> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const LETTER_SUIT: Record<string, Suit> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

export function makeCard(
  suit: Suit | null,
  rank: Rank | null,
  joker: JokerColor | null,
  copy: 0 | 1,
): Card {
  if (joker) {
    const code = joker === 'red' ? 'JR' : 'JB';
    return { id: `${code}-${copy}`, suit: null, rank: null, joker, copy };
  }
  if (!suit || !rank) {
    throw new Error('A suited card needs a suit and a rank');
  }
  return {
    id: `${SUIT_LETTER[suit]}${rank}-${copy}`,
    suit,
    rank,
    joker: null,
    copy,
  };
}

/** Two standard decks plus four jokers: 108 cards. */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const copy of [0, 1] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(makeCard(suit, rank, null, copy));
      }
    }
    cards.push(makeCard(null, null, 'red', copy));
    cards.push(makeCard(null, null, 'black', copy));
  }
  return cards;
}

export function cardPoints(card: Card): number {
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

export function sumPoints(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + cardPoints(card), 0);
}

/** Same printed card: same joker color, or same suit and rank. Copy index is ignored. */
export function identityKey(card: Card): string {
  if (card.joker) return `joker:${card.joker}`;
  return `${card.suit}:${card.rank}`;
}

export function sameIdentity(a: Card, b: Card): boolean {
  return identityKey(a) === identityKey(b);
}

/**
 * `H7` is copy 0, `H7#1` is copy 1. Jokers are `JR` and `JB`.
 * Suit letters: S H D C. Ranks: 2–10, J, Q, K, A.
 */
export function cardFromCode(code: string): Card {
  const [base, copyText] = code.split('#');
  if (!base || (copyText !== undefined && copyText !== '0' && copyText !== '1')) {
    throw new Error(`Bad card code ${code}`);
  }
  const copy: 0 | 1 = copyText === '1' ? 1 : 0;
  if (base === 'JR' || base === 'JB') {
    return makeCard(null, null, base === 'JR' ? 'red' : 'black', copy);
  }
  const suit = LETTER_SUIT[base[0] ?? ''];
  const rank = base.slice(1) as Rank;
  if (!suit || !RANKS.includes(rank)) {
    throw new Error(`Bad card code ${code}`);
  }
  return makeCard(suit, rank, null, copy);
}

export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(cardFromCode);
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. `random` must be uniform. Normal games pass a cryptographic source. */
export function shuffleDeck(cards: readonly Card[], random: () => number = Math.random): Card[] {
  const deck = cards.map((card) => ({ ...card }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = swap;
  }
  return deck;
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function indexToRank(index: number): Rank | null {
  return RANKS[index] ?? null;
}

/** 0 is deuce, 12 is ace. Above 12 the team has won. */
export function levelName(levelIndex: number): string {
  return indexToRank(levelIndex) ?? 'beyond-ace';
}
