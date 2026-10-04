import type { Card, HandResult, Phase, Rank, Seat, Suit, TeamId, TrumpState } from '../engine/index.js';
import { nextSeat, partnerSeat, teamOf } from '../engine/index.js';

export const HUMAN_SEAT: Seat = 0;

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const SUIT_NAME: Record<Suit, string> = {
  spades: '黑桃',
  hearts: '红桃',
  diamonds: '方块',
  clubs: '梅花',
};

export const PHASE_NAME: Record<Phase, string> = {
  dealing: '发牌',
  'making-trump': '亮主',
  redeal: '重新发牌',
  discard: '扣底',
  playing: '出牌',
  scoring: '计分',
  'game-over': '终局',
};

export function isRedCard(card: Card): boolean {
  return card.joker === 'red' || card.suit === 'hearts' || card.suit === 'diamonds';
}

export function rankText(card: Card): string {
  if (card.joker === 'red') return '大';
  if (card.joker === 'black') return '小';
  return card.rank ?? '';
}

export function cardCaption(card: Card): string {
  if (card.joker === 'red') return '大王';
  if (card.joker === 'black') return '小王';
  if (!card.suit || !card.rank) return '';
  return `${SUIT_GLYPH[card.suit]}${card.rank}`;
}

export function seatName(seat: Seat, human: Seat = HUMAN_SEAT): string {
  if (seat === human) return '你';
  if (seat === partnerSeat(human)) return '对家';
  if (seat === nextSeat(human)) return '下家';
  return '上家';
}

export function seatPlace(seat: Seat, human: Seat = HUMAN_SEAT): 'south' | 'east' | 'north' | 'west' {
  const offset = (seat - human + 4) % 4;
  if (offset === 0) return 'south';
  if (offset === 1) return 'east';
  if (offset === 2) return 'north';
  return 'west';
}

export function teamName(team: TeamId, human: Seat = HUMAN_SEAT): string {
  return team === teamOf(human) ? '我方' : '对方';
}

export function levelLabel(rank: Rank | string): string {
  return rank === 'beyond-ace' ? '过 A' : rank;
}

export function trumpLabel(rank: Rank, trump: TrumpState | null, made: boolean): string {
  if (!made || !trump) return `级牌 ${rank} · 未定主`;
  if (trump.noTrump) return `级牌 ${rank} · 无主`;
  if (!trump.suit) return `级牌 ${rank}`;
  return `级牌 ${rank} · 主${SUIT_NAME[trump.suit]} ${SUIT_GLYPH[trump.suit]}`;
}

export function resultSummary(result: HandResult, human: Seat = HUMAN_SEAT): string {
  const who = teamName(result.gainingTeam, human);
  if (result.gameOver) return `${who}升过 A，赢得整局`;
  if (result.levelsGained === 0) {
    return result.opponentsTakeDeclarer ? '闲家上台，双方不升级' : '本局双方不升级';
  }
  return `${who}升 ${result.levelsGained} 级`;
}
