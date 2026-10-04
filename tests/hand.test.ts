import { describe, expect, it } from 'vitest';
import { createMatch, handGroup, parseCards, sortHand, type TrumpState } from '../src/engine/index.js';

const heartsTwo: TrumpState = { rank: '2', suit: 'hearts', noTrump: false };
const noTrump: TrumpState = { rank: '2', suit: null, noTrump: true };

describe('hand order', () => {
  it('keeps each suit in one block, low to high, with jokers last', () => {
    const ordered = sortHand(parseCards('C5 SA HK D9 H3 JR JB'), noTrump);
    expect(ordered.map((card) => card.id)).toEqual(['SA-0', 'D9-0', 'C5-0', 'H3-0', 'HK-0', 'JB-0', 'JR-0']);
  });

  it('groups hearts 2 as spades, diamonds, clubs, hearts, subordinate twos, master two, then jokers', () => {
    const ordered = sortHand(parseCards('JR JB H2 S2 D2 HA H5 H3 SA C9 C3 D4 S3'), heartsTwo);
    expect(ordered.map((card) => card.id)).toEqual([
      'S3-0',
      'SA-0',
      'D4-0',
      'C3-0',
      'C9-0',
      'H3-0',
      'H5-0',
      'HA-0',
      'S2-0',
      'D2-0',
      'H2-0',
      'JB-0',
      'JR-0',
    ]);
    expect(handGroup(ordered[5]!, heartsTwo)).toBe('trump');
    expect(handGroup(ordered.at(-1)!, heartsTwo)).toBe('joker');
  });

  it('skips a missing suit and still keeps the trump suit on the right', () => {
    const ordered = sortHand(parseCards('H7 H3 S9 S4 C5'), heartsTwo).map((card) => card.id);
    expect(ordered).toEqual(['S4-0', 'S9-0', 'C5-0', 'H3-0', 'H7-0']);
  });

  it('uses the fixed side order for each trump suit', () => {
    const diamonds: TrumpState = { rank: '2', suit: 'diamonds', noTrump: false };
    const spades: TrumpState = { rank: '2', suit: 'spades', noTrump: false };
    const clubs: TrumpState = { rank: '2', suit: 'clubs', noTrump: false };
    const same = parseCards('S5 H3 C9 D4');

    expect(sortHand(same, diamonds).map((card) => card.suit)).toEqual(['spades', 'hearts', 'clubs', 'diamonds']);
    expect(sortHand(same, heartsTwo).map((card) => card.suit)).toEqual(['spades', 'diamonds', 'clubs', 'hearts']);
    expect(sortHand(same, spades).map((card) => card.suit)).toEqual(['diamonds', 'clubs', 'hearts', 'spades']);
    expect(sortHand(same, clubs).map((card) => card.suit)).toEqual(['diamonds', 'spades', 'hearts', 'clubs']);
  });

  it('resorts as soon as the trump suit changes', () => {
    const cards = parseCards('S5 H3 C9 D4 D8');
    const hearts = sortHand(cards, heartsTwo).map((card) => card.id);
    const diamonds: TrumpState = { rank: '2', suit: 'diamonds', noTrump: false };
    const next = sortHand(cards, diamonds).map((card) => card.id);
    expect(hearts).toEqual(['S5-0', 'D4-0', 'D8-0', 'C9-0', 'H3-0']);
    expect(next).toEqual(['S5-0', 'H3-0', 'C9-0', 'D4-0', 'D8-0']);
  });
});

describe('normal shuffle', () => {
  it('does not reuse one fixed deck when no seed is supplied', () => {
    const openings = new Set(Array.from({ length: 6 }, () => createMatch().stock[0]!.id));
    expect(openings.size).toBeGreaterThan(1);
  });

  it('stays reproducible only in seeded test mode', () => {
    const left = createMatch({ seed: 42, openingSeat: 0 }).stock.map((card) => card.id);
    const right = createMatch({ seed: 42, openingSeat: 0 }).stock.map((card) => card.id);
    expect(left).toEqual(right);
  });
});
