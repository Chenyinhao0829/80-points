import { findPairs, longestPairRun, type IdenticalPair } from './combinations.js';
import { chainIndex, playSuit } from './trump.js';
import { fail, ok, type Card, type EngineResult, type Lead, type TrumpState } from './types.js';

/**
 * Following is not "play the same number of that suit".
 *
 * - A tractor lead must be answered with a tractor of the same length when you have one.
 *   Otherwise play the longest shorter tractor you have, then as many pairs as possible,
 *   then loose cards of the suit.
 * - A pair, a single, or a top-card set must be answered with as many identical pairs as
 *   the lead contained, when you have them. Top-card sets do not also demand a tractor shape.
 * - If you do not have enough cards of the led suit, play all of them and fill with anything.
 *   Trump-rank cards and jokers are trump, so they do not follow a side suit.
 */
export function evaluateFollow(
  hand: readonly Card[],
  lead: Lead,
  play: readonly Card[],
  trump: TrumpState,
): EngineResult<true> {
  if (play.length !== lead.cards.length) {
    return fail(`Play ${lead.cards.length} cards`);
  }
  if (!isSubset(hand, play)) return fail('You can only play cards from your hand');

  const suitCards = hand.filter((card) => playSuit(card, trump) === lead.playSuit);
  const playedSuit = play.filter((card) => playSuit(card, trump) === lead.playSuit);

  if (suitCards.length <= lead.cards.length) {
    if (playedSuit.length !== suitCards.length) {
      return fail('Play every card you have of the led suit');
    }
    return ok(true);
  }

  if (playedSuit.length !== play.length) {
    return fail('You still have the led suit, so every card must follow suit');
  }

  const actual = structureScore(play, lead, trump);
  const required = maxStructureScore(suitCards, lead, trump);
  // A response may contain extra pairs. It may not contain fewer than the lead requires.
  // A pair answering two unpaired cards is still a legal follow of that suit.
  if (actual[0] < required[0] || actual[1] < required[1]) {
    return fail(
      lead.kind === 'tractor'
        ? 'Follow with a tractor if you have one, otherwise with as many pairs as you can'
        : 'Follow with as many identical pairs as the lead requires',
    );
  }
  return ok(true);
}

export const FOLLOW_ADJUSTED_MESSAGE = '出牌不合法，自动出最小牌';

/** An illegal follow does not stall the trick. It becomes the smallest legal play. */
export function resolveFollowAttempt(
  hand: readonly Card[],
  lead: Lead,
  play: readonly Card[],
  trump: TrumpState,
): { cards: Card[]; degraded: boolean } {
  const judged = evaluateFollow(hand, lead, play, trump);
  if (judged.ok) return { cards: [...play], degraded: false };
  return { cards: buildLegalPlay(hand, lead, trump), degraded: true };
}

/**
 * One legal play. Leads are the lowest single. Follows satisfy the structure rules
 * and prefer lower pairs, so a later AI can replace this without changing validation.
 */
export function buildLegalPlay(hand: readonly Card[], lead: Lead | null, trump: TrumpState): Card[] {
  if (hand.length === 0) throw new Error('No cards left');
  if (!lead) {
    return [lowest(hand, trump)];
  }

  const need = lead.cards.length;
  const suitCards = hand.filter((card) => playSuit(card, trump) === lead.playSuit);
  const others = hand.filter((card) => playSuit(card, trump) !== lead.playSuit);
  const play =
    suitCards.length <= need
      ? [...suitCards, ...sortById(others).slice(0, need - suitCards.length)]
      : lead.kind === 'tractor'
        ? selectTractor(suitCards, lead.tractorLength, trump)
        : selectPairs(suitCards, lead.pairCount, need, trump);
  if (play.length !== need) {
    throw new Error(`Legal play built ${play.length} cards, expected ${need}`);
  }
  return play;
}

/**
 * Cards that can appear in at least one legal follow.
 * Same suit is not enough: a pair lead only lights cards that can satisfy the pair rule,
 * and falls back to loose suit cards when the hand has no pair.
 */
export function playableCardIds(hand: readonly Card[], lead: Lead | null, trump: TrumpState): string[] {
  if (!lead) return hand.map((card) => card.id);
  const need = lead.cards.length;
  const suitCards = hand.filter((card) => playSuit(card, trump) === lead.playSuit);
  if (suitCards.length <= need) return hand.map((card) => card.id);
  if (lead.kind === 'tractor') return structuredIds(suitCards, lead, trump, true);
  return structuredIds(suitCards, lead, trump, false);
}

function structuredIds(suitCards: readonly Card[], lead: Lead, trump: TrumpState, tractor: boolean): string[] {
  const pairs = findPairs(suitCards, trump);
  const longest = longestPairRun(pairs.map((pair) => pair.index));
  const window = tractor ? Math.min(longest, lead.tractorLength) : 0;
  const targetPairs = tractor
    ? Math.min(lead.tractorLength, pairs.length)
    : Math.min(lead.pairCount, pairs.length, Math.floor(lead.cards.length / 2));
  const needFillers = lead.cards.length > targetPairs * 2;
  if (targetPairs === 0) return suitCards.map((card) => card.id);

  const indexes = new Set(pairs.map((pair) => pair.index));
  const inWindow = new Set<string>();
  if (window > 0) {
    for (const start of indexes) {
      let fits = true;
      for (let offset = 0; offset < window; offset += 1) {
        if (!indexes.has(start + offset)) fits = false;
      }
      if (!fits) continue;
      for (const pair of pairs) {
        if (pair.index >= start && pair.index < start + window) {
          for (const card of pair.cards) inWindow.add(card.id);
        }
      }
    }
  }
  const allowed = new Set<string>();
  const pairCards = tractor && window > 0 && targetPairs === window ? inWindow : new Set(pairs.flatMap((pair) => pair.cards.map((card) => card.id)));
  if (tractor && window > 0 && targetPairs > window) {
    for (const id of inWindow) allowed.add(id);
    for (const id of pairCards) allowed.add(id);
  } else {
    for (const id of pairCards) allowed.add(id);
  }
  if (needFillers) {
    for (const card of suitCards) allowed.add(card.id);
  }
  return suitCards.filter((card) => allowed.has(card.id)).map((card) => card.id);
}

function structureScore(cards: readonly Card[], lead: Lead, trump: TrumpState): [number, number] {
  const pairs = findPairs(cards, trump);
  if (lead.kind === 'tractor') {
    const longest = longestPairRun(pairs.map((pair) => pair.index));
    return [Math.min(longest, lead.tractorLength), pairs.length];
  }
  return [0, pairs.length];
}

function maxStructureScore(suitCards: readonly Card[], lead: Lead, trump: TrumpState): [number, number] {
  const pairs = findPairs(suitCards, trump);
  if (lead.kind === 'tractor') {
    const longest = longestPairRun(pairs.map((pair) => pair.index));
    return [Math.min(longest, lead.tractorLength), Math.min(lead.tractorLength, pairs.length)];
  }
  const targetPairs = Math.min(lead.pairCount, pairs.length, Math.floor(lead.cards.length / 2));
  return [0, targetPairs];
}

function selectTractor(suitCards: readonly Card[], length: number, trump: TrumpState): Card[] {
  const need = length * 2;
  const pairs = [...findPairs(suitCards, trump)].sort(comparePairs);
  const longest = longestPairRun(pairs.map((pair) => pair.index));
  const window = Math.min(longest, length);
  const targetPairs = Math.min(length, pairs.length);
  const chosen: IdenticalPair[] = [];
  const used = new Set<string>();

  if (window > 0) {
    const run = lowestWindow(pairs, window);
    for (const pair of run) {
      chosen.push(pair);
      used.add(pair.key);
    }
  }
  for (const pair of pairs) {
    if (chosen.length >= targetPairs) break;
    if (used.has(pair.key)) continue;
    chosen.push(pair);
    used.add(pair.key);
  }

  const chosenIds = new Set(chosen.flatMap((pair) => pair.cards.map((card) => card.id)));
  const singles = sortCards(
    suitCards.filter((card) => !chosenIds.has(card.id)),
    trump,
  );
  const cards = chosen.flatMap((pair) => pair.cards);
  return [...cards, ...singles.slice(0, need - cards.length)];
}

function selectPairs(
  suitCards: readonly Card[],
  pairCount: number,
  need: number,
  trump: TrumpState,
): Card[] {
  const pairs = [...findPairs(suitCards, trump)].sort(comparePairs);
  const target = Math.min(pairCount, pairs.length, Math.floor(need / 2));
  const chosen = pairs.slice(0, target);
  const chosenIds = new Set(chosen.flatMap((pair) => pair.cards.map((card) => card.id)));
  const singles = sortCards(
    suitCards.filter((card) => !chosenIds.has(card.id)),
    trump,
  );
  const cards = chosen.flatMap((pair) => pair.cards);
  return [...cards, ...singles.slice(0, need - cards.length)];
}

function lowestWindow(pairs: readonly IdenticalPair[], length: number): IdenticalPair[] {
  const byIndex = new Map<number, IdenticalPair[]>();
  for (const pair of pairs) {
    const list = byIndex.get(pair.index);
    if (list) list.push(pair);
    else byIndex.set(pair.index, [pair]);
  }
  const starts = [...byIndex.keys()].sort((a, b) => a - b);
  for (const start of starts) {
    const window: IdenticalPair[] = [];
    let fits = true;
    for (let offset = 0; offset < length; offset += 1) {
      const available = byIndex.get(start + offset);
      if (!available || available.length === 0) {
        fits = false;
        break;
      }
      window.push(available[0]!);
    }
    if (fits) return window;
  }
  throw new Error('Expected a consecutive pair window');
}

function comparePairs(a: IdenticalPair, b: IdenticalPair): number {
  return a.index - b.index || a.key.localeCompare(b.key);
}

function sortCards(cards: readonly Card[], trump: TrumpState): Card[] {
  return [...cards].sort((a, b) => chainIndex(a, trump) - chainIndex(b, trump) || a.id.localeCompare(b.id));
}

function sortById(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => a.id.localeCompare(b.id));
}

function lowest(cards: readonly Card[], trump: TrumpState): Card {
  return sortCards(cards, trump)[0]!;
}

function isSubset(hand: readonly Card[], play: readonly Card[]): boolean {
  const counts = new Map<string, number>();
  for (const card of hand) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  for (const card of play) {
    const left = counts.get(card.id) ?? 0;
    if (left <= 0) return false;
    counts.set(card.id, left - 1);
  }
  return true;
}
