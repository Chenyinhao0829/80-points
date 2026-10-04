import { createDeck, indexToRank, mulberry32, shuffleDeck, sumPoints } from './cards.js';
import { THROW_FAILED_MESSAGE, resolveOpeningLead, samePlaySuit } from './combinations.js';
import { trumpSuitFromKitty, validateDeclaration } from './declare.js';
import { evaluateFollow } from './follow.js';
import { nextSeat, resolveLevels, talonMultiplier, teamOf } from './scoring.js';
import { determineTrickWinner, trickPoints } from './trick.js';
import {
  SEATS,
  fail,
  ok,
  type Card,
  type EngineResult,
  type HandResult,
  type MatchState,
  type Rank,
  type Seat,
  type TeamId,
  type TrumpState,
} from './types.js';

export interface CreateMatchOptions {
  seed?: number;
  deck?: readonly Card[];
  openingSeat?: Seat;
  handNumber?: number;
  levels?: Record<TeamId, number>;
  declarerTeam?: TeamId | null;
  starterSeat?: Seat | null;
  trumpRank?: Rank;
}

export function createMatch(options: CreateMatchOptions = {}): MatchState {
  const handNumber = options.handNumber ?? 1;
  const levels = options.levels ?? { A: 0, B: 0 };
  const declarerTeam = handNumber === 1 ? null : options.declarerTeam ?? null;
  const starterSeat = handNumber === 1 ? null : options.starterSeat ?? null;
  if (handNumber > 1 && (declarerTeam === null || starterSeat === null)) {
    throw new Error('Later hands need a declarer team and a starter');
  }
  const trumpRank = options.trumpRank ?? trumpRankFromLevel(declarerTeam, levels);
  // TEST / DEBUG MODE passes `seed` or `deck`. NORMAL GAME MODE uses crypto Fisher-Yates.
  const random = options.seed === undefined ? cryptoRandom : mulberry32(options.seed);
  const openingSeat = options.openingSeat ?? (Math.floor(random() * 4) as Seat);
  return {
    phase: 'dealing',
    handNumber,
    openingSeat,
    dealIndex: 0,
    stock: prepareStock(options.deck, random),
    players: SEATS.map((seat) => ({ seat, hand: [] })),
    levels: { ...levels },
    declarerTeam,
    starterSeat,
    trumpRank,
    trump: null,
    declaration: null,
    declarationHistory: [],
    passes: [],
    turnSeat: openingSeat,
    kitty: [],
    revealedKitty: [],
    discard: [],
    currentLead: null,
    currentTrick: [],
    trickHistory: [],
    opponentPoints: 0,
    lastResult: null,
    winner: null,
    announcement: null,
  };
}

export function dealNext(state: MatchState): EngineResult<MatchState> {
  if (state.phase !== 'dealing') return fail('Cards are not being dealt');
  if (state.dealIndex >= 100) return fail('The deal is already finished');
  const next = clone(state);
  const seat = ((next.openingSeat + next.dealIndex) % 4) as Seat;
  const card = next.stock[next.dealIndex];
  if (!card) return fail('The stock is empty');
  next.players[seat]!.hand.push({ ...card });
  next.dealIndex += 1;
  if (next.dealIndex === 100) {
    next.kitty = next.stock.slice(100, 108).map((item) => ({ ...item }));
    next.phase = 'making-trump';
    next.passes = [];
    next.turnSeat = next.openingSeat;
  } else {
    next.turnSeat = ((next.openingSeat + next.dealIndex) % 4) as Seat;
  }
  return ok(next);
}

export function declareTrump(
  state: MatchState,
  seat: Seat,
  cardIds: readonly string[],
): EngineResult<MatchState> {
  if (state.phase !== 'dealing' && state.phase !== 'making-trump') {
    return fail('Trump cannot be declared now');
  }
  if (!isSeat(seat)) return fail('Unknown seat');
  if (state.phase === 'making-trump' && state.turnSeat !== seat) {
    return fail('It is not your turn');
  }
  const declaration = validateDeclaration({
    hand: state.players[seat]!.hand,
    seat,
    cardIds,
    trumpRank: state.trumpRank,
    current: state.declaration,
  });
  if (!declaration.ok) return fail(declaration.error);
  const next = clone(state);
  next.declaration = declaration.value;
  next.declarationHistory.push(declaration.value);
  next.trump = trumpFromDeclaration(next.trumpRank, declaration.value);
  if (next.phase === 'making-trump') {
    next.passes = [];
    next.turnSeat = nextSeat(seat);
  }
  return ok(next);
}

export function passDeclare(state: MatchState, seat: Seat): EngineResult<MatchState> {
  if (state.phase !== 'making-trump') return fail('Trump is not being decided');
  if (state.turnSeat !== seat) return fail('It is not your turn');
  const next = clone(state);
  if (!next.passes.includes(seat)) next.passes.push(seat);
  if (next.passes.length === 4) return ok(lockTrump(next));
  next.turnSeat = nextSeat(seat);
  return ok(next);
}

export function discardCards(
  state: MatchState,
  seat: Seat,
  cardIds: readonly string[],
): EngineResult<MatchState> {
  if (state.phase !== 'discard') return fail('It is not time to discard');
  if (seat !== state.starterSeat) return fail('Only the starter discards');
  if (cardIds.length !== 8) return fail('Discard exactly 8 cards');
  const next = clone(state);
  const player = next.players[seat]!;
  const drawn = drawCards(player.hand, cardIds);
  if (!drawn) return fail('Those cards are not in your hand');
  if (drawn.hand.length !== 25) return fail('The starter must have 25 cards after discarding');
  player.hand = drawn.hand;
  next.discard = drawn.taken;
  next.phase = 'playing';
  next.turnSeat = seat;
  next.currentLead = null;
  next.currentTrick = [];
  return ok(next);
}

export function playCards(
  state: MatchState,
  seat: Seat,
  cardIds: readonly string[],
): EngineResult<MatchState> {
  if (state.phase !== 'playing') return fail('It is not time to play');
  if (state.turnSeat !== seat) return fail('It is not your turn');
  if (!state.trump || state.starterSeat === null || state.declarerTeam === null) {
    return fail('Trump has not been settled');
  }
  const next = clone(state);
  const owned = drawCards(next.players[seat]!.hand, cardIds);
  if (!owned) return fail('Those cards are not in your hand');

  if (next.currentTrick.length === 0) {
    if (!samePlaySuit(owned.taken, next.trump!)) {
      return fail('第一手必须是同一门花色');
    }
    const resolved = resolveOpeningLead(owned.taken, next.players[seat]!.hand, next.trump!, otherHands(next, seat));
    const played = drawCards(
      next.players[seat]!.hand,
      resolved.cards.map((card) => card.id),
    );
    if (!played) return fail('Those cards are not in your hand');
    next.players[seat]!.hand = played.hand;
    next.currentLead = resolved.lead;
    next.currentTrick = [{ seat, cards: played.taken }];
    next.announcement = resolved.degraded ? THROW_FAILED_MESSAGE : null;
    next.turnSeat = nextSeat(seat);
    return ok(next);
  }

  if (!next.currentLead || !next.trump) return fail('The current trick has no lead');
  const follow = evaluateFollow(next.players[seat]!.hand, next.currentLead, owned.taken, next.trump);
  if (!follow.ok) return fail(follow.error);
  next.players[seat]!.hand = owned.hand;
  next.currentTrick.push({ seat, cards: owned.taken });
  next.announcement = null;
  if (next.currentTrick.length < 4) {
    next.turnSeat = nextSeat(seat);
    return ok(next);
  }
  return ok(resolveTrick(next));
}

export function startNextHand(
  state: MatchState,
  options: { seed?: number; deck?: readonly Card[] } = {},
): EngineResult<MatchState> {
  if (state.phase !== 'scoring' || !state.lastResult) return fail('The hand is not ready to continue');
  if (state.lastResult.gameOver || !state.lastResult.nextTrumpRank) return fail('The match is over');
  return ok(
    createMatch({
      seed: options.seed ?? Date.now(),
      deck: options.deck,
      openingSeat: state.lastResult.nextStarterSeat,
      handNumber: state.handNumber + 1,
      levels: state.lastResult.nextLevels,
      declarerTeam: state.lastResult.nextDeclarerTeam,
      starterSeat: state.lastResult.nextStarterSeat,
      trumpRank: state.lastResult.nextTrumpRank,
    }),
  );
}

export function redeal(
  state: MatchState,
  options: { seed?: number; deck?: readonly Card[] } = {},
): EngineResult<MatchState> {
  if (state.phase !== 'redeal') return fail('No redeal is needed');
  return ok(
    createMatch({
      seed: options.seed ?? Date.now(),
      deck: options.deck,
      openingSeat: state.starterSeat ?? state.openingSeat,
      handNumber: state.handNumber,
      levels: state.levels,
      declarerTeam: state.declarerTeam,
      starterSeat: state.starterSeat,
      trumpRank: state.trumpRank,
    }),
  );
}

function lockTrump(state: MatchState): MatchState {
  if (!state.declaration || !state.trump) {
    if (state.handNumber === 1) {
      state.phase = 'redeal';
      return state;
    }
    const resolved = trumpSuitFromKitty(state.kitty, state.trumpRank);
    state.trump = { rank: state.trumpRank, suit: resolved.suit, noTrump: false };
    state.revealedKitty = resolved.revealed.map((card) => ({ ...card }));
  }
  return beginDiscard(state);
}

function beginDiscard(state: MatchState): MatchState {
  if (state.handNumber === 1) {
    if (!state.declaration) throw new Error('The first hand ended without a trump declaration');
    state.starterSeat = state.declaration.seat;
    state.declarerTeam = teamOf(state.declaration.seat);
  }
  if (state.starterSeat === null || state.declarerTeam === null || !state.trump) {
    throw new Error('Cannot bury cards before trump and the starter are known');
  }
  const starter = state.players[state.starterSeat]!;
  starter.hand = [...starter.hand, ...state.kitty.map((card) => ({ ...card }))];
  state.phase = 'discard';
  state.turnSeat = state.starterSeat;
  return state;
}

function resolveTrick(state: MatchState): MatchState {
  const lead = state.currentLead;
  const trump = state.trump;
  if (!lead || !trump || state.declarerTeam === null) throw new Error('Incomplete trick');
  const winnerSeat = determineTrickWinner(state.currentTrick, lead, trump);
  const points = trickPoints(state.currentTrick);
  const opponentsScored = teamOf(winnerSeat) !== state.declarerTeam;
  if (opponentsScored) state.opponentPoints += points;
  state.trickHistory.push({
    plays: state.currentTrick,
    lead,
    winnerSeat,
    points,
    opponentsScored,
  });
  state.currentTrick = [];
  state.currentLead = null;
  if (state.players.every((player) => player.hand.length === 0)) return finalizeHand(state);
  state.turnSeat = winnerSeat;
  return state;
}

function finalizeHand(state: MatchState): MatchState {
  const last = state.trickHistory[state.trickHistory.length - 1];
  if (!last || state.declarerTeam === null || state.starterSeat === null) {
    throw new Error('Cannot score an unfinished hand');
  }
  const opponentsWonLastTrick = teamOf(last.winnerSeat) !== state.declarerTeam;
  const discardPoints = sumPoints(state.discard);
  const multiplier = opponentsWonLastTrick ? talonMultiplier(last.lead.cards.length) : 0;
  const talonBonus = discardPoints * multiplier;
  const trickPointsTotal = state.opponentPoints;
  state.opponentPoints += talonBonus;
  const resolution = resolveLevels({
    opponentPoints: state.opponentPoints,
    declarerTeam: state.declarerTeam,
    starterSeat: state.starterSeat,
    levels: state.levels,
  });
  const result: HandResult = {
    opponentPoints: state.opponentPoints,
    trickPoints: trickPointsTotal,
    discardPoints,
    talonMultiplier: multiplier,
    talonBonus,
    opponentsWonLastTrick,
    ...resolution,
  };
  state.lastResult = result;
  state.levels = resolution.nextLevels;
  state.winner = resolution.winner;
  state.phase = resolution.gameOver ? 'game-over' : 'scoring';
  return state;
}

function trumpFromDeclaration(rank: Rank, declaration: { suit: TrumpState['suit']; noTrump: boolean }): TrumpState {
  return { rank, suit: declaration.suit, noTrump: declaration.noTrump };
}

function otherHands(state: MatchState, seat: Seat): Card[][] {
  return state.players.filter((player) => player.seat !== seat).map((player) => player.hand);
}

function drawCards(hand: readonly Card[], cardIds: readonly string[]): { hand: Card[]; taken: Card[] } | null {
  if (new Set(cardIds).size !== cardIds.length) return null;
  const byId = new Map(hand.map((card) => [card.id, card]));
  const taken: Card[] = [];
  for (const id of cardIds) {
    const card = byId.get(id);
    if (!card) return null;
    taken.push(card);
  }
  const used = new Set(cardIds);
  return { hand: hand.filter((card) => !used.has(card.id)), taken };
}

function trumpRankFromLevel(declarerTeam: TeamId | null, levels: Record<TeamId, number>): Rank {
  if (!declarerTeam) return '2';
  const rank = indexToRank(levels[declarerTeam]);
  if (!rank) throw new Error('The declaring team has already finished the match');
  return rank;
}

function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0]! / 0x100000000;
}

function prepareStock(deck: readonly Card[] | undefined, random: () => number): Card[] {
  if (!deck) return shuffleDeck(createDeck(), random);
  if (deck.length !== 108) throw new Error('A deck needs 108 cards');
  const ids = new Set(deck.map((card) => card.id));
  if (ids.size !== 108) throw new Error('Deck card ids must be unique');
  return deck.map((card) => ({ ...card }));
}

function isSeat(seat: number): seat is Seat {
  return seat === 0 || seat === 1 || seat === 2 || seat === 3;
}

function clone(state: MatchState): MatchState {
  return structuredClone(state);
}
