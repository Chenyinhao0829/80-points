export type MusicTrack = 'menu' | 'game';
export type SfxName = 'card-play' | 'trick-win' | 'level-up' | 'victory' | 'defeat';

/**
 * Music and effects stay off until this is true.
 * Put files in public/audio/ (game-bgm.mp3 and the effect files), then set this to true.
 */
export const AUDIO_ENABLED = false;

// Replace public/audio/game-bgm.mp3 to change the game BGM.
// Replace public/audio/menu-bgm.mp3 to change the menu BGM.
const MUSIC_FILE: Record<MusicTrack, string> = {
  menu: 'menu-bgm',
  game: 'game-bgm',
};

const DEFAULT_MUSIC_VOLUME = 0.25;
const DEFAULT_SFX_VOLUME = 0.6;

/**
 * One place for music and effects. Missing files fall back to a soft
 * synthesized loop or a short tone, so a 404 never throws into the game.
 */
class AudioManager {
  musicEnabled = false;
  sfxEnabled = false;
  musicVolume = DEFAULT_MUSIC_VOLUME;
  sfxVolume = DEFAULT_SFX_VOLUME;

  private unlocked = false;
  private track: MusicTrack | null = null;
  private music: HTMLAudioElement | null = null;
  private usingSynth = false;
  private ctx: AudioContext | null = null;
  private synthTimer: number | null = null;
  private synthNodes: AudioNode[] = [];

  unlock(): void {
    if (!AUDIO_ENABLED) return;
    this.unlocked = true;
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  playMusic(track: MusicTrack): void {
    if (!AUDIO_ENABLED) return;
    this.track = track;
    if (!this.unlocked || !this.musicEnabled) return;
    this.startTrack(track);
  }

  stopMusic(): void {
    this.track = null;
    this.stopCurrent();
  }

  pauseMusic(): void {
    this.music?.pause();
    this.stopSynth();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp(volume);
    if (this.music) this.music.volume = this.musicVolume;
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.pauseMusic();
    } else if (this.track) {
      this.playMusic(this.track);
    }
    return this.musicEnabled;
  }

  playSfx(name: SfxName): void {
    if (!AUDIO_ENABLED || !this.unlocked || !this.sfxEnabled) return;
    const audio = new Audio(fileUrl(name, 'mp3'));
    audio.volume = this.sfxVolume;
    let fellBack = false;
    audio.addEventListener('error', () => {
      if (fellBack) return;
      fellBack = true;
      this.playFileOrSynth(fileUrl(name, 'wav'), () => this.synthSfx(name));
    });
    void audio.play().catch(() => {
      if (!fellBack) this.playFileOrSynth(fileUrl(name, 'wav'), () => this.synthSfx(name));
    });
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp(volume);
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  private startTrack(track: MusicTrack): void {
    this.stopCurrent();
    const audio = new Audio(fileUrl(MUSIC_FILE[track], 'mp3'));
    audio.loop = true;
    audio.volume = this.musicVolume;
    this.music = audio;
    this.usingSynth = false;
    let triedWav = false;
    audio.addEventListener('error', () => {
      if (this.music !== audio || triedWav) return;
      triedWav = true;
      audio.src = fileUrl(MUSIC_FILE[track], 'wav');
      void audio.play().catch(() => this.beginSynth(track));
    });
    void audio.play().catch(() => {
      if (this.music !== audio) return;
      if (!triedWav) {
        triedWav = true;
        audio.src = fileUrl(MUSIC_FILE[track], 'wav');
        void audio.play().catch(() => this.beginSynth(track));
      }
    });
  }

  private playFileOrSynth(url: string, synth: () => void): void {
    const audio = new Audio(url);
    audio.volume = this.sfxVolume;
    audio.addEventListener('error', () => synth());
    void audio.play().catch(() => synth());
  }

  private beginSynth(track: MusicTrack): void {
    if (this.track !== track || !this.musicEnabled) return;
    this.music?.pause();
    this.music = null;
    this.usingSynth = true;
    this.stopSynth();
    const notes = track === 'menu' ? [523, 659, 784, 880] : [523, 659, 784, 880, 988, 880, 784, 659];
    let step = 0;
    const pulse = () => {
      if (!this.usingSynth || !this.musicEnabled) return;
      this.tone(notes[step % notes.length]!, 0.9, 'sine', this.musicVolume * 0.35);
      this.tone(notes[step % notes.length]! / 2, 0.9, 'triangle', this.musicVolume * 0.12);
      step += 1;
    };
    pulse();
    this.synthTimer = window.setInterval(pulse, 1000);
  }

  private synthSfx(name: SfxName): void {
    const sets: Record<SfxName, number[]> = {
      'card-play': [520],
      'trick-win': [523, 659, 784],
      'level-up': [392, 523, 659, 784],
      victory: [523, 659, 784, 1046],
      defeat: [392, 349, 294, 247],
    };
    sets[name].forEach((freq, index) => {
      window.setTimeout(() => this.tone(freq, 0.16, name === 'defeat' ? 'triangle' : 'sine', this.sfxVolume * 0.45), index * 120);
    });
  }

  private tone(freq: number, duration: number, type: OscillatorType, gainValue: number): void {
    const ctx = this.context();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    this.synthNodes.push(osc);
    osc.onended = () => {
      this.synthNodes = this.synthNodes.filter((node) => node !== osc);
    };
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private stopCurrent(): void {
    if (this.music) {
      this.music.pause();
      this.music.src = '';
      this.music = null;
    }
    this.usingSynth = false;
    this.stopSynth();
  }

  private stopSynth(): void {
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    for (const node of this.synthNodes) {
      if (node instanceof OscillatorNode) node.stop();
    }
    this.synthNodes = [];
  }
}

function fileUrl(name: string, ext: 'mp3' | 'wav'): string {
  return `/audio/${name}.${ext}`;
}

function clamp(volume: number): number {
  if (Number.isNaN(volume)) return 0;
  return Math.min(1, Math.max(0, volume));
}

export const audio = new AudioManager();
