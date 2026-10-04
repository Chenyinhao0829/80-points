import { describe, expect, it } from 'vitest';
import {
  buildLegalPlay,
  createDeck,
  createMatch,
  dealNext,
  declareTrump,
  discardCards,
  passDeclare,
  playCards,
  projectMatch,
  redeal,
  resolveLevels,
  startNextHand,
  sumPoints,
  talonMultiplier,
  trumpSuitFromKitty,
  type Card,
  type MatchState,
  type Seat,
} from '../src/engine/index.js';
import { parseCards } from '../src/engine/index.js';
import { expectFail, unwrap } from './helpers.js';

function withKitty(kitty: Card[]): Card[] {
  const used = new Set(kitty.map((card) => card.id));
  const rest = createDeck().filter((card) => !used.has(card.id));
  return [...rest, ...kitty];
}

function dealAll(state: MatchState): MatchState {
  let next = state;
  while (next.phase === 'dealing') next = unwrap(dealNext(next));
  return next;
}

function passWindow(state: MatchState): MatchState {
  let next = state;
  let guard = 0;
  while (next.phase === 'making-trump' && guard < 8) {
    next = unwrap(passDeclare(next, next.turnSeat));
    guard += 1;
  }
  return next;
}

describe('match flow', () => {
  it('makes the final declarer the starter on the first hand and hides other hands', () => {
    let state = createMatch({
      openingSeat: 0,
      deck: withKitty(parseCards('JR JB H3 S5 D9 C4 HA HK')),
    });
    state = unwrap(dealNext(state));
    const shown = state.players[0]!.hand.find((card) => card.rank === '2' && card.suit);
    expect(shown).toBeTruthy();
    state = unwrap(declareTrump(state, 0, [shown!.id]));
    const before = state;
    expectFail(declareTrump(state, 0, [shown!.id]), 'your own trump');
    expect(state.declaration).toBe(before.declaration);

    state = dealAll(state);
    expect(state.phase).toBe('making-trump');
    state = passWindow(state);
    expect(state.phase).toBe('discard');
    expect(state.starterSeat).toBe(0);
    expect(state.declarerTeam).toBe('A');
    expect(state.trump?.suit).toBe(shown!.suit);
    expect(state.players[0]!.hand).toHaveLength(33);

    const buried = state.players[0]!.hand.slice(0, 8).map((card) => card.id);
    state = unwrap(discardCards(state, 0, buried));
    expect(state.phase).toBe('playing');
    expect(state.players[0]!.hand).toHaveLength(25);
    expect(state.discard).toHaveLength(8);

    const spectator = projectMatch(state, 'spectator');
    expect(spectator.players.every((player) => player.hand === undefined)).toBe(true);
    expect(spectator.discard).toBeNull();
    expect('stock' in spectator).toBe(false);

    const own = projectMatch(state, 0);
    expect(own.players[0]!.hand).toHaveLength(25);
    expect(own.players[1]!.hand).toBeUndefined();

    const lead = state.players[0]!.hand[0]!;
    const played = unwrap(playCards(state, 0, [lead.id]));
    expect(played.currentTrick).toHaveLength(1);
    expect(played.turnSeat).toBe(1);
    expectFail(playCards(played, 0, [played.players[0]!.hand[0]!.id]), 'not your turn');
    expect(played.turnSeat).toBe(1);
  });

  it('redeals the first hand when nobody declares, and turns the kitty on later hands', () => {
    let first = createMatch({ openingSeat: 0, seed: 3 });
    first = passWindow(dealAll(first));
    expect(first.phase).toBe('redeal');
    first = unwrap(redeal(first, { seed: 4 }));
    expect(first.phase).toBe('dealing');
    expect(first.handNumber).toBe(1);
    expect(first.trumpRank).toBe('2');

    const kitty = parseCards('JR JB H3 S5 C7 D9 HA HK');
    let second = createMatch({
      deck: withKitty(kitty),
      openingSeat: 0,
      handNumber: 2,
      declarerTeam: 'A',
      starterSeat: 2,
      trumpRank: '7',
      levels: { A: 5, B: 0 },
    });
    second = passWindow(dealAll(second));
    expect(second.phase).toBe('discard');
    expect(second.starterSeat).toBe(2);
    expect(second.trump).toEqual({ rank: '7', suit: 'clubs', noTrump: false });
    expect(second.revealedKitty.map((card) => card.id)).toEqual(
      trumpSuitFromKitty(kitty, '7').revealed.map((card) => card.id),
    );
    expect(second.players[2]!.hand).toHaveLength(33);
    expect(projectMatch(second, 0).revealedKitty.map((card) => card.id)).toContain('C7-0');
  });

  it('plays a full hand and scores the kitty only when the opponents win the last trick', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const finished = playFullHand(seed);
      expect(finished.phase).toBe('scoring');
      expect(finished.lastResult).toBeTruthy();
      expect(finished.players.every((player) => player.hand.length === 0)).toBe(true);

      const playedCards = finished.trickHistory.flatMap((trick) => trick.plays.flatMap((play) => play.cards));
      expect(playedCards).toHaveLength(100);
      expect(sumPoints([...playedCards, ...finished.discard])).toBe(200);

      const trickPoints = finished.trickHistory.reduce(
        (total, trick) => total + (trick.opponentsScored ? trick.points : 0),
        0,
      );
      const last = finished.trickHistory.at(-1)!;
      const bonus = finished.lastResult!.opponentsWonLastTrick
        ? sumPoints(finished.discard) * talonMultiplier(last.lead.cards.length)
        : 0;
      expect(finished.opponentPoints).toBe(trickPoints + bonus);
      expect(finished.lastResult!.talonBonus).toBe(bonus);

      const result = finished.lastResult!;
      const previousStarter = (
        result.opponentsTakeDeclarer ? (result.nextStarterSeat + 3) % 4 : (result.nextStarterSeat + 2) % 4
      ) as Seat;
      const previousDeclarer = result.opponentsTakeDeclarer
        ? result.nextDeclarerTeam === 'A'
          ? 'B'
          : 'A'
        : result.nextDeclarerTeam;
      const expected = resolveLevels({
        opponentPoints: finished.opponentPoints,
        declarerTeam: previousDeclarer,
        starterSeat: previousStarter,
        levels: { A: 0, B: 0 },
      });
      expect(finished.lastResult!.levelsGained).toBe(expected.levelsGained);
      expect(finished.lastResult!.nextLevels).toEqual(expected.nextLevels);
      expect(finished.levels).toEqual(expected.nextLevels);

      const view = projectMatch(finished, 'spectator');
      if (finished.lastResult!.opponentsWonLastTrick) expect(view.discard?.length).toBe(8);
      else expect(view.discard).toBeNull();

      const next = unwrap(startNextHand(finished, { seed: seed + 20 }));
      expect(next.handNumber).toBe(2);
      expect(next.trumpRank).toBe(finished.lastResult!.nextTrumpRank);
      expect(next.starterSeat).toBe(finished.lastResult!.nextStarterSeat);
      expect(next.declarerTeam).toBe(finished.lastResult!.nextDeclarerTeam);
      expect(next.phase).toBe('dealing');
    }
  });
});

function playFullHand(seed: number): MatchState {
  let state = createMatch({ seed, openingSeat: 0 });
  for (let attempt = 0; attempt < 4 && state.phase !== 'discard'; attempt += 1) {
    state = declareDuringDeal(state);
    if (state.phase === 'redeal') state = unwrap(redeal(state, { seed: seed + 50 + attempt }));
  }
  if (state.phase !== 'discard' || state.starterSeat === null) {
    throw new Error(`Hand did not reach the discard: ${state.phase}`);
  }
  const starter = state.starterSeat;
  state = unwrap(
    discardCards(
      state,
      starter,
      state.players[starter]!.hand.slice(0, 8).map((card) => card.id),
    ),
  );
  let guard = 0;
  while (state.phase === 'playing' && guard < 200) {
    const seat = state.turnSeat;
    const hand = state.players[seat]!.hand;
    const lead = state.currentTrick.length === 0 ? null : state.currentLead;
    const play = buildLegalPlay(hand, lead, state.trump!);
    const result = playCards(state, seat, play.map((card) => card.id));
    if (!result.ok) throw new Error(`Seat ${seat} could not play: ${result.error}`);
    state = result.value;
    guard += 1;
  }
  if (state.phase !== 'scoring' && state.phase !== 'game-over') {
    throw new Error(`Hand stopped in ${state.phase}`);
  }
  return state;
}

function declareDuringDeal(state: MatchState): MatchState {
  let next = state;
  while (next.phase === 'dealing') {
    next = unwrap(dealNext(next));
    if (next.declaration) continue;
    const seat = ((next.openingSeat + next.dealIndex - 1) % 4) as Seat;
    const card = next.players[seat]!.hand.find((item) => item.rank === next.trumpRank && item.suit);
    if (!card) continue;
    const declared = declareTrump(next, seat, [card.id]);
    if (declared.ok) next = declared.value;
  }
  let guard = 0;
  while (next.phase === 'making-trump' && guard < 12) {
    const seat = next.turnSeat;
    if (!next.declaration) {
      const card = next.players[seat]!.hand.find((item) => item.rank === next.trumpRank && item.suit);
      if (card) {
        const declared = declareTrump(next, seat, [card.id]);
        if (declared.ok) {
          next = declared.value;
          guard += 1;
          continue;
        }
      }
    }
    next = unwrap(passDeclare(next, seat));
    guard += 1;
  }
  return next;
}
