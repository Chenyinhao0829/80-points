import { describe, expect, it } from 'vitest';
import {
  createDeck,
  parseCards,
  trumpSuitFromKitty,
  validateDeclaration,
  type TrumpDeclaration,
} from '../src/engine/index.js';
import { expectFail } from './helpers.js';

const hand = parseCards('H2 S2 S2#1 C2 JR JR#1 JB D3');

function declare(
  seat: 0 | 1 | 2 | 3,
  codes: string[],
  current: TrumpDeclaration | null,
) {
  const cards = parseCards(codes.join(' '));
  return validateDeclaration({
    hand,
    seat,
    cardIds: cards.map((card) => card.id),
    trumpRank: '2',
    current,
  });
}

describe('making trump', () => {
  it('lets a pair override someone else, and jokers override a pair into no-trump', () => {
    const single = declare(0, ['H2'], null);
    expect(single.ok && single.value.kind).toBe('single');
    expect(single.ok && single.value.suit).toBe('hearts');

    expectFail(declare(0, ['S2', 'S2#1'], single.ok ? single.value : null), 'your own trump');

    const partner = declare(2, ['S2', 'S2#1'], single.ok ? single.value : null);
    expect(partner.ok && partner.value.suit).toBe('spades');
    expect(partner.ok && partner.value.kind).toBe('pair');

    expectFail(declare(1, ['C2'], partner.ok ? partner.value : null));
    expectFail(declare(3, ['H2'], single.ok ? single.value : null));

    const jokers = declare(0, ['JR', 'JR#1'], partner.ok ? partner.value : null);
    expect(jokers.ok && jokers.value.noTrump).toBe(true);
    expectFail(declare(1, ['S2', 'S2#1'], jokers.ok ? jokers.value : null));
  });

  it('accepts an opening pair or joker pair, and rejects a mixed pair', () => {
    expect(declare(1, ['S2', 'S2#1'], null).ok).toBe(true);
    const openingJokers = declare(1, ['JR', 'JR#1'], null);
    expect(openingJokers.ok && openingJokers.value.noTrump).toBe(true);
    expectFail(declare(1, ['JR', 'JB'], null));
    expectFail(declare(1, ['H2', 'S2'], null));
    expectFail(declare(1, ['JR'], null));
    expectFail(declare(1, ['D3'], null));
  });

  it('turns the kitty when nobody declares', () => {
    const found = trumpSuitFromKitty(parseCards('H3 S5 C2 D9 HA HK SJ DJ'), '2');
    expect(found.suit).toBe('clubs');
    expect(found.revealed.map((card) => card.id)).toEqual(['H3-0', 'S5-0', 'C2-0']);

    const highest = trumpSuitFromKitty(parseCards('JR JB HK HA SA H3 C4 D5'), '7');
    expect(highest.suit).toBe('hearts');
    expect(highest.revealed).toHaveLength(8);

    const jokersFirst = trumpSuitFromKitty(parseCards('JR JB SA HK H3 C4 D5 S6'), '9');
    expect(jokersFirst.suit).toBe('spades');
  });

  it('keeps every card identity unique in a fresh deck', () => {
    expect(new Set(createDeck().map((card) => card.id)).size).toBe(108);
  });
});
