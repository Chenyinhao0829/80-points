import { identityKey } from './cards.js';
import { chainIndex, playSuit } from './trump.js';
import {
  fail,
  ok,
  type Card,
  type EngineResult,
  type Lead,
  type PlaySuit,
  type TrumpState,
} from './types.js';

export interface IdenticalPair {
  cards: [Card, Card];
  key: string;
  index: number;
}

export function findPairs(cards: readonly Card[], trump: TrumpState): IdenticalPair[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = identityKey(card);
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }
  const pairs: IdenticalPair[] = [];
  for (const [key, group] of groups) {
    if (group.length > 2) {
      throw new Error(`More than two cards share identity ${key}`);
    }
    if (group.length === 2) {
      const [first, second] = group as [Card, Card];
      pairs.push({
        cards: [first, second],
        key,
        index: chainIndex(first, trump),
      });
    }
  }
  return pairs;
}

export function singlesOf(cards: readonly Card[], trump: TrumpState): Card[] {
  const paired = new Set(findPairs(cards, trump).flatMap((pair) => pair.cards.map((card) => card.id)));
  return cards.filter((card) => !paired.has(card.id));
}

/** Longest run of consecutive pair-steps. A lone pair is length 1 and is not a tractor. */
export function longestPairRun(indices: readonly number[]): number {
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (unique.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] === unique[i - 1]! + 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

/**
 * Highest ending step of any consecutive window of `length` pair-steps.
 * Returns null when no such window exists.
 */
export function bestRunTop(indices: readonly number[], length: number): number | null {
  if (length <= 0) return null;
  const counts = new Map<number, number>();
  for (const index of indices) counts.set(index, (counts.get(index) ?? 0) + 1);
  let best: number | null = null;
  for (const start of counts.keys()) {
    let fits = true;
    for (let offset = 0; offset < length; offset += 1) {
      if ((counts.get(start + offset) ?? 0) < 1) {
        fits = false;
        break;
      }
    }
    if (!fits) continue;
    const top = start + length - 1;
    if (best === null || top > best) best = top;
  }
  return best;
}

export function samePlaySuit(cards: readonly Card[], trump: TrumpState): PlaySuit | null {
  if (cards.length === 0) return null;
  const suit = playSuit(cards[0]!, trump);
  return cards.every((card) => playSuit(card, trump) === suit) ? suit : null;
}

function isPureTractor(cards: readonly Card[], trump: TrumpState): boolean {
  if (cards.length < 4 || cards.length % 2 !== 0) return false;
  const pairs = findPairs(cards, trump);
  if (pairs.length * 2 !== cards.length || pairs.length < 2) return false;
  const indices = pairs.map((pair) => pair.index).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[0]! + i) return false;
  }
  return true;
}

function higherCardExists(
  others: readonly (readonly Card[])[],
  suit: PlaySuit,
  index: number,
  trump: TrumpState,
): boolean {
  return others.some((hand) =>
    hand.some((card) => playSuit(card, trump) === suit && chainIndex(card, trump) > index),
  );
}

function higherPairExists(
  others: readonly (readonly Card[])[],
  suit: PlaySuit,
  index: number,
  trump: TrumpState,
): boolean {
  return others.some((hand) =>
    findPairs(
      hand.filter((card) => playSuit(card, trump) === suit),
      trump,
    ).some((pair) => pair.index > index),
  );
}

/**
 * A top-card set is a same-suit mix of singles and pairs that nobody else can beat.
 * A pure pair or a pure tractor is classified as that lead instead.
 */
export function isUnbeatableSet(
  cards: readonly Card[],
  trump: TrumpState,
  otherHands: readonly (readonly Card[])[],
): boolean {
  const suit = samePlaySuit(cards, trump);
  if (!suit || cards.length < 2) return false;
  if (findPairs(cards, trump).length * 2 === cards.length && cards.length === 2) return false;
  if (isPureTractor(cards, trump)) return false;
  const pairs = findPairs(cards, trump);
  if (pairs.length * 2 + singlesOf(cards, trump).length !== cards.length) return false;
  for (const pair of pairs) {
    if (higherPairExists(otherHands, suit, pair.index, trump)) return false;
  }
  for (const card of singlesOf(cards, trump)) {
    if (higherCardExists(otherHands, suit, chainIndex(card, trump), trump)) return false;
  }
  return true;
}

export function classifyLead(
  cards: readonly Card[],
  trump: TrumpState,
  otherHands: readonly (readonly Card[])[],
): EngineResult<Lead> {
  if (cards.length === 0) return fail('Choose at least one card');
  const suit = samePlaySuit(cards, trump);
  if (!suit) return fail('A lead must be one suit. Trump-rank cards and jokers count as trump');

  if (cards.length === 1) {
    return ok({
      kind: 'single',
      cards: [...cards],
      playSuit: suit,
      pairCount: 0,
      tractorLength: 0,
    });
  }

  const pairs = findPairs(cards, trump);
  if (cards.length === 2 && pairs.length === 1) {
    return ok({
      kind: 'pair',
      cards: [...cards],
      playSuit: suit,
      pairCount: 1,
      tractorLength: 0,
    });
  }

  if (isPureTractor(cards, trump)) {
    return ok({
      kind: 'tractor',
      cards: [...cards],
      playSuit: suit,
      pairCount: pairs.length,
      tractorLength: pairs.length,
    });
  }

  if (isUnbeatableSet(cards, trump, otherHands)) {
    return ok({
      kind: 'top-set',
      cards: [...cards],
      playSuit: suit,
      pairCount: pairs.length,
      tractorLength: 0,
    });
  }

  if (cards.length === 2) {
    return fail('Those two cards are not an identical pair');
  }
  return fail('That combination is not a pair, a tractor, or an unbeatable set of top cards');
}

export const THROW_FAILED_MESSAGE = '甩牌失败，自动出最小牌';

/**
 * A multi-card lead is a pair, a tractor, or a top-card set.
 * Those three stay intact when they are legal.
 * An illegal throw does not stall the trick. It becomes the weakest card
 * inside the cards the player actually selected, ranked by the trump chain.
 */
export function resolveOpeningLead(
  cards: readonly Card[],
  hand: readonly Card[],
  trump: TrumpState,
  otherHands: readonly (readonly Card[])[],
): { lead: Lead; cards: Card[]; degraded: boolean } {
  void hand;
  const classified = classifyLead(cards, trump, otherHands);
  if (classified.ok) return { lead: classified.value, cards: [...cards], degraded: false };

  const smallest = weakestCard(cards, trump);
  const single = classifyLead([smallest], trump, otherHands);
  if (!single.ok) throw new Error(single.error);
  return { lead: single.value, cards: [smallest], degraded: true };
}

/** Lower means weaker. Side cards are weaker than trumps. Inside a suit, chain index decides. */
export function weakestCard(cards: readonly Card[], trump: TrumpState): Card {
  if (cards.length === 0) throw new Error('No card to choose');
  return [...cards].sort((a, b) => compareWeakness(a, b, trump))[0]!;
}

function compareWeakness(a: Card, b: Card, trump: TrumpState): number {
  const aTrump = playSuit(a, trump) === 'trump' ? 1 : 0;
  const bTrump = playSuit(b, trump) === 'trump' ? 1 : 0;
  if (aTrump !== bTrump) return aTrump - bTrump;
  return chainIndex(a, trump) - chainIndex(b, trump) || a.id.localeCompare(b.id);
}
