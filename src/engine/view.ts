import { levelName } from './cards.js';
import type { Card, MatchState, PublicMatch, Seat } from './types.js';

/** Client view. Hidden hands, the stock, and a buried discard stay on the server. */
export function projectMatch(state: MatchState, viewer: Seat | 'spectator'): PublicMatch {
  const showDiscard =
    (state.phase === 'scoring' || state.phase === 'game-over') &&
    state.lastResult?.opponentsWonLastTrick === true;
  return {
    phase: state.phase,
    handNumber: state.handNumber,
    trumpRank: state.trumpRank,
    trumpSuit: state.trump?.suit ?? null,
    noTrump: state.trump?.noTrump ?? false,
    trumpMade: state.trump !== null,
    declarerTeam: state.declarerTeam,
    starterSeat: state.starterSeat,
    turnSeat: state.turnSeat,
    levels: { ...state.levels },
    levelLabels: {
      A: levelName(state.levels.A),
      B: levelName(state.levels.B),
    },
    opponentPoints: state.opponentPoints,
    players: state.players.map((player) => ({
      seat: player.seat,
      cardCount: player.hand.length,
      hand: player.seat === viewer ? player.hand.map(copyCard) : undefined,
    })),
    currentTrick: state.currentTrick.map((play) => ({
      seat: play.seat,
      cards: play.cards.map(copyCard),
    })),
    declaration: state.declaration ? { ...state.declaration, cardIds: [...state.declaration.cardIds] } : null,
    revealedKitty: state.revealedKitty.map(copyCard),
    discard: showDiscard ? state.discard.map(copyCard) : null,
    yourSeat: viewer,
    winner: state.winner,
    lastResult: state.lastResult
      ? { ...state.lastResult, nextLevels: { ...state.lastResult.nextLevels } }
      : null,
    passes: [...state.passes],
  };
}

function copyCard(card: Card): Card {
  return { ...card };
}
