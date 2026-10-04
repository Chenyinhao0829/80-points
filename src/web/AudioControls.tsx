import { useState } from 'react';
import { audio } from './audio/AudioManager.js';

export function AudioControls() {
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [sfxOn, setSfxOn] = useState(audio.sfxEnabled);
  const [musicVolume, setMusicVolume] = useState(audio.musicVolume);
  const [sfxVolume, setSfxVolume] = useState(audio.sfxVolume);

  return (
    <div className="audio-panel">
      <button
        type="button"
        className={`audio-toggle ${musicOn ? 'is-on' : ''}`}
        onClick={() => setMusicOn(audio.toggleMusic())}
      >
        音乐 {musicOn ? '开' : '关'}
      </button>
      <label className="audio-volume">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={musicVolume}
          aria-label="音乐音量"
          onChange={(event) => {
            const value = Number(event.target.value);
            audio.setMusicVolume(value);
            setMusicVolume(value);
          }}
        />
      </label>
      <button
        type="button"
        className={`audio-toggle ${sfxOn ? 'is-on' : ''}`}
        onClick={() => setSfxOn(audio.toggleSfx())}
      >
        音效 {sfxOn ? '开' : '关'}
      </button>
      <label className="audio-volume">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sfxVolume}
          aria-label="音效音量"
          onChange={(event) => {
            const value = Number(event.target.value);
            audio.setSfxVolume(value);
            setSfxVolume(value);
          }}
        />
      </label>
    </div>
  );
}
