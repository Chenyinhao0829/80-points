import { chainIndex } from './trump.js';
import { RANKS, SUITS, type Card, type Rank, type Suit, type TrumpState } from './types.js';

/**
 * Side-suit order for each trump suit. The trump suit itself is always last.
 * Diamonds: spades, hearts, clubs.
 * Hearts: spades, diamonds, clubs.
 * Spades: diamonds, clubs, hearts.
 * Clubs: diamonds, spades, hearts.
 */
const SIDE_BY_TRUMP: Record<Suit, readonly Suit[]> = {
  diamonds: ['spades', 'hearts', 'clubs'],
  hearts: ['spades', 'diamonds', 'clubs'],
  spades: ['diamonds', 'clubs', 'hearts'],
  clubs: ['diamonds', 'spades', 'hearts'],
};

const NO_TRUMP_ORDER: readonly Suit[] = ['spades', 'diamonds', 'clubs', 'hearts'];

/**
 * Visual hand order.
 * Each suit is one block, low to high by real trump strength.
 * Side suits stay on the left. The trump suit follows them.
 * Off-suit trump-rank cards, the trump-suit trump-rank, then the jokers, are last.
 */
export function arrangeHand(cards: readonly Card[], trump: TrumpState | null): Card[] {
  const trumpSuit = trump && !trump.noTrump ? trump.suit : null;
  const jokers = cards
    .filter((card) => card.joker)
    .sort((a, b) => (a.joker === 'red' ? 1 : 0) - (b.joker === 'red' ? 1 : 0) || a.id.localeCompare(b.id));
  const subordinates = cards
    .filter((card) => isDeclaredRank(card, trump) && card.suit !== trumpSuit)
    .sort((a, b) => suitIndex(a.suit, trump) - suitIndex(b.suit, trump) || a.id.localeCompare(b.id));
  const masters = cards
    .filter((card) => isDeclaredRank(card, trump) && card.suit === trumpSuit)
    .sort((a, b) => a.id.localeCompare(b.id));
  const order = sideSuits(trump);
  const sides = order.flatMap((suit) => suitBlock(cards, suit, trump));
  const trumpPips = trumpSuit ? suitBlock(cards, trumpSuit, trump) : [];
  return [...sides, ...trumpPips, ...subordinates, ...masters, ...jokers];
}

export function sortHand(cards: readonly Card[], trump: TrumpState | null): Card[] {
  return arrangeHand(cards, trump);
}

export type HandGroup = Suit | 'trump' | 'joker';

export function handGroup(card: Card, trump: TrumpState | null): HandGroup {
  if (card.joker) return 'joker';
  if (isDeclaredRank(card, trump)) return 'trump';
  if (trump && !trump.noTrump && trump.suit && card.suit === trump.suit) return 'trump';
  return card.suit ?? 'spades';
}

export function printedSuitCount(hand: readonly Card[], suit: (typeof SUITS)[number]): number {
  return hand.filter((card) => card.suit === suit).length;
}

function suitBlock(cards: readonly Card[], suit: Suit, trump: TrumpState | null): Card[] {
  return cards
    .filter((card) => card.suit === suit && !card.joker && !isDeclaredRank(card, trump))
    .sort((a, b) => strength(a, trump) - strength(b, trump) || a.id.localeCompare(b.id));
}

function isDeclaredRank(card: Card, trump: TrumpState | null): boolean {
  return Boolean(trump && !trump.noTrump && trump.suit && card.suit && card.rank === trump.rank);
}

function strength(card: Card, trump: TrumpState | null): number {
  if (trump) return chainIndex(card, trump);
  return card.rank ? RANKS.indexOf(card.rank as Rank) : 0;
}

function sideSuits(trump: TrumpState | null): readonly Suit[] {
  if (trump && !trump.noTrump && trump.suit) return SIDE_BY_TRUMP[trump.suit];
  return NO_TRUMP_ORDER;
}

function suitIndex(suit: Suit | null, trump: TrumpState | null): number {
  if (!suit) return 99;
  const order = sideSuits(trump);
  const index = order.indexOf(suit);
  return index === -1 ? order.length : index;
}
