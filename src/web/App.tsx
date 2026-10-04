import { useState } from 'react';
import { GameTable, StartScreen } from './GameTable.js';
import { useLocalMatch } from './useLocalMatch.js';

export function App() {
  const [started, setStarted] = useState(false);
  if (!started) return <StartScreen onStart={() => setStarted(true)} />;
  return <PlayScreen />;
}

function PlayScreen() {
  const game = useLocalMatch();
  return <GameTable game={game} />;
}
