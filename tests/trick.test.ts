import { describe, expect, it } from 'vitest';
import {
  classifyLead,
  determineTrickWinner,
  parseCards,
  type Seat,
  type TrumpState,
} from '../src/engine/index.js';

const clubsSeven: TrumpState = { rank: '7', suit: 'clubs', noTrump: false };

function winner(plays: readonly [Seat, string][], trump: TrumpState = clubsSeven): Seat {
  const trick = plays.map(([seat, codes]) => ({ seat, cards: parseCards(codes) }));
  const lead = classifyLead(trick[0]!.cards, trump, []);
  if (!lead.ok) throw new Error(lead.error);
  return determineTrickWinner(trick, lead.value, trump);
}

describe('trick winner', () => {
  it('lets the highest card of the led suit win, with trump beating a side suit', () => {
    expect(winner([[0, 'H9'], [1, 'HJ'], [2, 'HJ#1'], [3, 'H10']])).toBe(1);
    expect(winner([[0, 'H9'], [1, 'H8'], [2, 'CA'], [3, 'HK']])).toBe(2);
    expect(winner([[0, 'H7'], [1, 'D7'], [2, 'S3'], [3, 'C3']])).toBe(0);
    expect(winner([[0, 'C7'], [1, 'JR'], [2, 'JB'], [3, 'H7']])).toBe(1);
    expect(winner([[0, 'C3'], [1, 'JR'], [2, 'JR#1'], [3, 'JB']])).toBe(1);
    expect(winner([[0, 'H9'], [1, 'HA'], [2, 'HA#1'], [3, 'H2']])).toBe(1);
  });

  it('lets only an identical pair beat a pair', () => {
    expect(winner([[0, 'H5 H5#1'], [1, 'HA HQ'], [2, 'H3 H2'], [3, 'H4 H6']])).toBe(0);
    expect(winner([[0, 'H5 H5#1'], [1, 'HK HK#1'], [2, 'H3 H2'], [3, 'H4 H6']])).toBe(1);
    expect(winner([[0, 'H5 H5#1'], [1, 'HK HK#1'], [2, 'C2 C2#1'], [3, 'H3 H4']])).toBe(2);
    expect(winner([[0, 'H5 H5#1'], [1, 'JR JB'], [2, 'H3 H2'], [3, 'H4 H6']])).toBe(0);
    expect(winner([[0, 'H5 H5#1'], [1, 'S7 S7#1'], [2, 'D7 D7#1'], [3, 'H3 H2']])).toBe(1);
  });

  it('lets only a same-length tractor beat a tractor, and trump tractors beat side tractors', () => {
    expect(
      winner([
        [0, 'H3 H3#1 H4 H4#1'],
        [1, 'HJ HJ#1 H5 H5#1'],
        [2, 'H8 H9 H2 HA'],
        [3, 'HK HQ H6 H10'],
      ]),
    ).toBe(0);
    expect(
      winner([
        [0, 'H3 H3#1 H4 H4#1'],
        [1, 'HJ HJ#1 HQ HQ#1'],
        [2, 'H8 H2 H6 H9'],
        [3, 'HK HA H5 H10'],
      ]),
    ).toBe(1);
    expect(
      winner([
        [0, 'H3 H3#1 H4 H4#1'],
        [1, 'HJ HJ#1 HQ HQ#1'],
        [2, 'C8 C8#1 C9 C9#1'],
        [3, 'HK HA H5 H10'],
      ]),
    ).toBe(2);
    expect(
      winner([
        [0, 'H3 H3#1 H4 H4#1'],
        [1, 'HJ HJ#1 HQ HQ#1'],
        [2, 'C8 C8#1 C9 C9#1'],
        [3, 'CJ CJ#1 CQ CQ#1'],
      ]),
    ).toBe(3);
  });

  it('gives a top-card set to the leader unless someone plays a full trump answer', () => {
    const trump = clubsSeven;
    const noPair = classifyLead(parseCards('HA HK'), trump, []);
    if (!noPair.ok) throw new Error(noPair.error);
    expect(
      determineTrickWinner(
        [
          { seat: 0, cards: parseCards('HA HK') },
          { seat: 1, cards: parseCards('C3 C2') },
          { seat: 2, cards: parseCards('CA S2') },
          { seat: 3, cards: parseCards('H4 H6') },
        ],
        noPair.value,
        trump,
      ),
    ).toBe(1);
    expect(
      determineTrickWinner(
        [
          { seat: 0, cards: parseCards('HA HK') },
          { seat: 1, cards: parseCards('CA C2') },
          { seat: 2, cards: parseCards('CA#1 C3') },
          { seat: 3, cards: parseCards('H4 H6') },
        ],
        noPair.value,
        trump,
      ),
    ).toBe(1);

    const withPair = classifyLead(parseCards('HA HQ HQ#1'), trump, []);
    if (!withPair.ok) throw new Error(withPair.error);
    expect(
      determineTrickWinner(
        [
          { seat: 0, cards: parseCards('HA HQ HQ#1') },
          { seat: 1, cards: parseCards('CA C5 C5#1') },
          { seat: 2, cards: parseCards('C2 C7 C7#1') },
          { seat: 3, cards: parseCards('H4 H6 H3') },
        ],
        withPair.value,
        trump,
      ),
    ).toBe(2);
    expect(
      determineTrickWinner(
        [
          { seat: 0, cards: parseCards('HA HQ HQ#1') },
          { seat: 1, cards: parseCards('CA CK CQ') },
          { seat: 2, cards: parseCards('C5 C3 H2') },
          { seat: 3, cards: parseCards('H4 H6 H8') },
        ],
        withPair.value,
        trump,
      ),
    ).toBe(0);
  });
});
