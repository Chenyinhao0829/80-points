import { describe, expect, it } from 'vitest';
import {
  THROW_FAILED_MESSAGE,
  cardFromCode,
  chainIndex,
  createDeck,
  createMatch,
  dealNext,
  declareTrump,
  discardCards,
  passDeclare,
  playCards,
  classifyLead,
  resolveOpeningLead,
  weakestCard,
  type Card,
  type MatchState,
  type TrumpState,
} from '../src/engine/index.js';
import { parseCards } from '../src/engine/index.js';
import { expectFail, unwrap } from './helpers.js';

const clubsSeven: TrumpState = { rank: '7', suit: 'clubs', noTrump: false };
const clubsTwo: TrumpState = { rank: '2', suit: 'clubs', noTrump: false };

function dealAll(state: MatchState): MatchState {
  let next = state;
  while (next.phase === 'dealing') next = unwrap(dealNext(next));
  return next;
}

function passWindow(state: MatchState): MatchState {
  let next = state;
  let guard = 0;
  while (next.phase === 'making-trump' && guard < 8) {
    next = unwrap(passDeclare(next, next.turnSeat));
    guard += 1;
  }
  return next;
}

function deckWith(placements: [number, string][]): Card[] {
  const placed = new Map(placements.map(([index, code]) => [index, cardFromCode(code)]));
  const used = new Set([...placed.values()].map((card) => card.id));
  const rest = createDeck().filter((card) => !used.has(card.id));
  const deck: Card[] = [];
  let cursor = 0;
  for (let index = 0; index < 108; index += 1) {
    deck.push(placed.get(index) ?? rest[cursor++]!);
  }
  return deck;
}

describe('throw validation', () => {
  it('keeps a legal single, pair, tractor, and top-card set as themselves', () => {
    const hand = parseCards('HA HA#1 HK H8 H8#1 H9 H9#1');
    const single = resolveOpeningLead(parseCards('H3'), parseCards('H3'), clubsSeven, []);
    const pair = resolveOpeningLead(parseCards('H8 H8#1'), hand, clubsSeven, [parseCards('HA')]);
    const tractor = resolveOpeningLead(parseCards('H8 H8#1 H9 H9#1'), hand, clubsSeven, [parseCards('HA')]);
    const top = resolveOpeningLead(parseCards('HA HA#1 HK'), hand, clubsSeven, []);

    expect(single).toMatchObject({ degraded: false, lead: { kind: 'single' } });
    expect(pair).toMatchObject({ degraded: false, lead: { kind: 'pair' } });
    expect(pair.cards.map((card) => card.id)).toEqual(['H8-0', 'H8-1']);
    expect(tractor).toMatchObject({ degraded: false, lead: { kind: 'tractor' } });
    expect(tractor.cards).toHaveLength(4);
    expect(top).toMatchObject({ degraded: false, lead: { kind: 'top-set' } });
    expect(top.cards).toHaveLength(3);
  });

  it('does not let a pair or a tractor fall through into a top-card set', () => {
    const pair = resolveOpeningLead(parseCards('HA HA#1'), parseCards('HA HA#1'), clubsSeven, []);
    const tractor = resolveOpeningLead(parseCards('H8 H8#1 H9 H9#1'), parseCards('H8 H8#1 H9 H9#1'), clubsSeven, []);
    expect(pair.lead.kind).toBe('pair');
    expect(tractor.lead.kind).toBe('tractor');
  });

  it('plays the weakest card of that suit when a throw can be beaten', () => {
    const hand = parseCards('HA HK H3 H5 S9');
    const resolved = resolveOpeningLead(parseCards('HA HK'), hand, clubsTwo, [parseCards('HA#1')]);
    expect(resolved.degraded).toBe(true);
    expect(resolved.lead.kind).toBe('single');
    expect(resolved.cards.map((card) => card.id)).toEqual(['HK-0']);
    expect(chainIndex(resolved.cards[0]!, clubsTwo)).toBeLessThan(chainIndex(cardFromCode('HA'), clubsTwo));
  });

  it('ranks a failed trump throw by the trump chain, not by face value', () => {
    const hand = parseCards('C2 CA H7 C7 JB JR');
    const order = [...hand].sort((a, b) => chainIndex(a, clubsSeven) - chainIndex(b, clubsSeven));
    expect(order.map((card) => card.id)).toEqual(['C2-0', 'CA-0', 'H7-0', 'C7-0', 'JB-0', 'JR-0']);
    expect(weakestCard(hand, clubsSeven).id).toBe('C2-0');

    const resolved = resolveOpeningLead(parseCards('CA H7'), hand, clubsSeven, [parseCards('C7#1')]);
    expect(resolved.degraded).toBe(true);
    expect(resolved.lead.kind).toBe('single');
    expect(resolved.lead.playSuit).toBe('trump');
    expect(resolved.cards.map((card) => card.id)).toEqual(['CA-0']);
  });

  it('rejects a lead that mixes two play suits', () => {
    const classified = classifyLead(parseCards('HA SK'), clubsSeven, []);
    expect(classified.ok).toBe(false);

    let state = createMatch({
      openingSeat: 0,
      deck: deckWith([
        [0, 'C2'],
        [4, 'HA'],
        [8, 'SK'],
      ]),
    });
    state = unwrap(dealNext(state));
    const shown = state.players[0]!.hand.find((card) => card.id === 'C2-0');
    expect(shown).toBeTruthy();
    state = unwrap(declareTrump(state, 0, [shown!.id]));
    state = passWindow(dealAll(state));
    const keep = new Set(['HA-0', 'SK-0']);
    const buried = state.players[0]!.hand.filter((card) => !keep.has(card.id)).slice(0, 8);
    state = unwrap(discardCards(state, 0, buried.map((card) => card.id)));
    expect(state.phase).toBe('playing');

    expectFail(playCards(state, 0, ['HA-0', 'SK-0']));
    expect(state.currentTrick).toHaveLength(0);
    expect(state.turnSeat).toBe(0);
    expect(state.players[0]!.hand.some((card) => card.id === 'HA-0')).toBe(true);
    expect(state.players[0]!.hand.some((card) => card.id === 'SK-0')).toBe(true);
  });

  it('plays the weakest card in hand when the required suit is missing', () => {
    const hand = parseCards('S4 C2 JR');
    const resolved = resolveOpeningLead(parseCards('HA HK'), hand, clubsSeven, [parseCards('HA#1')]);
    expect(resolved.degraded).toBe(true);
    expect(resolved.cards.map((card) => card.id)).toEqual(['HK-0']);
  });

  it('commits a failed throw in the match so the turn cannot stall', () => {
    let state = createMatch({
      openingSeat: 0,
      deck: deckWith([
        [0, 'C2'],
        [4, 'HA'],
        [8, 'HK'],
        [12, 'H3'],
        [1, 'HA#1'],
      ]),
    });
    state = unwrap(dealNext(state));
    const shown = state.players[0]!.hand.find((card) => card.id === 'C2-0');
    expect(shown).toBeTruthy();
    state = unwrap(declareTrump(state, 0, [shown!.id]));
    state = passWindow(dealAll(state));
    expect(state.phase).toBe('discard');
    expect(state.trump?.suit).toBe('clubs');

    const keep = new Set(['HA-0', 'HK-0', 'H3-0']);
    const buried = state.players[0]!.hand.filter((card) => !keep.has(card.id)).slice(0, 8);
    state = unwrap(discardCards(state, 0, buried.map((card) => card.id)));
    expect(state.phase).toBe('playing');
    expect(state.turnSeat).toBe(0);

    const played = unwrap(playCards(state, 0, ['HA-0', 'HK-0']));
    expect(played.announcement).toBe(THROW_FAILED_MESSAGE);
    expect(played.currentLead?.kind).toBe('single');
    expect(played.currentTrick[0]?.cards.map((card) => card.id)).toEqual(['HK-0']);
    expect(played.turnSeat).toBe(1);
    expect(played.players[0]!.hand.some((card) => card.id === 'HA-0')).toBe(true);
    expect(played.players[0]!.hand.some((card) => card.id === 'HK-0')).toBe(false);
    expect(played.players[0]!.hand.some((card) => card.id === 'H3-0')).toBe(true);
  });
});
