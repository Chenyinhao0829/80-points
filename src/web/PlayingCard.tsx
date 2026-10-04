import type { KeyboardEvent } from 'react';
import type { Card, Rank, Suit } from '../engine/index.js';
import { cardCaption } from './labels.js';

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  deal?: boolean;
  mini?: boolean;
  crowned?: boolean;
  onClick?: () => void;
}

export function PlayingCard({
  card,
  faceDown = false,
  selected = false,
  dimmed = false,
  compact = false,
  deal = false,
  mini = false,
  crowned = false,
  onClick,
}: PlayingCardProps) {
  const red = card ? isRed(card) : false;
  const classes = [
    'card',
    faceDown || !card ? 'is-back' : '',
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    compact ? 'is-compact' : '',
    deal ? 'is-deal' : '',
    mini ? 'is-mini' : '',
    red ? 'is-red' : 'is-black',
    card?.joker ? `is-joker is-joker-${card.joker}` : '',
    card && isCourt(card) ? 'is-court' : '',
    crowned ? 'is-crowned' : '',
    onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={classes}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={card ? cardCaption(card) : '牌背'}
    >
      {faceDown || !card ? <CardBack /> : <CardFace card={card} crowned={crowned} />}
    </div>
  );
}

function CardFace({ card, crowned }: { card: Card; crowned: boolean }) {
  if (card.joker) return <JokerFace color={card.joker} crowned={crowned} />;
  return (
    <span className="card-face">
      <Corner card={card} />
      {isCourt(card) ? <CourtArt rank={card.rank!} /> : <PipArt rank={card.rank!} suit={card.suit!} />}
      <Corner card={card} bottom />
      {crowned && <CrownMark />}
    </span>
  );
}

function Corner({ card, bottom = false }: { card: Card; bottom?: boolean }) {
  return (
    <span className={`card-corner ${bottom ? 'is-bottom' : ''}`}>
      <b>{card.rank}</b>
      <SuitIcon suit={card.suit!} />
    </span>
  );
}

function PipArt({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <span className="pip-field">
      <b className="pip-watermark">{rank}</b>
      <SuitIcon suit={suit} />
    </span>
  );
}

function CourtArt({ rank }: { rank: Rank }) {
  return (
    <span className="court">
      <svg viewBox="0 0 80 108" aria-hidden="true">
        <rect x="14" y="18" width="52" height="72" rx="6" className="court-frame" />
        {rank === 'K' && <King />}
        {rank === 'Q' && <Queen />}
        {rank === 'J' && <Jack />}
      </svg>
    </span>
  );
}

function King() {
  return (
    <g className="court-ink">
      <path d="M24 40 L28 28 L34 36 L40 22 L46 36 L52 28 L56 40 Z" className="court-gold" />
      <circle cx="40" cy="52" r="10" />
      <path d="M32 50 h4 M44 50 h4" />
      <path d="M34 56 Q40 60 46 56" />
      <path d="M30 62 Q40 70 50 62" />
      <path d="M26 78 Q40 70 54 78 L52 86 L28 86 Z" />
    </g>
  );
}

function Queen() {
  return (
    <g className="court-ink">
      <path d="M28 34 Q40 24 52 34" className="court-gold" />
      <circle cx="32" cy="30" r="2" className="court-gold" />
      <circle cx="40" cy="26" r="2" className="court-gold" />
      <circle cx="48" cy="30" r="2" className="court-gold" />
      <path d="M22 48 Q28 28 40 36 Q52 28 58 48" />
      <circle cx="40" cy="52" r="9" />
      <path d="M33 50 h3 M44 50 h3" />
      <path d="M35 56 Q40 59 45 56" />
      <path d="M24 84 Q40 68 56 84" />
    </g>
  );
}

function Jack() {
  return (
    <g className="court-ink">
      <path d="M26 36 Q40 28 48 38 L52 30 L56 42 L30 42 Z" className="court-gold" />
      <circle cx="38" cy="52" r="9" />
      <path d="M32 50 h3 M42 50 h3" />
      <path d="M34 56 Q38 59 43 55" />
      <path d="M28 70 L48 64 L52 86 L24 86 Z" />
    </g>
  );
}

function JokerFace({ color, crowned }: { color: 'red' | 'black'; crowned: boolean }) {
  const red = color === 'red';
  return (
    <span className="card-face joker-face">
      <svg viewBox="0 0 80 112" aria-hidden="true">
        <path d="M18 30 L26 16 L32 26 L40 10 L48 26 L54 16 L62 30 Z" className="joker-crown" />
        <circle cx="28" cy="16" r="2.2" className="joker-bell" />
        <circle cx="52" cy="16" r="2.2" className="joker-bell" />
        <path d="M22 34 Q16 48 24 58 Q30 42 40 46 Q50 42 56 58 Q64 48 58 34 Z" className="joker-hat" />
        <circle cx="40" cy="62" r="11" className="joker-face-disc" />
        <path d="M34 60 h3 M45 60 h3" className="joker-ink" />
        <path d="M35 67 Q40 71 45 67" className="joker-ink" />
        <path d="M24 78 Q40 70 56 78 L54 90 L26 90 Z" className="joker-ink" />
        {red ? (
          <path d="M40 34 L42 39 L47 39 L43 42 L45 47 L40 44 L35 47 L37 42 L33 39 L38 39 Z" className="joker-star" />
        ) : (
          <path d="M58 44 A6 6 0 1 0 58 56 A4 4 0 1 1 58 44 Z" className="joker-star" />
        )}
        <text x="40" y="104" textAnchor="middle" className="joker-title">
          {red ? '大王' : '小王'}
        </text>
      </svg>
      {crowned && <CrownMark />}
    </span>
  );
}

function CardBack() {
  return (
    <span className="card-back">
      <svg viewBox="0 0 80 112" aria-hidden="true">
        <rect x="4" y="4" width="72" height="104" rx="8" className="back-outer" />
        <rect x="9" y="9" width="62" height="94" rx="6" className="back-inner" />
        <path d="M16 28 Q28 16 40 26 Q52 16 64 28 Q54 36 40 32 Q26 36 16 28 Z" className="back-cloud" />
        <path d="M16 84 Q28 96 40 86 Q52 96 64 84 Q54 76 40 80 Q26 76 16 84 Z" className="back-cloud" />
        <circle cx="40" cy="56" r="16" className="back-seal" />
        <text x="40" y="54" textAnchor="middle" className="back-mark">
          80
        </text>
        <text x="40" y="66" textAnchor="middle" className="back-sub">
          拖拉机
        </text>
      </svg>
    </span>
  );
}

function CrownMark() {
  return (
    <svg className="trump-crown" viewBox="0 0 16 12" aria-hidden="true">
      <path d="M1.2 10.2 L2.2 4.2 L5.2 7.2 L8 1.4 L10.8 7.2 L13.8 4.2 L14.8 10.2 Z" />
    </svg>
  );
}

function SuitIcon({ suit }: { suit: Suit }) {
  return (
    <svg viewBox="0 0 40 40" className="suit-icon" aria-hidden="true">
      {suit === 'spades' && (
        <path d="M20 2 C20 2 6 16 7 24 C8 29 13 31 17 29 C15 33 13 37 13 37 H27 C27 37 25 33 23 29 C27 31 32 29 33 24 C34 16 20 2 20 2 Z M18.2 37 H21.8 L20.6 32.5 H19.4 Z" />
      )}
      {suit === 'hearts' && <path d="M20 35 C7 24 3 17 8 11 C12 6 18 8 20 14 C22 8 28 6 32 11 C37 17 33 24 20 35 Z" />}
      {suit === 'diamonds' && <path d="M20 3 L35 20 L20 37 L5 20 Z" />}
      {suit === 'clubs' && (
        <>
          <circle cx="20" cy="12" r="6.2" />
          <circle cx="12.2" cy="22.5" r="6.2" />
          <circle cx="27.8" cy="22.5" r="6.2" />
          <path d="M18 24 H22 L23.2 37 H16.8 Z" />
        </>
      )}
    </svg>
  );
}

function isCourt(card: Card): boolean {
  return card.rank === 'K' || card.rank === 'Q' || card.rank === 'J';
}

function isRed(card: Card): boolean {
  return card.joker === 'red' || card.suit === 'hearts' || card.suit === 'diamonds';
}
