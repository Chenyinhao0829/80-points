import { describe, expect, it } from 'vitest';
import {
  cardPoints,
  chainIndex,
  createDeck,
  playSuit,
  sumPoints,
  type TrumpState,
} from '../src/engine/index.js';
import { cardFromCode } from '../src/engine/index.js';

const clubsSeven: TrumpState = { rank: '7', suit: 'clubs', noTrump: false };
const diamondsFour: TrumpState = { rank: '4', suit: 'diamonds', noTrump: false };
const noTrump: TrumpState = { rank: '7', suit: null, noTrump: true };

function at(code: string, trump: TrumpState = clubsSeven): number {
  return chainIndex(cardFromCode(code), trump);
}

describe('trump hierarchy', () => {
  it('ranks red joker, black joker, master rank, other rank cards, then the trump suit', () => {
    expect(at('JR')).toBeGreaterThan(at('JB'));
    expect(at('JB')).toBeGreaterThan(at('C7'));
    expect(at('C7')).toBeGreaterThan(at('H7'));
    expect(at('H7')).toBe(at('S7'));
    expect(at('S7')).toBe(at('D7'));
    expect(at('H7')).toBeGreaterThan(at('CA'));
    expect(at('CA')).toBeGreaterThan(at('CK'));
    expect(at('C8')).toBe(at('C6') + 1);
    expect(at('C6')).toBeGreaterThan(at('C5'));
    expect(at('C3')).toBeGreaterThan(at('C2'));
    expect(at('C2')).toBe(0);
    expect(at('CA')).toBe(11);
    expect(at('H7')).toBe(12);
    expect(at('C7')).toBe(13);
    expect(at('JB')).toBe(14);
    expect(at('JR')).toBe(15);
  });

  it('moves every trump-rank card and every joker into the trump suit', () => {
    expect(playSuit(cardFromCode('H7'), clubsSeven)).toBe('trump');
    expect(playSuit(cardFromCode('C8'), clubsSeven)).toBe('trump');
    expect(playSuit(cardFromCode('JR'), clubsSeven)).toBe('trump');
    expect(playSuit(cardFromCode('H8'), clubsSeven)).toBe('hearts');
    expect(chainIndex(cardFromCode('H8'), clubsSeven)).toBe(chainIndex(cardFromCode('H6'), clubsSeven) + 1);
  });

  it('joins 3 and 5 when the trump rank is 4', () => {
    expect(at('H5', diamondsFour)).toBe(at('H3', diamondsFour) + 1);
    expect(at('D5', diamondsFour)).toBe(at('D3', diamondsFour) + 1);
    expect(at('DA', diamondsFour) + 1).toBe(at('H4', diamondsFour));
    expect(at('H4', diamondsFour) + 1).toBe(at('D4', diamondsFour));
    expect(at('D4', diamondsFour) + 1).toBe(at('JB', diamondsFour));
  });
});

describe('no-trump', () => {
  it('leaves the trump rank in its printed suit and keeps only jokers as trump', () => {
    expect(playSuit(cardFromCode('H7'), noTrump)).toBe('hearts');
    expect(playSuit(cardFromCode('JR'), noTrump)).toBe('trump');
    expect(at('JR', noTrump)).toBeGreaterThan(at('JB', noTrump));
    expect(at('HA', noTrump)).toBeGreaterThan(at('H7', noTrump));
    expect(at('H7', noTrump)).toBe(at('H6', noTrump) + 1);
    expect(at('H8', noTrump)).toBe(at('H7', noTrump) + 1);
  });
});

describe('deck points', () => {
  it('contains 108 cards and 200 points', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((card) => card.id)).size).toBe(108);
    expect(sumPoints(deck)).toBe(200);
    expect(deck.filter((card) => card.joker === 'red')).toHaveLength(2);
    expect(deck.filter((card) => card.joker === 'black')).toHaveLength(2);
    expect(cardPoints(cardFromCode('H5'))).toBe(5);
    expect(cardPoints(cardFromCode('H4'))).toBe(0);
  });
});
