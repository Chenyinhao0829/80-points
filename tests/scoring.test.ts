import { describe, expect, it } from 'vitest';
import {
  isGameOver,
  levelChangeForOpponentPoints,
  nextStarterSeat,
  partnerSeat,
  resolveLevels,
  talonMultiplier,
  teamOf,
} from '../src/engine/index.js';

describe('scoring bands', () => {
  const bands: Array<[number, 'declarers' | 'opponents', number, boolean]> = [
    [0, 'declarers', 3, false],
    [5, 'declarers', 2, false],
    [35, 'declarers', 2, false],
    [40, 'declarers', 1, false],
    [75, 'declarers', 1, false],
    [80, 'opponents', 0, true],
    [115, 'opponents', 0, true],
    [120, 'opponents', 1, true],
    [155, 'opponents', 1, true],
    [160, 'opponents', 2, true],
    [195, 'opponents', 2, true],
    [200, 'opponents', 3, true],
    [235, 'opponents', 3, true],
    [240, 'opponents', 4, true],
    [280, 'opponents', 5, true],
  ];

  it.each(bands)('%i points → %s %+i', (points, side, levels, takeOver) => {
    expect(levelChangeForOpponentPoints(points)).toEqual({
      gainingSide: side,
      levels,
      opponentsTakeDeclarer: takeOver,
    });
  });
});

describe('discard multiplier', () => {
  it('doubles the point value once for every card in the last trick', () => {
    expect(talonMultiplier(1)).toBe(2);
    expect(talonMultiplier(2)).toBe(4);
    expect(talonMultiplier(3)).toBe(6);
    expect(talonMultiplier(4)).toBe(8);
    expect(talonMultiplier(6)).toBe(12);
  });
});

describe('starter rotation', () => {
  it('gives the deal to the partner or to the next player anticlockwise', () => {
    expect(teamOf(0)).toBe('A');
    expect(teamOf(2)).toBe('A');
    expect(teamOf(1)).toBe('B');
    expect(partnerSeat(0)).toBe(2);
    expect(nextStarterSeat(0, false)).toBe(2);
    expect(nextStarterSeat(0, true)).toBe(1);
    expect(nextStarterSeat(3, true)).toBe(0);
    expect(nextStarterSeat(2, false)).toBe(0);
  });

  it('matches the South / East example', () => {
    const south = 0;
    const kept = resolveLevels({
      opponentPoints: 60,
      declarerTeam: 'A',
      starterSeat: south,
      levels: { A: 5, B: 8 },
    });
    expect(kept.nextLevels.A).toBe(6);
    expect(kept.nextStarterSeat).toBe(2);
    expect(kept.nextTrumpRank).toBe('8');
    expect(kept.opponentsTakeDeclarer).toBe(false);

    const tied = resolveLevels({
      opponentPoints: 85,
      declarerTeam: 'A',
      starterSeat: south,
      levels: { A: 5, B: 8 },
    });
    expect(tied.nextLevels).toEqual({ A: 5, B: 8 });
    expect(tied.nextDeclarerTeam).toBe('B');
    expect(tied.nextStarterSeat).toBe(1);
    expect(tied.nextTrumpRank).toBe('10');

    const taken = resolveLevels({
      opponentPoints: 160,
      declarerTeam: 'A',
      starterSeat: south,
      levels: { A: 5, B: 8 },
    });
    expect(taken.nextLevels.B).toBe(10);
    expect(taken.nextTrumpRank).toBe('Q');
    expect(taken.nextStarterSeat).toBe(1);
    expect(taken.gameOver).toBe(false);
  });
});

describe('game over', () => {
  it('ends the match when a team passes ace', () => {
    expect(isGameOver(12)).toBe(false);
    expect(isGameOver(13)).toBe(true);

    const winners = resolveLevels({
      opponentPoints: 0,
      declarerTeam: 'A',
      starterSeat: 0,
      levels: { A: 12, B: 0 },
    });
    expect(winners.gameOver).toBe(true);
    expect(winners.winner).toBe('A');
    expect(winners.nextTrumpRank).toBeNull();

    const reachAce = resolveLevels({
      opponentPoints: 40,
      declarerTeam: 'A',
      starterSeat: 0,
      levels: { A: 11, B: 0 },
    });
    expect(reachAce.gameOver).toBe(false);
    expect(reachAce.nextLevels.A).toBe(12);
    expect(reachAce.nextTrumpRank).toBe('A');

    const skipped = resolveLevels({
      opponentPoints: 0,
      declarerTeam: 'B',
      starterSeat: 1,
      levels: { A: 0, B: 10 },
    });
    expect(skipped.gameOver).toBe(true);
    expect(skipped.winner).toBe('B');
  });
});
