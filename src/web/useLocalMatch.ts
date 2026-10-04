import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FOLLOW_ADJUSTED_MESSAGE,
  THROW_FAILED_MESSAGE,
  applyAiAction,
  buildLegalPlay,
  chooseDiscard,
  createMatch,
  legalDeclarations,
  dealNext,
  declareTrump,
  discardCards,
  maybeAiDeclare,
  passDeclare,
  playCards,
  projectMatch,
  redeal,
  resolveOpeningLead,
  samePlaySuit,
  startNextHand,
  teamOf,
  type Card,
  type MatchState,
  type Seat,
  type Suit,
  type TrickPlay,
} from '../engine/index.js';

export interface ShownTrick {
  plays: TrickPlay[];
  winnerSeat: Seat;
  stage: 'review' | 'announced' | 'collecting';
}
import { audio } from './audio/AudioManager.js';
import { HUMAN_SEAT } from './labels.js';

/** 每墩结束后，牌留在桌面上、开始收走之前的时间（毫秒）。只改这个数字即可。 */
const TRICK_DISPLAY_DURATION = 1500;

export const QUICK_MESSAGES = [
  '配合得真好！',
  '打得漂亮！',
  '这波不错！',
  '谢谢！',
  '哈哈哈',
  '稳住',
  '失误了 😭',
  '好牌！',
  '再来一把？',
  'GG',
] as const;

export interface SeatBubble {
  seat: Seat;
  text: string;
  id: number;
}

export interface LocalMatch {
  state: MatchState;
  flashTrick: ShownTrick | null;
  declareClock: number | null;
  selected: string[];
  error: string | null;
  notice: string | null;
  toast: string | null;
  throwPreview: Card[] | null;
  throwNote: boolean;
  bubble: SeatBubble | null;
  yourHand: Card[];
  view: ReturnType<typeof projectMatch>;
  toggleCard: (cardId: string) => void;
  clearSelection: () => void;
  playSelected: () => void;
  hint: () => void;
  declareSuit: (suit: Suit) => void;
  declareNoTrump: () => void;
  pass: () => void;
  discardSelected: () => void;
  continueMatch: () => void;
  newMatch: () => void;
  say: (text: string) => void;
}

function newState(): MatchState {
  return createMatch();
}

function cueAudio(prev: MatchState, next: MatchState): void {
  const played =
    next.phase === 'playing' &&
    (next.currentTrick.length !== prev.currentTrick.length || next.trickHistory.length !== prev.trickHistory.length);
  if (played) audio.playSfx('card-play');
  if (next.trickHistory.length > prev.trickHistory.length) audio.playSfx('trick-win');
  if ((next.phase === 'scoring' || next.phase === 'game-over') && prev.phase === 'playing' && next.lastResult) {
    if (next.lastResult.levelsGained > 0) audio.playSfx('level-up');
    if (next.phase === 'game-over') {
      audio.playSfx(next.lastResult.winner === teamOf(HUMAN_SEAT) ? 'victory' : 'defeat');
    }
  }
}

function receiverOf(state: MatchState): Seat {
  return ((state.openingSeat + state.dealIndex - 1 + 4) % 4) as Seat;
}

function unwrap(result: { ok: true; value: MatchState } | { ok: false; error: string }): MatchState {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function useLocalMatch(): LocalMatch {
  const [state, setState] = useState<MatchState>(() => newState());
  const [flashTrick, setFlashTrick] = useState<ShownTrick | null>(null);
  const [declareClock, setDeclareClock] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [throwPreview, setThrowPreview] = useState<Card[] | null>(null);
  const [throwNote, setThrowNote] = useState(false);
  const [bubble, setBubble] = useState<SeatBubble | null>(null);
  const stateRef = useRef(state);
  const previewGen = useRef(0);
  stateRef.current = state;

  const yourHand = state.players[HUMAN_SEAT]!.hand;
  const view = useMemo(() => projectMatch(state, HUMAN_SEAT), [state]);

  const sayFrom = useCallback((seat: Seat, text: string) => {
    const id = Date.now();
    setBubble({ seat, text, id });
    window.setTimeout(() => {
      setBubble((current) => (current?.id === id ? null : current));
    }, 2500);
  }, []);

  const say = useCallback((text: string) => sayFrom(HUMAN_SEAT, text), [sayFrom]);

  const apply = useCallback((next: MatchState, message?: string | null) => {
    const prev = stateRef.current;
    cueAudio(prev, next);
    if (
      (next.announcement === THROW_FAILED_MESSAGE || next.announcement === FOLLOW_ADJUSTED_MESSAGE) &&
      next.announcement !== prev.announcement
    ) {
      const text = next.announcement;
      setToast(text);
      window.setTimeout(() => setToast((current) => (current === text ? null : current)), 1600);
    }
    setState(next);
    setSelected((current) => current.filter((id) => next.players[HUMAN_SEAT]!.hand.some((card) => card.id === id)));
    setError(null);
    if (message !== undefined) setNotice(message);
    else if (next.phase === 'playing') setNotice(null);
  }, []);

  const flashKey = flashTrick ? `${flashTrick.winnerSeat}:${flashTrick.plays.map((play) => play.cards.map((card) => card.id).join('+')).join('|')}` : '';

  useEffect(() => {
    if (!flashKey) return;
    const announced = window.setTimeout(() => {
      setFlashTrick((current) => (current && current.stage === 'review' ? { ...current, stage: 'announced' } : current));
    }, Math.round(TRICK_DISPLAY_DURATION * 0.7));
    const collect = window.setTimeout(() => {
      setFlashTrick((current) => (current ? { ...current, stage: 'collecting' } : null));
    }, TRICK_DISPLAY_DURATION);
    const clear = window.setTimeout(() => setFlashTrick(null), TRICK_DISPLAY_DURATION + 450);
    return () => {
      window.clearTimeout(announced);
      window.clearTimeout(collect);
      window.clearTimeout(clear);
    };
  }, [flashKey]);

  useEffect(() => {
    if (state.phase !== 'making-trump' || state.turnSeat !== HUMAN_SEAT) {
      setDeclareClock(null);
      return;
    }
    const started = Date.now();
    setDeclareClock(10);
    const timer = window.setInterval(() => {
      const left = 10 - Math.floor((Date.now() - started) / 1000);
      if (left > 0) {
        setDeclareClock(left);
        return;
      }
      window.clearInterval(timer);
      setDeclareClock(0);
      const current = stateRef.current;
      if (current.phase === 'making-trump' && current.turnSeat === HUMAN_SEAT) {
        apply(unwrap(passDeclare(current, HUMAN_SEAT)), '反主时间到，继续');
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [apply, state.declaration, state.phase, state.turnSeat]);

  useEffect(() => {
    if (flashTrick) return;
    let cancelled = false;
    const delay =
      state.phase === 'dealing' ? 100 :
      state.phase === 'redeal' ? 700 :
      state.phase === 'making-trump' ? 420 :
      state.phase === 'discard' ? 550 :
      520;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (state.phase === 'dealing') {
        const dealt = dealNext(state);
        if (!dealt.ok) return;
        let next = dealt.value;
        const seat = receiverOf(next);
        if (seat !== HUMAN_SEAT) next = maybeAiDeclare(next, seat);
        const noticeText =
          next.declaration && next.declaration.cardIds.join() !== state.declaration?.cardIds.join()
            ? next.declaration.noTrump
              ? '有人亮了无主'
              : '有人亮了主'
            : undefined;
        apply(next, noticeText);
        return;
      }
      if (state.phase === 'redeal') {
        apply(unwrap(redeal(state)), '第一局无人亮主，重新发牌');
        return;
      }
      if (state.phase === 'making-trump' && state.turnSeat !== HUMAN_SEAT) {
        apply(unwrap(applyAiAction(state, state.turnSeat)));
        return;
      }
      if (state.phase === 'discard' && state.starterSeat !== null && state.starterSeat !== HUMAN_SEAT) {
        apply(unwrap(applyAiAction(state, state.starterSeat)), '庄家正在扣底');
        return;
      }
      if (state.phase === 'playing' && state.turnSeat !== HUMAN_SEAT) {
        const result = applyAiAction(state, state.turnSeat);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        noteTrick(state, result.value);
        apply(result.value, null);
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apply, flashTrick, state]);

  const toggleCard = useCallback((cardId: string) => {
    setError(null);
    setSelected((current) => (current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]));
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  const selectedCards = useMemo(
    () => selected.map((id) => yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)),
    [selected, yourHand],
  );

  const playSelected = useCallback(() => {
    if (throwPreview) return;
    if (state.phase !== 'playing' || state.turnSeat !== HUMAN_SEAT || !state.trump) return;
    if (selectedCards.length === 0) {
      setError('先点出手牌');
      return;
    }
    if (state.currentTrick.length === 0 && selectedCards.length > 1) {
      if (!samePlaySuit(selectedCards, state.trump)) {
        const rejected = playCards(state, HUMAN_SEAT, selected);
        if (!rejected.ok) setError(rejected.error);
        return;
      }
      const otherHands = ([1, 2, 3] as Seat[]).map((seat) => state.players[seat]!.hand);
      const resolved = resolveOpeningLead(selectedCards, yourHand, state.trump, otherHands);
      if (resolved.degraded) {
        const ids = [...selected];
        const gen = previewGen.current + 1;
        previewGen.current = gen;
        setThrowPreview(selectedCards);
        setThrowNote(false);
        window.setTimeout(() => {
          if (previewGen.current !== gen) return;
          setThrowNote(true);
          window.setTimeout(() => {
            if (previewGen.current !== gen) return;
            const current = stateRef.current;
            const result = playCards(current, HUMAN_SEAT, ids);
            setThrowPreview(null);
            setThrowNote(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            noteTrick(current, result.value);
            apply(result.value);
            setSelected([]);
          }, 450);
        }, 1000);
        return;
      }
    }
    const result = playCards(state, HUMAN_SEAT, selected);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    noteTrick(state, result.value);
    apply(result.value);
    setSelected([]);
  }, [apply, selected, selectedCards, state, throwPreview, yourHand]);

  const hint = useCallback(() => {
    if (state.phase === 'playing' && state.turnSeat === HUMAN_SEAT && state.trump) {
      const play = buildLegalPlay(yourHand, state.currentTrick.length === 0 ? null : state.currentLead, state.trump);
      setSelected(play.map((card) => card.id));
      setError(null);
      return;
    }
    if (state.phase === 'discard' && state.starterSeat === HUMAN_SEAT && state.trump) {
      setSelected(chooseDiscard(yourHand, state.trump).map((card) => card.id));
      setError(null);
    }
  }, [state, yourHand]);

  const declareSuit = useCallback((suit: Suit) => {
    if (state.phase !== 'dealing' && !(state.phase === 'making-trump' && state.turnSeat === HUMAN_SEAT)) return;
    const options = legalDeclarations(yourHand, HUMAN_SEAT, state.trumpRank, state.declaration).filter(
      (option) => option.suit === suit,
    );
    const chosen = options.find((option) => option.kind === 'pair') ?? options.find((option) => option.kind === 'single');
    if (!chosen) {
      setError('这门花色现在不能亮');
      return;
    }
    const result = declareTrump(state, HUMAN_SEAT, chosen.cardIds);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(result.value, `你亮了${suit === 'hearts' || suit === 'diamonds' ? '红' : '黑'}主`);
  }, [apply, state, yourHand]);

  const declareNoTrump = useCallback(() => {
    if (state.phase !== 'dealing' && !(state.phase === 'making-trump' && state.turnSeat === HUMAN_SEAT)) return;
    const chosen = legalDeclarations(yourHand, HUMAN_SEAT, state.trumpRank, state.declaration).find(
      (option) => option.kind === 'joker-pair',
    );
    if (!chosen) {
      setError('现在不能亮无主');
      return;
    }
    const result = declareTrump(state, HUMAN_SEAT, chosen.cardIds);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(result.value, '你亮了无主');
  }, [apply, state, yourHand]);

  const pass = useCallback(() => {
    if (state.phase !== 'making-trump' || state.turnSeat !== HUMAN_SEAT) return;
    apply(unwrap(passDeclare(state, HUMAN_SEAT)));
    setSelected([]);
  }, [apply, state]);

  const discardSelected = useCallback(() => {
    if (state.phase !== 'discard' || state.starterSeat !== HUMAN_SEAT) return;
    const result = discardCards(state, HUMAN_SEAT, selected);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(result.value);
    setSelected([]);
  }, [apply, selected, state]);

  const continueMatch = useCallback(() => {
    if (state.phase !== 'scoring') return;
    apply(unwrap(startNextHand(state)));
    setFlashTrick(null);
  }, [apply, state]);

  const newMatch = useCallback(() => {
    previewGen.current += 1;
    setThrowPreview(null);
    setThrowNote(false);
    apply(newState(), null);
    setFlashTrick(null);
    setSelected([]);
  }, [apply]);

  const noteTrick = (prev: MatchState, next: MatchState) => {
    if (next.currentTrick.length !== 0 || prev.currentTrick.length !== 3) return;
    const completed = next.trickHistory.at(-1);
    if (!completed) return;
    setFlashTrick({ plays: completed.plays, winnerSeat: completed.winnerSeat, stage: 'review' });
    if (Math.random() > 0.22) return;
    const speaker = completed.winnerSeat === HUMAN_SEAT ? ((HUMAN_SEAT + 2) % 4) as Seat : completed.winnerSeat;
    const pool = completed.winnerSeat === HUMAN_SEAT
      ? ['配合得真好！', '这波不错！', '好牌！']
      : ['打得漂亮！', '稳住', '哈哈哈', '好牌！'];
    sayFrom(speaker, pool[Math.floor(Math.random() * pool.length)]!);
  };

  return {
    state,
    flashTrick,
    declareClock,
    selected,
    error,
    notice,
    toast,
    throwPreview,
    throwNote,
    bubble,
    yourHand,
    view,
    toggleCard,
    clearSelection,
    playSelected,
    hint,
    declareSuit,
    declareNoTrump,
    pass,
    discardSelected,
    continueMatch,
    newMatch,
    say,
  };
}
