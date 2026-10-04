import { identityKey, rankIndex } from './cards.js';
import {
  fail,
  ok,
  type Card,
  type EngineResult,
  type Rank,
  type Seat,
  type Suit,
  type TrumpDeclaration,
} from './types.js';

/**
 * Declaration strength: single < identical trump-rank pair < identical joker pair.
 * A joker pair wipes the suit and makes the hand no-trump.
 * You cannot override your own current declaration. Your partner can.
 * A pair does not override another pair; only jokers do.
 */
export function validateDeclaration(input: {
  hand: readonly Card[];
  seat: Seat;
  cardIds: readonly string[];
  trumpRank: Rank;
  current: TrumpDeclaration | null;
}): EngineResult<TrumpDeclaration> {
  const cards = takeCards(input.hand, input.cardIds);
  if (!cards) return fail('Those cards are not in your hand');

  const proposed = describeDeclaration(cards, input.trumpRank);
  if (!proposed.ok) return proposed;
  if (input.current && input.current.seat === input.seat) {
    return fail('You cannot override your own trump');
  }
  if (input.current && power(proposed.value.kind) <= power(input.current.kind)) {
    return fail('That declaration is not strong enough to override the current trump');
  }
  return ok({ ...proposed.value, seat: input.seat });
}

function describeDeclaration(
  cards: readonly Card[],
  trumpRank: Rank,
): EngineResult<Omit<TrumpDeclaration, 'seat'>> {
  if (cards.length === 2 && cards[0]!.joker && cards[1]!.joker && cards[0]!.joker === cards[1]!.joker) {
    return ok({
      kind: 'joker-pair',
      cardIds: cards.map((card) => card.id),
      suit: null,
      noTrump: true,
    });
  }
  if (cards.some((card) => card.joker || card.rank !== trumpRank || !card.suit)) {
    return fail('Show a trump-rank card, an identical trump-rank pair, or an identical joker pair');
  }
  if (cards.length === 1) {
    return ok({
      kind: 'single',
      cardIds: [cards[0]!.id],
      suit: cards[0]!.suit,
      noTrump: false,
    });
  }
  if (cards.length === 2 && identityKey(cards[0]!) === identityKey(cards[1]!)) {
    return ok({
      kind: 'pair',
      cardIds: cards.map((card) => card.id),
      suit: cards[0]!.suit as Suit,
      noTrump: false,
    });
  }
  return fail('A pair must be two identical trump-rank cards');
}

function power(kind: TrumpDeclaration['kind']): number {
  if (kind === 'single') return 1;
  if (kind === 'pair') return 2;
  return 3;
}

function takeCards(hand: readonly Card[], cardIds: readonly string[]): Card[] | null {
  const remaining = new Map(hand.map((card) => [card.id, card]));
  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = remaining.get(id);
    if (!card) return null;
    remaining.delete(id);
    cards.push(card);
  }
  return cards;
}

/**
 * Nobody declared. Turn the kitty one card at a time.
 * The first trump-rank card sets the suit. If there is none, the highest
 * non-joker sets it, and the first of a tie wins. Jokers never set a suit.
 */
export function trumpSuitFromKitty(
  kitty: readonly Card[],
  trumpRank: Rank,
): { suit: Suit; revealed: Card[] } {
  const revealed: Card[] = [];
  for (const card of kitty) {
    revealed.push(card);
    if (card.rank === trumpRank && card.suit) {
      return { suit: card.suit, revealed };
    }
  }
  let best: Card | null = null;
  for (const card of kitty) {
    if (!card.rank || !card.suit) continue;
    if (!best || rankIndex(card.rank) > rankIndex(best.rank!)) best = card;
  }
  if (!best?.suit) throw new Error('The kitty has no suit card');
  return { suit: best.suit, revealed: [...kitty] };
}
