import { describe, expect, it } from 'vitest';
import {
  applyAiAction,
  chooseDiscard,
  createMatch,
  dealNext,
  declareTrump,
  legalDeclarations,
  maybeAiDeclare,
  parseCards,
  type MatchState,
  type Seat,
} from '../src/engine/index.js';
import { unwrap } from './helpers.js';

function dealAll(state: MatchState): MatchState {
  let next = state;
  while (next.phase === 'dealing') {
    next = unwrap(dealNext(next));
    const seat = ((next.openingSeat + next.dealIndex - 1) % 4) as Seat;
    next = maybeAiDeclare(next, seat);
  }
  return next;
}

describe('AI helpers', () => {
  it('lists declarations that the rule engine accepts', () => {
    const hand = parseCards('H2 S2 S2#1 JR JR#1 D9');
    const options = legalDeclarations(hand, 0, '2', null);
    expect(options.some((option) => option.kind === 'single' && option.suit === 'hearts')).toBe(true);
    expect(options.some((option) => option.kind === 'pair' && option.suit === 'spades')).toBe(true);
    expect(options.some((option) => option.kind === 'joker-pair')).toBe(true);
    expect(legalDeclarations(hand, 0, '2', options.find((option) => option.kind === 'joker-pair') ?? null)).toEqual([]);
  });

  it('discards eight cards and keeps points and trump when it can', () => {
    const trump = { rank: '2' as const, suit: 'hearts' as const, noTrump: false };
    const hand = parseCards(
      'H2 H2#1 HA HK HQ HJ H10 H9 S3 S4 S6 S7 S8 S9 SJ SQ C3 C4 C6 C7 C8 C9 D3 D4 D6 D7 D8 D9 DJ DQ JR S3#1 C3#1',
    );
    const buried = chooseDiscard(hand, trump);
    expect(buried).toHaveLength(8);
    expect(buried.some((card) => card.suit === 'hearts' || card.joker)).toBe(false);
    expect(buried.some((card) => card.rank === '5' || card.rank === '10' || card.rank === 'K')).toBe(false);
  });

  it('can finish a local hand with four AIs', () => {
    let state = dealAll(createMatch({ seed: 11, openingSeat: 0 }));
    let guard = 0;
    while (state.phase !== 'scoring' && state.phase !== 'game-over' && state.phase !== 'redeal' && guard < 250) {
      if (state.phase === 'making-trump' || state.phase === 'discard' || state.phase === 'playing') {
        state = unwrap(applyAiAction(state, state.turnSeat));
      } else {
        break;
      }
      guard += 1;
    }
    if (state.phase === 'redeal') {
      expect(state.declaration).toBeNull();
      return;
    }
    expect(['scoring', 'game-over']).toContain(state.phase);
    expect(state.lastResult).toBeTruthy();
  });

  it('does not declare over its own trump', () => {
    let state = createMatch({ seed: 8, openingSeat: 0 });
    state = unwrap(dealNext(state));
    const card = state.players[0]!.hand.find((item) => item.rank === '2' && item.suit);
    if (!card) return;
    state = unwrap(declareTrump(state, 0, [card.id]));
    expect(maybeAiDeclare(state, 0).declaration?.cardIds).toEqual([card.id]);
  });
});
