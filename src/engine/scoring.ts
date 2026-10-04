import { indexToRank } from './cards.js';
import type { Rank, Seat, TeamId } from './types.js';

/**
 * Opponents' points decide the hand. Bands are 40 points wide around the 80-point
 * threshold. Exactly 0 is its own band: the declarers go up three levels.
 * 240 and above keeps adding one level per 40 points, which is how a buried
 * kitty can push the score past the 200 points in the deck.
 */
export function levelChangeForOpponentPoints(points: number): {
  gainingSide: 'declarers' | 'opponents';
  levels: number;
  opponentsTakeDeclarer: boolean;
} {
  if (points < 0) throw new Error('Points cannot be negative');
  if (points >= 80) {
    return {
      gainingSide: 'opponents',
      levels: Math.floor((points - 80) / 40),
      opponentsTakeDeclarer: true,
    };
  }
  if (points === 0) {
    return { gainingSide: 'declarers', levels: 3, opponentsTakeDeclarer: false };
  }
  return {
    gainingSide: 'declarers',
    levels: Math.floor((79 - points) / 40) + 1,
    opponentsTakeDeclarer: false,
  };
}

/** Single ×2, pair ×4, four-card tractor ×8: always twice the number of cards led. */
export function talonMultiplier(lastTrickCardCount: number): number {
  if (lastTrickCardCount < 1) throw new Error('A trick must contain cards');
  return 2 * lastTrickCardCount;
}

export function partnerSeat(seat: number): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function nextSeat(seat: number): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function teamOf(seat: number): TeamId {
  return seat % 2 === 0 ? 'A' : 'B';
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

/**
 * Declarers keep the deal: the starter's partner deals next.
 * Opponents take the deal: the next player anticlockwise becomes starter.
 * In the worked example, East follows South.
 */
export function nextStarterSeat(starter: Seat, opponentsTakeDeclarer: boolean): Seat {
  return opponentsTakeDeclarer ? nextSeat(starter) : partnerSeat(starter);
}

export interface ScoreResolution {
  gainingTeam: TeamId;
  levelsGained: number;
  opponentsTakeDeclarer: boolean;
  nextLevels: Record<TeamId, number>;
  nextDeclarerTeam: TeamId;
  nextStarterSeat: Seat;
  nextTrumpRank: Rank | null;
  gameOver: boolean;
  winner: TeamId | null;
}

export function resolveLevels(input: {
  opponentPoints: number;
  declarerTeam: TeamId;
  starterSeat: Seat;
  levels: Record<TeamId, number>;
}): ScoreResolution {
  const change = levelChangeForOpponentPoints(input.opponentPoints);
  const gainingTeam = change.gainingSide === 'declarers' ? input.declarerTeam : otherTeam(input.declarerTeam);
  const nextLevels: Record<TeamId, number> = { ...input.levels };
  nextLevels[gainingTeam] += change.levels;
  const nextDeclarerTeam = change.opponentsTakeDeclarer ? otherTeam(input.declarerTeam) : input.declarerTeam;
  const nextLevel = nextLevels[nextDeclarerTeam];
  const gameOver = nextLevels[gainingTeam] > 12;
  return {
    gainingTeam,
    levelsGained: change.levels,
    opponentsTakeDeclarer: change.opponentsTakeDeclarer,
    nextLevels,
    nextDeclarerTeam,
    nextStarterSeat: nextStarterSeat(input.starterSeat, change.opponentsTakeDeclarer),
    nextTrumpRank: gameOver ? null : indexToRank(nextLevel),
    gameOver,
    winner: gameOver ? gainingTeam : null,
  };
}

export function isGameOver(levelIndex: number): boolean {
  return levelIndex > 12;
}
