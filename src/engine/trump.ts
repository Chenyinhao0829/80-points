import { RANKS, type Card, type PlaySuit, type Rank, type TrumpState } from './types.js';

/**
 * Trump chain, low to high, when a trump suit exists:
 *   trump-suit pips from 2 up to A, skipping the trump rank
 *   → every off-suit trump-rank card (one shared step; they are equal, not adjacent to each other)
 *   → trump-suit trump-rank card
 *   → black joker
 *   → red joker
 *
 * Off-suit trump-rank cards therefore sit directly above the trump-suit ace and directly
 * below the trump-suit trump-rank card. Two off-suit pairs do not make a tractor.
 * In a no-trump hand only the jokers are on the trump chain (black, then red), and the
 * trump rank stays in its printed suit.
 */
const TRUMP_PIP_COUNT = RANKS.length - 1;

export function playSuit(card: Card, trump: TrumpState): PlaySuit {
  if (card.joker) return 'trump';
  if (!trump.noTrump && trump.suit) {
    if (card.rank === trump.rank || card.suit === trump.suit) return 'trump';
  }
  if (!card.suit) {
    throw new Error(`Card ${card.id} has no suit`);
  }
  return card.suit;
}

export function isTrumpCard(card: Card, trump: TrumpState): boolean {
  return playSuit(card, trump) === 'trump';
}

/** Higher index beats lower index inside the same play-suit. Equal index ties. */
export function chainIndex(card: Card, trump: TrumpState): number {
  if (playSuit(card, trump) === 'trump') return trumpChainIndex(card, trump);
  return sideChainIndex(card, trump);
}

function trumpChainIndex(card: Card, trump: TrumpState): number {
  if (trump.noTrump || !trump.suit) {
    if (card.joker === 'black') return 0;
    if (card.joker === 'red') return 1;
    throw new Error(`${card.id} is not trump in a no-trump hand`);
  }
  if (card.joker === 'red') return TRUMP_PIP_COUNT + 3;
  if (card.joker === 'black') return TRUMP_PIP_COUNT + 2;
  if (card.rank === trump.rank && card.suit === trump.suit) return TRUMP_PIP_COUNT + 1;
  if (card.rank === trump.rank) return TRUMP_PIP_COUNT;
  if (!card.rank) throw new Error(`Card ${card.id} has no rank`);
  return pipIndex(card.rank, trump.rank);
}

function sideChainIndex(card: Card, trump: TrumpState): number {
  if (!card.rank) throw new Error(`Card ${card.id} has no rank`);
  const skip = !trump.noTrump && trump.suit ? trump.rank : null;
  return pipIndex(card.rank, skip);
}

/** Position of `rank` in low-to-high order, optionally omitting one rank. */
function pipIndex(rank: Rank, skip: Rank | null): number {
  let index = 0;
  for (const candidate of RANKS) {
    if (candidate === skip) continue;
    if (candidate === rank) return index;
    index += 1;
  }
  throw new Error(`Rank ${rank} is not on this chain`);
}

export function beats(card: Card, other: Card, trump: TrumpState): boolean {
  if (playSuit(card, trump) !== playSuit(other, trump)) return false;
  return chainIndex(card, trump) > chainIndex(other, trump);
}

export function compareInSuit(a: Card, b: Card, trump: TrumpState): number {
  if (playSuit(a, trump) !== playSuit(b, trump)) {
    throw new Error('Cannot compare cards from different play-suits');
  }
  return chainIndex(a, trump) - chainIndex(b, trump);
}
