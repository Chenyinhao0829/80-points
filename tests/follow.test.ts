import { describe, expect, it } from 'vitest';
import {
  buildLegalPlay,
  classifyLead,
  playableCardIds,
  createDeck,
  evaluateFollow,
  findPairs,
  mulberry32,
  parseCards,
  playSuit,
  shuffleDeck,
  type Card,
  type Lead,
  type TrumpState,
} from '../src/engine/index.js';

const clubsSeven: TrumpState = { rank: '7', suit: 'clubs', noTrump: false };
const diamondsFour: TrumpState = { rank: '4', suit: 'diamonds', noTrump: false };

function mustLead(codes: string, trump: TrumpState, others: Card[][] = []): Lead {
  const result = classifyLead(parseCards(codes), trump, others);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function follow(hand: string, lead: string, play: string, trump: TrumpState = clubsSeven) {
  return evaluateFollow(parseCards(hand), mustLead(lead, trump), parseCards(play), trump);
}

describe('single follow', () => {
  it('follows the led suit and does not treat a trump-rank card as that suit', () => {
    expect(follow('H8 H7', 'H9', 'H8').ok).toBe(true);
    expect(follow('H8 H7', 'H9', 'H7').ok).toBe(false);
    expect(follow('S9 H7', 'H8', 'S9').ok).toBe(true);
    expect(follow('S9 H7', 'H8', 'H7').ok).toBe(true);
    expect(follow('H8 S9', 'H9', 'S9').ok).toBe(false);
  });
});

describe('pair follow', () => {
  it('plays an identical pair when one is available', () => {
    expect(follow('H8 H8#1 H9 HA', 'H5 H5#1', 'H8 H8#1').ok).toBe(true);
    expect(follow('H8 H8#1 H9 HA', 'H5 H5#1', 'H9 HA').ok).toBe(false);
    expect(follow('H9 HA H3 H2', 'H5 H5#1', 'H3 H2').ok).toBe(true);
  });

  it('spends the last cards of the suit and does not trump with a side-suit rank pair', () => {
    expect(follow('H9 S2 D2', 'H5 H5#1', 'H9 S2').ok).toBe(true);
    expect(follow('H9 S2 D2', 'H5 H5#1', 'S2 D2').ok).toBe(false);
    expect(follow('H7 H7#1 H8 H9', 'H5 H5#1', 'H8 H9').ok).toBe(true);
    expect(follow('H7 H7#1 H8 H9', 'H5 H5#1', 'H7 H7#1').ok).toBe(false);
    expect(follow('H7 H7#1 S2 D2', 'H5 H5#1', 'H7 H7#1').ok).toBe(true);
  });
});

describe('tractor follow', () => {
  it('plays a tractor instead of two separated pairs', () => {
    const hand = 'HJ HJ#1 HQ HQ#1 H5 H5#1 HA HK';
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'HJ HJ#1 HQ HQ#1').ok).toBe(true);
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'HJ HJ#1 H5 H5#1').ok).toBe(false);
  });

  it('plays every pair it has when it has no tractor', () => {
    const hand = 'HJ HJ#1 H5 H5#1 HA HK H2 H3';
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'HJ HJ#1 H5 H5#1').ok).toBe(true);
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'HJ HJ#1 HA HK').ok).toBe(false);
  });

  it('adds a shorter tractor and then pairs when the lead is longer', () => {
    const hand = 'H8 H8#1 H9 H9#1 HJ HJ#1 HA HK HQ H6';
    const lead = 'H2 H2#1 H3 H3#1 H4 H4#1';
    expect(follow(hand, lead, 'H8 H8#1 H9 H9#1 HJ HJ#1').ok).toBe(true);
    expect(follow(hand, lead, 'HJ HJ#1 HA HK HQ H6').ok).toBe(false);
  });

  it('uses the trump-rank gap when judging a responding tractor', () => {
    const hand = 'H3 H3#1 H5 H5#1 H2 H2#1 H6 H6#1 HA HK';
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'H3 H3#1 H5 H5#1', diamondsFour).ok).toBe(true);
    expect(follow(hand, 'H8 H8#1 H9 H9#1', 'H2 H2#1 H6 H6#1', diamondsFour).ok).toBe(false);
  });

  it('plays every remaining card of the suit before filling', () => {
    expect(follow('HA HK S2 S3 D2', 'H8 H8#1 H9 H9#1', 'HA HK S2 S3').ok).toBe(true);
    expect(follow('HA HK S2 S3 D2', 'H8 H8#1 H9 H9#1', 'HA S2 S3 D2').ok).toBe(false);
  });
});

describe('shape is not the same as a legal follow', () => {
  it('accepts a pair of eights after an ace-king lead', () => {
    const lead = mustLead('HA HK', clubsSeven);
    expect(lead.kind).toBe('top-set');
    expect(lead.pairCount).toBe(0);
    expect(evaluateFollow(parseCards('H8 H8#1'), lead, parseCards('H8 H8#1'), clubsSeven).ok).toBe(true);
  });

  it('accepts ace-king after a pair when the follower has no pair', () => {
    expect(follow('HA HK', 'H8 H8#1', 'HA HK').ok).toBe(true);
  });

  it('still requires the pair when the follower has one', () => {
    expect(follow('H8 H8#1 HA HK', 'H5 H5#1', 'H8 H8#1').ok).toBe(true);
    expect(follow('H8 H8#1 HA HK', 'H5 H5#1', 'HA HK').ok).toBe(false);
  });
});

describe('playable cards follow the structure, not just the suit', () => {
  it('does not treat loose hearts as a pair when the lead is a pair', () => {
    const trump = clubsSeven;
    const lead = mustLead('H8 H8#1', trump);
    const hand = parseCards('HA HK H10 S3');
    const playable = playableCardIds(hand, lead, trump);
    expect(playable).toEqual(['HA-0', 'HK-0', 'H10-0']);
    expect(playable).not.toContain('S3-0');
    const hinted = buildLegalPlay(hand, lead, trump);
    expect(evaluateFollow(hand, lead, hinted, trump).ok).toBe(true);
    expect(hinted).toHaveLength(2);
    expect(new Set(hinted.map((card) => card.rank)).size).toBe(2);
  });

  it('only lights the pair when the hand can follow a pair', () => {
    const lead = mustLead('H5 H5#1', clubsSeven);
    const hand = parseCards('H8 H8#1 HA HK');
    expect(playableCardIds(hand, lead, clubsSeven)).toEqual(['H8-0', 'H8-1']);
    const hinted = buildLegalPlay(hand, lead, clubsSeven);
    expect(hinted.map((card) => card.id)).toEqual(['H8-0', 'H8-1']);
  });

  it('keeps a separated pair out of a tractor response that already has a tractor', () => {
    const lead = mustLead('H8 H8#1 H9 H9#1', clubsSeven);
    const hand = parseCards('HJ HJ#1 HQ HQ#1 H5 H5#1');
    expect(playableCardIds(hand, lead, clubsSeven).sort()).toEqual(['HJ-0', 'HJ-1', 'HQ-0', 'HQ-1']);
  });
});

describe('legal play builder', () => {
  it('builds a follow that the rules accept', () => {
    const trump: TrumpState = { rank: '9', suit: 'spades', noTrump: false };
    for (let seed = 1; seed <= 20; seed += 1) {
      const deck = shuffleDeck(createDeck(), mulberry32(seed));
      const hands = [0, 1, 2, 3].map((index) => deck.slice(index * 25, index * 25 + 25));
      const leader = hands[0]!;
      const single = buildLegalPlay(leader, null, trump);
      const lead = classifyLead(single, trump, hands.slice(1));
      expect(lead.ok).toBe(true);
      if (!lead.ok) continue;
      for (const hand of hands.slice(1)) {
        const play = buildLegalPlay(hand, lead.value, trump);
        expect(evaluateFollow(hand, lead.value, play, trump).ok).toBe(true);
      }

      const pair = findPairs(leader, trump).find((item) => playSuit(item.cards[0], trump) === 'hearts');
      if (!pair) continue;
      const pairLead = classifyLead(pair.cards, trump, hands.slice(1));
      expect(pairLead.ok).toBe(true);
      if (!pairLead.ok) continue;
      for (const hand of hands.slice(1)) {
        const play = buildLegalPlay(hand, pairLead.value, trump);
        expect(evaluateFollow(hand, pairLead.value, play, trump).ok).toBe(true);
      }
    }
  });
});
