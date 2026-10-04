import { sumPoints } from './cards.js';
import { bestRunTop, findPairs } from './combinations.js';
import { chainIndex, playSuit } from './trump.js';
import type { Card, Lead, PlaySuit, Seat, TrickPlay, TrumpState } from './types.js';

/**
 * The lead's shape decides the trick, not a single numeric rank.
 * Pairs and tractors are beaten only by pairs and tractors.
 * Equal cards are won by whoever played first.
 */
export function determineTrickWinner(
  plays: readonly TrickPlay[],
  lead: Lead,
  trump: TrumpState,
): Seat {
  if (plays.length === 0) throw new Error('A trick needs a lead');
  switch (lead.kind) {
    case 'single':
      return winnerByCard(plays, lead.playSuit, trump);
    case 'pair':
      return winnerByPair(plays, lead.playSuit, trump);
    case 'tractor':
      return winnerByTractor(plays, lead, trump);
    case 'top-set':
      return winnerByTopSet(plays, lead, trump);
  }
}

export function trickPoints(plays: readonly TrickPlay[]): number {
  return sumPoints(plays.flatMap((play) => play.cards));
}

function winnerByCard(plays: readonly TrickPlay[], ledSuit: PlaySuit, trump: TrumpState): Seat {
  let bestSeat = plays[0]!.seat;
  let bestStrength = Number.NEGATIVE_INFINITY;
  let bestIsTrump = false;
  let seen = false;

  for (const play of plays) {
    const card = play.cards[0];
    if (!card) continue;
    const suit = playSuit(card, trump);
    const trumpCard = suit === 'trump';
    if (ledSuit === 'trump') {
      if (!trumpCard) continue;
      const strength = chainIndex(card, trump);
      if (!seen || strength > bestStrength) {
        seen = true;
        bestStrength = strength;
        bestSeat = play.seat;
      }
      continue;
    }
    if (trumpCard) {
      const strength = chainIndex(card, trump);
      if (!bestIsTrump || strength > bestStrength) {
        bestIsTrump = true;
        seen = true;
        bestStrength = strength;
        bestSeat = play.seat;
      }
      continue;
    }
    if (bestIsTrump || suit !== ledSuit) continue;
    const strength = chainIndex(card, trump);
    if (!seen || strength > bestStrength) {
      seen = true;
      bestStrength = strength;
      bestSeat = play.seat;
    }
  }
  return bestSeat;
}

function winnerByPair(plays: readonly TrickPlay[], ledSuit: PlaySuit, trump: TrumpState): Seat {
  const trumping: Candidate[] = [];
  const following: Candidate[] = [];
  for (const play of plays) {
    const pairs = findPairs(play.cards, trump);
    if (ledSuit !== 'trump' && isFullTrump(play.cards, trump)) {
      const trumpPairs = pairs.filter((pair) => playSuit(pair.cards[0], trump) === 'trump');
      if (trumpPairs.length === 0) continue;
      trumping.push({
        seat: play.seat,
        strength: Math.max(...trumpPairs.map((pair) => pair.index)),
      });
      continue;
    }
    const suitPairs = pairs.filter((pair) => playSuit(pair.cards[0], trump) === ledSuit);
    if (suitPairs.length === 0) continue;
    following.push({
      seat: play.seat,
      strength: Math.max(...suitPairs.map((pair) => pair.index)),
    });
  }
  return firstHighest(plays, trumping.length > 0 ? trumping : following) ?? plays[0]!.seat;
}

function winnerByTractor(plays: readonly TrickPlay[], lead: Lead, trump: TrumpState): Seat {
  const trumping: Candidate[] = [];
  const following: Candidate[] = [];
  for (const play of plays) {
    if (lead.playSuit !== 'trump' && isFullTrump(play.cards, trump)) {
      const top = runTop(play.cards, trump, lead.tractorLength, 'trump');
      if (top === null) continue;
      trumping.push({ seat: play.seat, strength: top });
      continue;
    }
    const top = runTop(play.cards, trump, lead.tractorLength, lead.playSuit);
    if (top === null) continue;
    following.push({ seat: play.seat, strength: top });
  }
  return firstHighest(plays, trumping.length > 0 ? trumping : following) ?? plays[0]!.seat;
}

function winnerByTopSet(plays: readonly TrickPlay[], lead: Lead, trump: TrumpState): Seat {
  if (lead.playSuit === 'trump') return plays[0]!.seat;
  const beaters: Candidate[] = [];
  for (const play of plays.slice(1)) {
    if (!isFullTrump(play.cards, trump)) continue;
    const pairs = findPairs(play.cards, trump).filter((pair) => playSuit(pair.cards[0], trump) === 'trump');
    if (pairs.length < lead.pairCount) continue;
    const strength =
      lead.pairCount > 0
        ? Math.max(...pairs.map((pair) => pair.index))
        : Math.max(...play.cards.map((card) => chainIndex(card, trump)));
    beaters.push({ seat: play.seat, strength });
  }
  return firstHighest(plays, beaters) ?? plays[0]!.seat;
}

function runTop(cards: readonly Card[], trump: TrumpState, length: number, suit: PlaySuit): number | null {
  const indices = findPairs(cards, trump)
    .filter((pair) => playSuit(pair.cards[0], trump) === suit)
    .map((pair) => pair.index);
  return bestRunTop(indices, length);
}

function isFullTrump(cards: readonly Card[], trump: TrumpState): boolean {
  return cards.length > 0 && cards.every((card) => playSuit(card, trump) === 'trump');
}

interface Candidate {
  seat: Seat;
  strength: number;
}

function firstHighest(plays: readonly TrickPlay[], candidates: readonly Candidate[]): Seat | null {
  let best: Candidate | null = null;
  for (const play of plays) {
    const candidate = candidates.find((item) => item.seat === play.seat);
    if (!candidate) continue;
    if (!best || candidate.strength > best.strength) best = candidate;
  }
  return best?.seat ?? null;
}
