import { describe, expect, it } from 'vitest';
import {
  classifyLead,
  parseCards,
  type Card,
  type TrumpState,
} from '../src/engine/index.js';

const clubsSeven: TrumpState = { rank: '7', suit: 'clubs', noTrump: false };
const diamondsFour: TrumpState = { rank: '4', suit: 'diamonds', noTrump: false };
const noTrump: TrumpState = { rank: '2', suit: null, noTrump: true };

function lead(codes: string, trump: TrumpState, others: Card[][] = []) {
  return classifyLead(parseCards(codes), trump, others);
}

function kindOf(codes: string, trump: TrumpState, others: Card[][] = []): string {
  const result = lead(codes, trump, others);
  return result.ok ? result.value.kind : 'illegal';
}

describe('tractor validation', () => {
  it('accepts consecutive identical pairs and rejects gaps and mixed suits', () => {
    expect(kindOf('H8 H8#1 H9 H9#1', clubsSeven)).toBe('tractor');
    expect(kindOf('HJ HJ#1 HQ HQ#1 HK HK#1', clubsSeven)).toBe('tractor');
    expect(kindOf('H8 H8#1 S9 S9#1', clubsSeven)).toBe('illegal');

    expect(kindOf('H5 H5#1 H7 H7#1', diamondsFour, [parseCards('HA HA#1')])).toBe('illegal');
    expect(kindOf('H5 H5#1 H7 H7#1', diamondsFour)).not.toBe('tractor');
  });

  it('treats 3 and 5 as adjacent when 4 is the trump rank', () => {
    expect(kindOf('H3 H3#1 H5 H5#1', diamondsFour)).toBe('tractor');
    expect(kindOf('D3 D3#1 D5 D5#1', diamondsFour)).toBe('tractor');
    expect(kindOf('H3 H3#1 H4 H4#1', diamondsFour)).toBe('illegal');
  });

  it('builds trump tractors through rank cards and jokers', () => {
    expect(kindOf('DA DA#1 H4 H4#1', diamondsFour)).toBe('tractor');
    expect(kindOf('H4 H4#1 D4 D4#1', diamondsFour)).toBe('tractor');
    expect(kindOf('D4 D4#1 JB JB#1', diamondsFour)).toBe('tractor');
    expect(kindOf('JB JB#1 JR JR#1', diamondsFour)).toBe('tractor');

    expect(kindOf('H4 H4#1 S4 S4#1', diamondsFour)).not.toBe('tractor');
    expect(kindOf('DA DA#1 D4 D4#1', diamondsFour)).not.toBe('tractor');
    expect(kindOf('H4 H4#1 JB JB#1', diamondsFour)).not.toBe('tractor');
    expect(kindOf('H4 H4#1 S5 S5#1', diamondsFour)).toBe('illegal');
  });

  it('uses only jokers as trump when the hand is no-trump', () => {
    expect(kindOf('JB JB#1 JR JR#1', noTrump)).toBe('tractor');
    expect(kindOf('H2 H2#1 H3 H3#1', noTrump)).toBe('tractor');
    expect(kindOf('H7 H7#1 S7 S7#1', noTrump)).toBe('illegal');
  });
});

describe('pairs and top-card sets', () => {
  it('requires an identical pair, not two equal cards', () => {
    expect(kindOf('H9 H9#1', clubsSeven)).toBe('pair');
    expect(kindOf('H7 H7#1', clubsSeven)).toBe('pair');
    expect(kindOf('H7 S7', clubsSeven, [parseCards('C7')])).toBe('illegal');
    expect(kindOf('H9 S9', clubsSeven)).toBe('illegal');
  });

  it('allows a set only when no outstanding card or pair can beat it', () => {
    expect(kindOf('HA HK', clubsSeven)).toBe('top-set');
    expect(kindOf('HA HK', clubsSeven, [parseCards('HA#1')])).toBe('illegal');
    expect(kindOf('HA HQ HQ#1', clubsSeven, [parseCards('HK')])).toBe('top-set');
    expect(kindOf('HA HQ HQ#1', clubsSeven, [parseCards('HK HK#1')])).toBe('illegal');
    expect(kindOf('HA HK', clubsSeven, [parseCards('S2'), parseCards('HA#1 D2'), parseCards('C2')])).toBe('illegal');
    expect(kindOf('HA HK', clubsSeven, [parseCards('S2'), parseCards('D2'), parseCards('C2')])).toBe('top-set');
  });
});
