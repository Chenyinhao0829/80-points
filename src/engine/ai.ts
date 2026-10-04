import { cardPoints, identityKey } from './cards.js';
import { findPairs } from './combinations.js';
import { validateDeclaration } from './declare.js';
import { buildLegalPlay } from './follow.js';
import { printedSuitCount } from './hand.js';
import { discardCards, passDeclare, playCards, declareTrump } from './match.js';
import { chainIndex, isTrumpCard, playSuit } from './trump.js';
import {
  SUITS,
  fail,
  type Card,
  type EngineResult,
  type MatchState,
  type PlaySuit,
  type Seat,
  type TrumpDeclaration,
  type TrumpState,
} from './types.js';

/**
 * First-pass AI: legal, complete a hand, do not count cards.
 * Later versions can replace these choosers without touching the match loop.
 */
export function applyAiAction(state: MatchState, seat: Seat): EngineResult<MatchState> {
  if (state.phase === 'making-trump') {
    const cards = chooseDeclaration(state, seat);
    if (cards) return declareTrump(state, seat, cards);
    return passDeclare(state, seat);
  }
  if (state.phase === 'discard') {
    if (state.starterSeat !== seat || !state.trump) return fail('This seat is not discarding');
    return discardCards(state, seat, chooseDiscard(state.players[seat]!.hand, state.trump).map((card) => card.id));
  }
  if (state.phase === 'playing') {
    if (!state.trump) return fail('Trump is not set');
    const play = chooseAiPlay(state, seat);
    return playCards(state, seat, play.map((card) => card.id));
  }
  return fail('The AI has nothing to do');
}

export function maybeAiDeclare(state: MatchState, seat: Seat): MatchState {
  if (state.phase !== 'dealing' && state.phase !== 'making-trump') return state;
  const cards = chooseDeclaration(state, seat);
  if (!cards) return state;
  const next = declareTrump(state, seat, cards);
  return next.ok ? next.value : state;
}

export function chooseAiPlay(state: MatchState, seat: Seat): Card[] {
  const hand = state.players[seat]!.hand;
  const trump = state.trump;
  if (!trump) throw new Error('Cannot play without trump');
  if (state.currentTrick.length === 0) {
    return chooseLead(hand, trump, otherHands(state, seat));
  }
  if (!state.currentLead) throw new Error('The current trick has no lead');
  return buildLegalPlay(hand, state.currentLead, trump);
}

export function chooseLead(
  hand: readonly Card[],
  trump: TrumpState,
  _others: readonly (readonly Card[])[],
): Card[] {
  const tractors = findTractors(hand, trump).sort((a, b) => a.length - b.length || topIndex(a, trump) - topIndex(b, trump));
  if (tractors[0]) return tractors[0];
  const pairs = findPairs(hand, trump).sort((a, b) => a.index - b.index);
  if (pairs[0]) return [...pairs[0].cards];
  return buildLegalPlay(hand, null, trump);
}

export function chooseDiscard(hand: readonly Card[], trump: TrumpState): Card[] {
  if (hand.length < 8) throw new Error('Not enough cards to discard');
  return [...hand]
    .sort((a, b) => discardScore(b, hand, trump) - discardScore(a, hand, trump) || a.id.localeCompare(b.id))
    .slice(0, 8);
}

export function chooseDeclaration(state: MatchState, seat: Seat): string[] | null {
  const options = legalDeclarations(
    state.players[seat]!.hand,
    seat,
    state.trumpRank,
    state.declaration,
  );
  if (options.length === 0) return null;

  const jokers = options.find((option) => option.kind === 'joker-pair');
  if (jokers && (state.declaration?.kind === 'pair' || longestPrintedSuit(state.players[seat]!.hand) <= 4)) {
    return jokers.cardIds;
  }

  const pairs = options.filter((option) => option.kind === 'pair');
  const bestPair = pickBestSuit(pairs, state.players[seat]!.hand);
  if (bestPair) {
    const length = printedSuitCount(state.players[seat]!.hand, bestPair.suit!);
    if (state.declaration || length >= 3 || state.players[seat]!.hand.length >= 18) return bestPair.cardIds;
  }

  const singles = options.filter((option) => option.kind === 'single');
  const bestSingle = pickBestSuit(singles, state.players[seat]!.hand);
  if (!bestSingle || state.declaration) return null;
  const length = printedSuitCount(state.players[seat]!.hand, bestSingle.suit!);
  const dealt = state.players[seat]!.hand.length;
  if (length >= 3 || (state.handNumber === 1 && dealt >= 8) || dealt >= 20) return bestSingle.cardIds;
  return null;
}

export function legalDeclarations(
  hand: readonly Card[],
  seat: Seat,
  trumpRank: MatchState['trumpRank'],
  current: TrumpDeclaration | null,
): TrumpDeclaration[] {
  const attempts: string[][] = [];
  const rankCards = hand.filter((card) => card.rank === trumpRank && card.suit);
  for (const card of rankCards) attempts.push([card.id]);
  const seen = new Set<string>();
  for (const card of rankCards) {
    const key = identityKey(card);
    if (seen.has(key)) continue;
    const pair = rankCards.filter((item) => identityKey(item) === key);
    if (pair.length === 2) {
      seen.add(key);
      attempts.push(pair.map((item) => item.id));
    }
  }
  for (const color of ['red', 'black'] as const) {
    const jokers = hand.filter((card) => card.joker === color);
    if (jokers.length === 2) attempts.push(jokers.map((card) => card.id));
  }
  const found: TrumpDeclaration[] = [];
  for (const cardIds of attempts) {
    const result = validateDeclaration({ hand, seat, cardIds, trumpRank, current });
    if (result.ok) found.push(result.value);
  }
  return found;
}

function pickBestSuit(
  options: readonly TrumpDeclaration[],
  hand: readonly Card[],
): TrumpDeclaration | null {
  let best: TrumpDeclaration | null = null;
  let bestCount = -1;
  for (const option of options) {
    if (!option.suit) continue;
    const count = printedSuitCount(hand, option.suit);
    if (count > bestCount) {
      best = option;
      bestCount = count;
    }
  }
  return best;
}

function longestPrintedSuit(hand: readonly Card[]): number {
  return Math.max(...SUITS.map((suit) => printedSuitCount(hand, suit)));
}

function discardScore(card: Card, hand: readonly Card[], trump: TrumpState): number {
  const suit = playSuit(card, trump);
  const suitCount = hand.filter((item) => playSuit(item, trump) === suit).length;
  const paired = findPairs(hand, trump).some((pair) => pair.cards.some((item) => item.id === card.id));
  let score = 0;
  if (isTrumpCard(card, trump)) score -= 80;
  score -= cardPoints(card) * 6;
  if (paired) score -= 24;
  score -= chainIndex(card, trump);
  if (!isTrumpCard(card, trump) && suitCount === 1) score += 18;
  if (!isTrumpCard(card, trump) && suitCount === 2) score += 8;
  return score;
}

function findTractors(hand: readonly Card[], trump: TrumpState): Card[][] {
  const suits: PlaySuit[] = ['spades', 'hearts', 'diamonds', 'clubs', 'trump'];
  const found: Card[][] = [];
  for (const suit of suits) {
    const pairs = findPairs(
      hand.filter((card) => playSuit(card, trump) === suit),
      trump,
    ).sort((a, b) => a.index - b.index || a.key.localeCompare(b.key));
    let run = pairs.slice(0, 0);
    for (const pair of pairs) {
      if (run.length === 0 || pair.index === run[run.length - 1]!.index + 1) {
        run = [...run, pair];
      } else {
        if (run.length >= 2) found.push(run.flatMap((item) => item.cards));
        run = [pair];
      }
    }
    if (run.length >= 2) found.push(run.flatMap((item) => item.cards));
  }
  return found;
}

function topIndex(cards: readonly Card[], trump: TrumpState): number {
  return Math.max(...cards.map((card) => chainIndex(card, trump)));
}

function otherHands(state: MatchState, seat: Seat): Card[][] {
  return state.players.filter((player) => player.seat !== seat).map((player) => player.hand);
}
