/** Seats run anticlockwise. Partners sit opposite: 0↔2 and 1↔3. */
export const SEATS = [0, 1, 2, 3] as const;
export type Seat = (typeof SEATS)[number];
export type TeamId = 'A' | 'B';

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

/** Low to high in a side suit when no rank is removed. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export type JokerColor = 'red' | 'black';

export interface Card {
  id: string;
  suit: Suit | null;
  rank: Rank | null;
  joker: JokerColor | null;
  copy: 0 | 1;
}

/**
 * A card's suit for following and trumping.
 * Jokers, trump-suit cards, and every trump-rank card belong to `'trump'`.
 */
export type PlaySuit = Suit | 'trump';

/**
 * Trump for one hand.
 * `noTrump` means only the jokers are trump; the trump rank has no special status.
 * `suit === null && noTrump === false` is not a legal active trump.
 */
export interface TrumpState {
  rank: Rank;
  suit: Suit | null;
  noTrump: boolean;
}

export type LeadKind = 'single' | 'pair' | 'tractor' | 'top-set';

export interface Lead {
  kind: LeadKind;
  cards: Card[];
  playSuit: PlaySuit;
  /** Identical pairs contained in the lead. */
  pairCount: number;
  /** Pair-count of a pure tractor. 0 unless `kind === 'tractor'`. */
  tractorLength: number;
}

export type DeclarationKind = 'single' | 'pair' | 'joker-pair';

export interface TrumpDeclaration {
  seat: Seat;
  kind: DeclarationKind;
  cardIds: string[];
  suit: Suit | null;
  noTrump: boolean;
}

export type Phase =
  | 'dealing'
  | 'making-trump'
  | 'redeal'
  | 'discard'
  | 'playing'
  | 'scoring'
  | 'game-over';

export interface TrickPlay {
  seat: Seat;
  cards: Card[];
}

export interface CompletedTrick {
  plays: TrickPlay[];
  lead: Lead;
  winnerSeat: Seat;
  points: number;
  opponentsScored: boolean;
}

export interface HandResult {
  opponentPoints: number;
  trickPoints: number;
  discardPoints: number;
  talonMultiplier: number;
  talonBonus: number;
  opponentsWonLastTrick: boolean;
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

export interface PlayerState {
  seat: Seat;
  hand: Card[];
}

export interface MatchState {
  phase: Phase;
  handNumber: number;
  openingSeat: Seat;
  /** Index of the next stock card to deal. Kitty is stock[100..107]. */
  dealIndex: number;
  stock: Card[];
  players: PlayerState[];
  levels: Record<TeamId, number>;
  /** Null on the first hand until someone makes trump. */
  declarerTeam: TeamId | null;
  starterSeat: Seat | null;
  trumpRank: Rank;
  trump: TrumpState | null;
  declaration: TrumpDeclaration | null;
  declarationHistory: TrumpDeclaration[];
  /** Seats that have passed since the last declaration in the confirmation window. */
  passes: Seat[];
  turnSeat: Seat;
  kitty: Card[];
  /** Cards of the kitty that were turned face up when nobody declared. */
  revealedKitty: Card[];
  discard: Card[];
  currentLead: Lead | null;
  currentTrick: TrickPlay[];
  trickHistory: CompletedTrick[];
  opponentPoints: number;
  lastResult: HandResult | null;
  winner: TeamId | null;
  /** Short status from the engine, such as a failed throw being reduced to one card. */
  announcement: string | null;
}

export interface PublicPlayer {
  seat: Seat;
  cardCount: number;
  hand?: Card[];
}

export interface PublicMatch {
  phase: Phase;
  handNumber: number;
  trumpRank: Rank;
  trumpSuit: Suit | null;
  noTrump: boolean;
  trumpMade: boolean;
  declarerTeam: TeamId | null;
  starterSeat: Seat | null;
  turnSeat: Seat;
  levels: Record<TeamId, number>;
  levelLabels: Record<TeamId, string>;
  opponentPoints: number;
  players: PublicPlayer[];
  currentTrick: TrickPlay[];
  declaration: TrumpDeclaration | null;
  revealedKitty: Card[];
  /** Present only when the buried cards are turned up at scoring. */
  discard: Card[] | null;
  yourSeat: Seat | 'spectator';
  winner: TeamId | null;
  lastResult: HandResult | null;
  passes: Seat[];
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): EngineResult<T> {
  return { ok: true, value };
}

export function fail<T>(error: string): EngineResult<T> {
  return { ok: false, error };
}
