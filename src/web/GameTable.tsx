import { useEffect, useMemo, useRef, useState } from 'react';
import { chainIndex, determineTrickWinner, findPairs, isTrumpCard, legalDeclarations, longestPairRun, makeCard, playSuit, playableCardIds, sortHand, teamOf, type Card, type Seat, type Suit, type TrumpState } from '../engine/index.js';
import {
  HUMAN_SEAT,
  PHASE_NAME,
  SUIT_GLYPH,
  levelLabel,
  resultSummary,
  seatName,
  seatPlace,
  teamName,
} from './labels.js';
import { AudioControls } from './AudioControls.js';
import { PlayingCard } from './PlayingCard.js';
import { QUICK_MESSAGES, type LocalMatch } from './useLocalMatch.js';

export function GameTable({ game }: { game: LocalMatch }) {
  const { state, flashTrick, selected, error, notice, yourHand, view, declareClock, throwPreview, throwNote, bubble } = game;
  const trick = flashTrick?.plays ?? state.currentTrick;
  const liveWinner =
    !flashTrick && state.phase === 'playing' && state.currentLead && state.trump && state.currentTrick.length > 0
      ? determineTrickWinner(state.currentTrick, state.currentLead, state.trump)
      : null;
  const call = useCallBanner(state);
  const showRank = state.phase === 'dealing' || state.phase === 'making-trump';
  const markedSeat = flashTrick
    ? flashTrick.stage === 'review'
      ? null
      : flashTrick.winnerSeat
    : liveWinner;
  const [reversed, setReversed] = useState(false);
  const [reviewingLast, setReviewingLast] = useState(false);
  const lastTrick = state.trickHistory.at(-1) ?? null;
  const [goalBurst, setGoalBurst] = useState(false);
  const pointsSeen = useRef(state.opponentPoints);
  const sortedHand = sortHand(yourHand, state.trump);
  const orderedHand = reversed ? [...sortedHand].reverse() : sortedHand;
  const previewIds = new Set(throwPreview?.map((card) => card.id) ?? []);
  const shownHand = orderedHand.filter((card) => !previewIds.has(card.id));
  const playable = useMemo(() => {
    if (state.phase !== 'playing' || state.turnSeat !== HUMAN_SEAT || !state.trump) return null;
    return new Set(playableCardIds(yourHand, state.currentLead, state.trump));
  }, [state, yourHand]);
  const firstSelected = yourHand.find((card) => card.id === selected[0]);
  const leadLock =
    state.phase === 'playing' && !state.currentLead && state.trump && firstSelected
      ? playSuit(firstSelected, state.trump)
      : null;

  useEffect(() => {
    if (pointsSeen.current < 80 && state.opponentPoints >= 80) {
      setGoalBurst(true);
      const timer = window.setTimeout(() => setGoalBurst(false), 1400);
      pointsSeen.current = state.opponentPoints;
      return () => window.clearTimeout(timer);
    }
    pointsSeen.current = state.opponentPoints;
  }, [state.opponentPoints]);
  const declarations = legalDeclarations(yourHand, HUMAN_SEAT, state.trumpRank, state.declaration);
  const canPass = state.phase === 'making-trump' && state.turnSeat === HUMAN_SEAT;
  const canDiscard = state.phase === 'discard' && state.starterSeat === HUMAN_SEAT;
  const canPlay = state.phase === 'playing' && state.turnSeat === HUMAN_SEAT && !flashTrick;
  const yourTeam = teamOf(HUMAN_SEAT);
  const otherTeam = yourTeam === 'A' ? 'B' : 'A';

  return (
    <div className="table-shell">
      <header className="hud">
        <div className="brand">
          <strong>80分</strong>
          <span>拖拉机</span>
        </div>
        <TrumpBadge rank={state.trumpRank} trump={state.trump} />
        <div className="score-pills">
          <ScorePill
            label={teamName(yourTeam)}
            level={levelLabel(view.levelLabels[yourTeam])}
            points={pointsFor(yourTeam, state)}
            sitting={state.declarerTeam === yourTeam}
          />
          <ScorePill
            label={teamName(otherTeam)}
            level={levelLabel(view.levelLabels[otherTeam])}
            points={pointsFor(otherTeam, state)}
            sitting={state.declarerTeam === otherTeam}
          />
          <div className={`points-pill ${state.opponentPoints >= 80 ? 'is-goal' : ''}`}>
            <span>闲家</span>
            <b>{state.opponentPoints} / 80</b>
            {goalBurst && <em className="goal-burst">80 分</em>}
          </div>
        </div>
        <div className="phase-pill">{PHASE_NAME[state.phase]} · 第 {state.handNumber} 局</div>
        <button type="button" className="btn" onClick={game.newMatch}>
          新对局
        </button>
        <AudioControls />
      </header>

      <div className="felt">
        {([2, 3, 1] as Seat[]).map((seat) => (
          <OpponentSeat
            key={seat}
            seat={seat}
            count={state.players[seat]!.hand.length}
            active={isActive(state.turnSeat, seat, state.phase, flashTrick)}
            starter={state.starterSeat === seat}
            declarer={state.declarerTeam === teamOf(seat)}
            bubble={bubble?.seat === seat ? bubble.text : null}
            winning={markedSeat === seat}
            dealing={state.phase === 'dealing'}
          />
        ))}

        <div className="arena">
          <div className={`turn-banner ${state.turnSeat === HUMAN_SEAT ? 'is-you' : ''}`}>
            {turnText(state, declareClock)}
          </div>
          <div className={`trick ${flashTrick?.stage === 'collecting' ? 'is-collecting' : ''} ${flashTrick ? `is-to-${seatPlace(flashTrick.winnerSeat)}` : ''}`}>
            {([2, 3, 0, 1] as Seat[]).map((seat) => {
              const play = trick.find((item) => item.seat === seat);
              const preview = !play && throwPreview && seat === HUMAN_SEAT ? throwPreview : null;
              const cards = orderedForShow(play?.cards ?? preview, state.trump);
              const winning = markedSeat === seat && Boolean(cards.length);
              return (
                <div key={seat} className={`trick-slot is-${seatPlace(seat)} ${cards.length >= 4 ? 'is-many' : ''} ${winning ? 'is-winning' : ''}`}>
                  {cards.map((card, index) => (
                    <span key={card.id} className="trick-card" style={{ zIndex: index + 1 }}>
                      <PlayingCard
                        card={card}
                        compact
                        crowned={Boolean(state.trump && isTrumpCard(card, state.trump))}
                      />
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {(showRank || call) && (
          <div key={call?.title ?? 'rank'} className={`center-banner ${call ? 'is-call' : ''}`}>
            {call ? <strong>{call.title}</strong> : <strong>本局打 {state.trumpRank}</strong>}
          </div>
        )}
        {reviewingLast && lastTrick && (
          <div className="last-trick">
            <div className="last-trick-head">
              <strong>上一墩</strong>
              <button type="button" className="btn" onClick={() => setReviewingLast(false)}>
                关闭
              </button>
            </div>
            <div className="last-trick-grid">
              {([2, 3, 0, 1] as Seat[]).map((seat) => {
                const play = lastTrick.plays.find((item) => item.seat === seat);
                const cards = orderedForShow(play?.cards, state.trump);
                return (
                  <div key={seat} className={`last-trick-seat ${lastTrick.winnerSeat === seat ? 'is-winning' : ''}`}>
                    <span>{seatName(seat)}</span>
                    <div>
                      {cards.map((card) => (
                        <PlayingCard
                          key={card.id}
                          card={card}
                          compact
                          crowned={Boolean(state.trump && isTrumpCard(card, state.trump))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <section className="south">
          <div className={`seat-plate is-south ${isActive(state.turnSeat, HUMAN_SEAT, state.phase, flashTrick) ? 'is-turn' : ''} ${markedSeat === HUMAN_SEAT ? 'is-winning' : ''}`}>
            {bubble?.seat === HUMAN_SEAT && <span className="speech-bubble">{bubble.text}</span>}
            <strong>{seatName(HUMAN_SEAT)}</strong>
            <em>{teamName(yourTeam)}</em>
            <span>{levelLabel(view.levelLabels[yourTeam])}</span>
            <span>{state.starterSeat === HUMAN_SEAT ? '庄家' : state.declarerTeam === yourTeam ? '坐庄' : '闲家'}</span>
            <span>{sortedHand.length} 张</span>
          </div>
          <div className="play-hint">
            {(game.toast || throwNote) && <p className="throw-toast">{game.toast ?? '甩牌失败'}</p>}
            <p className="notice">{error ?? notice ?? promptFor(state, yourHand, flashTrick)}</p>
            {state.revealedKitty.length > 0 && (
              <div className="kitty-row">
                {state.revealedKitty.map((card) => (
                  <PlayingCard key={card.id} card={card} compact />
                ))}
              </div>
            )}
          </div>
          {(state.phase === 'dealing' || canPass) && (
            <DeclareBar
              declarations={declarations}
              countered={Boolean(state.declaration)}
              onSuit={game.declareSuit}
              onNoTrump={game.declareNoTrump}
            />
          )}
          <div
            className={`hand ${state.turnSeat === HUMAN_SEAT && state.phase === 'playing' && !flashTrick ? 'is-your-turn' : ''}`}
          >
            {shownHand.map((card, index) => {
              const wrongLead =
                leadLock !== null &&
                state.trump !== null &&
                !selected.includes(card.id) &&
                playSuit(card, state.trump) !== leadLock;
              const blocked = (playable !== null && !playable.has(card.id)) || wrongLead;
              return (
                <div key={card.id} className="hand-card" style={{ zIndex: index }}>
                  <PlayingCard
                    card={card}
                    selected={selected.includes(card.id)}
                    dimmed={blocked}
                    crowned={Boolean(state.trump && isTrumpCard(card, state.trump))}
                    onClick={blocked || throwPreview ? undefined : () => game.toggleCard(card.id)}
                  />
                </div>
              );
            })}
          </div>
          <button type="button" className="btn reverse-btn" onClick={() => setReversed((value) => !value)}>
            {reversed ? '→ 正序' : '↔ 反向'}
          </button>
          <div className="actions">
            {canPass && (
              <button type="button" className="btn" onClick={game.pass}>
                不亮
              </button>
            )}
            {canDiscard && (
              <button type="button" className="btn primary" onClick={game.discardSelected}>
                扣底 {selected.length}/8
              </button>
            )}
            {canPlay && (
              <button type="button" className="btn primary" onClick={game.playSelected}>
                出牌{selected.length ? ` ${selected.length}` : ''}
              </button>
            )}
            {(canPlay || canDiscard) && (
              <button type="button" className="btn" onClick={game.hint}>
                提示
              </button>
            )}
            {selected.length > 0 && (
              <button type="button" className="btn" onClick={game.clearSelection}>
                取消
              </button>
            )}
            <button type="button" className="btn" disabled={!lastTrick} onClick={() => setReviewingLast(true)}>
              上一墩
            </button>
          </div>
          <QuickChat onSend={game.say} />
        </section>
      </div>

      {(state.phase === 'scoring' || state.phase === 'game-over') && state.lastResult && (
        <div className="modal">
          <div className="modal-card">
            <h2>{state.phase === 'game-over' ? '对局结束' : '本局结束'}</h2>
            <p className="result-lead">{resultSummary(state.lastResult)}</p>
            <ul>
              <li>闲家得分 {state.lastResult.opponentPoints}</li>
              <li>墩内得分 {state.lastResult.trickPoints}</li>
              {state.lastResult.opponentsWonLastTrick && (
                <li>
                  底牌 {state.lastResult.discardPoints} 分 × {state.lastResult.talonMultiplier} = {state.lastResult.talonBonus}
                </li>
              )}
              <li>
                下局级牌 {state.lastResult.nextTrumpRank ?? '—'} · 庄家 {seatName(state.lastResult.nextStarterSeat)}
              </li>
            </ul>
            {view.discard && (
              <div className="kitty-row">
                {view.discard.map((card) => (
                  <PlayingCard key={card.id} card={card} compact />
                ))}
              </div>
            )}
            <div className="actions">
              {state.phase === 'scoring' ? (
                <button type="button" className="btn primary" onClick={game.continueMatch}>
                  下一局
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={game.newMatch}>
                  再来一局
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrumpBadge({
  rank,
  trump,
}: {
  rank: LocalMatch['state']['trumpRank'];
  trump: LocalMatch['state']['trump'];
}) {
  return (
    <div className={`trump-pill ${trump?.noTrump ? 'is-none' : ''}`}>
      <span>级牌</span>
      <b className="rank-chip">{rank}</b>
      {trump?.noTrump ? (
        <>
          <span>无主</span>
          <PlayingCard card={makeCard(null, null, 'red', 0)} mini />
          <PlayingCard card={makeCard(null, null, 'black', 0)} mini />
        </>
      ) : trump?.suit ? (
        <>
          <span>主</span>
          <PlayingCard card={makeCard(trump.suit, rank, null, 0)} mini />
        </>
      ) : (
        <span>未定主</span>
      )}
    </div>
  );
}

function DeclareBar({
  declarations,
  countered,
  onSuit,
  onNoTrump,
}: {
  declarations: ReturnType<typeof legalDeclarations>;
  countered: boolean;
  onSuit: (suit: Suit) => void;
  onNoTrump: () => void;
}) {
  const suits: Suit[] = ['spades', 'diamonds', 'clubs', 'hearts'];
  const noTrump = declarations.some((item) => item.noTrump);
  const live = declarations.length > 0;
  return (
    <div className={`declare-bar ${live ? 'is-live' : ''}`}>
      <span>{countered ? '反主' : '亮主'}</span>
      {suits.map((suit) => {
        const ready = declarations.some((item) => item.suit === suit);
        return (
          <button
            key={suit}
            type="button"
            className={`suit-btn is-${suit} ${ready ? 'is-ready' : ''}`}
            disabled={!ready}
            onClick={() => onSuit(suit)}
          >
            {SUIT_GLYPH[suit]}
          </button>
        );
      })}
      {noTrump && (
        <button type="button" className="suit-btn is-none is-ready" onClick={onNoTrump}>
          无主
        </button>
      )}
    </div>
  );
}

function ScorePill({
  label,
  level,
  points,
  sitting,
}: {
  label: string;
  level: string;
  points: number | null;
  sitting: boolean;
}) {
  return (
    <div className={`score-pill ${sitting ? 'is-banker' : ''}`}>
      <span>{label}{sitting ? ' 庄' : ''}</span>
      <b>级 {level}</b>
      <em>{points === null ? '得分 —' : `${points} / 80`}</em>
    </div>
  );
}

function pointsFor(team: 'A' | 'B', state: LocalMatch['state']): number | null {
  if (!state.declarerTeam) return null;
  return state.declarerTeam === team ? null : state.opponentPoints;
}

function turnText(state: LocalMatch['state'], clock: number | null): string {
  if (state.phase === 'dealing') return '发牌中';
  if (state.phase === 'making-trump' && state.turnSeat === HUMAN_SEAT) {
    return clock === null ? '轮到你亮主' : `轮到你反主 ${clock}`;
  }
  if (state.phase === 'making-trump') return `${seatName(state.turnSeat)} 正在亮主`;
  if (state.phase === 'discard') return state.starterSeat === HUMAN_SEAT ? '轮到你扣底' : `${seatName(state.starterSeat ?? 0)} 正在扣底`;
  if (state.phase === 'playing') return state.turnSeat === HUMAN_SEAT ? '轮到你' : `${seatName(state.turnSeat)}的回合`;
  return '';
}

function OpponentSeat({
  seat,
  count,
  active,
  starter,
  declarer,
  bubble,
  winning,
  dealing,
}: {
  seat: Seat;
  count: number;
  active: boolean;
  starter: boolean;
  declarer: boolean;
  bubble: string | null;
  winning: boolean;
  dealing: boolean;
}) {
  const place = seatPlace(seat);
  return (
    <div className={`opp is-${place} ${active ? 'is-turn' : ''}`}>
      <div className={`seat-plate ${active ? 'is-turn' : ''} ${winning ? 'is-winning' : ''}`}>
        {bubble && <span className="speech-bubble">{bubble}</span>}
        <strong>{seatName(seat)}</strong>
        <em>{teamName(teamOf(seat))}</em>
        <span>{starter ? '庄家' : declarer ? '坐庄' : '闲家'}</span>
        <span>{count} 张</span>
      </div>
      <div className={`opp-hand is-${place}`}>
        {Array.from({ length: Math.min(count, 8) }, (_, index) => (
          <PlayingCard key={`${seat}-${index}`} faceDown compact deal={dealing} />
        ))}
      </div>
    </div>
  );
}

function QuickChat({ onSend }: { onSend: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="quick-chat">
      <button type="button" className="btn" onClick={() => setOpen((value) => !value)} aria-label="快捷消息">
        💬
      </button>
      {open && (
        <div className="quick-list">
          {QUICK_MESSAGES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => {
                onSend(text);
                setOpen(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useCallBanner(state: LocalMatch['state']): { kicker: string; title: string; detail: string } | null {
  const previous = useRef<string | null>(null);
  const [banner, setBanner] = useState<{ kicker: string; title: string; detail: string } | null>(null);
  const key = state.declaration
    ? `${state.declaration.seat}:${state.declaration.noTrump}:${state.declaration.suit ?? ''}:${state.declaration.cardIds.join()}`
    : '';

  useEffect(() => {
    if (!key || !state.declaration) {
      previous.current = null;
      setBanner(null);
      return;
    }
    if (previous.current === key) return;
    const countered = previous.current !== null;
    previous.current = key;
    const who = seatName(state.declaration.seat);
    const glyph = state.declaration.suit ? SUIT_GLYPH[state.declaration.suit] : '';
    const title = state.declaration.noTrump
      ? `${who} 亮无主`
      : `${who} ${countered ? '反主' : '亮主'} ${glyph}`;
    setBanner({ kicker: who, title, detail: `级牌 ${state.trumpRank}` });
    const timer = window.setTimeout(() => setBanner(null), 2600);
    return () => window.clearTimeout(timer);
    // The key already contains the declaration. Re-running on every state object would cancel the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return banner;
}

function orderedForShow(cards: readonly Card[] | null | undefined, trump: TrumpState | null): Card[] {
  if (!cards || cards.length === 0) return [];
  const copy = [...cards];
  if (!trump) return copy;
  return copy.sort((a, b) => chainIndex(a, trump) - chainIndex(b, trump) || a.id.localeCompare(b.id));
}

function isActive(turn: Seat, seat: Seat, phase: LocalMatch['state']['phase'], flashTrick: LocalMatch['flashTrick']): boolean {
  if (flashTrick) return false;
  if (phase === 'dealing' || phase === 'scoring' || phase === 'game-over' || phase === 'redeal') return false;
  return turn === seat;
}

function promptFor(state: LocalMatch['state'], hand: readonly Card[], flashTrick: LocalMatch['flashTrick']): string {
  if (flashTrick?.stage === 'review') return '这一墩结束';
  if (flashTrick) return `${seatName(flashTrick.winnerSeat)} 赢得这一墩`;
  if (state.phase === 'dealing') return '抽到级牌可以亮主：单张定花色，对子可反主，对王为无主';
  if (state.phase === 'making-trump' && state.turnSeat === HUMAN_SEAT) return '可以反主，也可以不亮';
  if (state.phase === 'making-trump') return `${seatName(state.turnSeat)} 正在决定是否亮主`;
  if (state.phase === 'discard' && state.starterSeat === HUMAN_SEAT) return '选 8 张扣底。5 / 10 / K 被闲家抠底会加倍';
  if (state.phase === 'discard') return `${seatName(state.starterSeat ?? 0)} 正在扣底`;
  if (state.phase === 'playing' && state.turnSeat === HUMAN_SEAT && state.trump) {
    if (!state.currentLead) return '轮到你出牌：单张、对子、拖拉机或甩牌';
    return followPrompt(hand, state.currentLead, state.trump);
  }
  if (state.phase === 'playing') return `等待 ${seatName(state.turnSeat)} 出牌`;
  return '';
}

function followPrompt(
  hand: readonly Card[],
  lead: NonNullable<LocalMatch['state']['currentLead']>,
  trump: NonNullable<LocalMatch['state']['trump']>,
): string {
  const suitCards = hand.filter((card) => playSuit(card, trump) === lead.playSuit);
  const suitName = lead.playSuit === 'trump' ? '主' : '这门花色';
  if (suitCards.length === 0) return `没有${suitName}，可以垫牌`;
  if (suitCards.length < lead.cards.length) return `${suitName}不够，先出完再垫牌`;
  const pairs = findPairs(suitCards, trump);
  if (lead.kind === 'tractor') {
    const run = longestPairRun(pairs.map((pair) => pair.index));
    if (run >= 2) return '请按拖拉机跟牌';
    if (pairs.length > 0) return '没有拖拉机，请尽量出对子';
    return `没有对子，跟 ${lead.cards.length} 张${suitName}`;
  }
  if (lead.pairCount > 0) {
    if (pairs.length === 0) return `没有对子，请跟 ${lead.cards.length} 张${suitName}`;
    return '请跟对子';
  }
  if (lead.cards.length === 1) return `请跟一张${suitName}`;
  return `请跟 ${lead.cards.length} 张${suitName}`;
}

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="start">
      <div className="start-card">
        <p className="eyebrow">Sheng Ji / Tractor</p>
        <h1>八十 分</h1>
        <p className="start-sub">拖拉机 · 四人两副牌</p>
        <ul>
          <li>你坐南方，对家是队友</li>
          <li>另外三席由电脑补位</li>
          <li>规则按 Pagat 80 分：亮主、拖拉机、甩牌、抠底加倍</li>
        </ul>
        <button type="button" className="btn primary large" onClick={onStart}>
          开始对局
        </button>
      </div>
    </div>
  );
}

