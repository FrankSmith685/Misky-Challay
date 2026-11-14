/**
 * Web Audio Soundtrack Engine
 * Synthesizes soft, emotional, uplifting acoustic piano and gentle strings
 * in the nostalgic painterly style of Studio Ghibli (Joe Hisaishi aesthetic).
 */

interface PianoNote {
  time: number;       // time in seconds
  freq: number;       // frequency in Hz
  duration: number;   // note duration in seconds
  velocity: number;   // 0.0 to 1.0
  type?: 'piano' | 'strings' | 'chime';
}

// Frequencies for standard piano notes
const NOTE: Record<string, number> = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.00,
  A2: 110.00,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.00,
  A3: 220.00,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.00,
  A4: 440.00,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.00,
  C6: 1046.50,
};

// 10-second Ghibli-inspired emotional composition
const SCORE: PianoNote[] = [
  // --- SCENE 1: (0:00 - 3:00) Newborn & Tender Father's Smile ---
  // Gentle C major lullaby
  { time: 0.05, freq: NOTE.C3, duration: 2.2, velocity: 0.65, type: 'piano' },
  { time: 0.15, freq: NOTE.G3, duration: 1.8, velocity: 0.55, type: 'piano' },
  { time: 0.25, freq: NOTE.E4, duration: 1.8, velocity: 0.6, type: 'piano' },
  { time: 0.35, freq: NOTE.C4, duration: 2.5, velocity: 0.5, type: 'strings' },
  { time: 0.70, freq: NOTE.G4, duration: 1.1, velocity: 0.58, type: 'piano' },
  { time: 1.15, freq: NOTE.E5, duration: 1.2, velocity: 0.65, type: 'piano' },
  { time: 1.65, freq: NOTE.D5, duration: 1.0, velocity: 0.55, type: 'piano' },
  { time: 1.80, freq: NOTE.G2, duration: 1.8, velocity: 0.55, type: 'piano' },
  { time: 1.90, freq: NOTE.E3, duration: 1.6, velocity: 0.5, type: 'piano' },
  { time: 2.05, freq: NOTE.B3, duration: 1.5, velocity: 0.5, type: 'strings' },
  { time: 2.20, freq: NOTE.C5, duration: 1.3, velocity: 0.62, type: 'piano' },
  { time: 2.65, freq: NOTE.B4, duration: 0.8, velocity: 0.55, type: 'piano' },

  // --- SCENE 2: (3:00 - 6:00) Spring Park, Laughter & Cherry Blossoms ---
  // Uplifting warmth (Am -> F -> G)
  { time: 3.02, freq: NOTE.A2, duration: 2.0, velocity: 0.7, type: 'piano' },
  { time: 3.08, freq: NOTE.E3, duration: 1.8, velocity: 0.6, type: 'piano' },
  { time: 3.12, freq: NOTE.C4, duration: 1.9, velocity: 0.65, type: 'piano' },
  { time: 3.05, freq: NOTE.A3, duration: 2.8, velocity: 0.55, type: 'strings' },
  { time: 3.45, freq: NOTE.E4, duration: 0.9, velocity: 0.65, type: 'piano' },
  { time: 3.80, freq: NOTE.A4, duration: 1.0, velocity: 0.72, type: 'piano' },
  { time: 4.15, freq: NOTE.F2, duration: 2.0, velocity: 0.65, type: 'piano' },
  { time: 4.22, freq: NOTE.C3, duration: 1.8, velocity: 0.55, type: 'piano' },
  { time: 4.28, freq: NOTE.A3, duration: 1.8, velocity: 0.6, type: 'piano' },
  { time: 4.25, freq: NOTE.F3, duration: 2.5, velocity: 0.55, type: 'strings' },
  { time: 4.55, freq: NOTE.C5, duration: 0.9, velocity: 0.7, type: 'piano' },
  { time: 4.90, freq: NOTE.B4, duration: 0.8, velocity: 0.65, type: 'piano' },
  { time: 5.20, freq: NOTE.G2, duration: 1.8, velocity: 0.68, type: 'piano' },
  { time: 5.25, freq: NOTE.D3, duration: 1.6, velocity: 0.58, type: 'piano' },
  { time: 5.30, freq: NOTE.B3, duration: 1.6, velocity: 0.6, type: 'piano' },
  { time: 5.50, freq: NOTE.G4, duration: 1.2, velocity: 0.7, type: 'piano' },
  { time: 5.80, freq: NOTE.A4, duration: 0.7, velocity: 0.65, type: 'piano' },

  // --- SCENE 3: (6:00 - 10:00) Sunset Meadow & Heartfelt Family Dedication ---
  // Grand emotional resolution (Fmaj7 -> G -> Em -> Am -> Dm7 -> C)
  { time: 6.02, freq: NOTE.F2, duration: 2.2, velocity: 0.75, type: 'piano' },
  { time: 6.08, freq: NOTE.C3, duration: 2.0, velocity: 0.65, type: 'piano' },
  { time: 6.14, freq: NOTE.A3, duration: 2.0, velocity: 0.68, type: 'piano' },
  { time: 6.05, freq: NOTE.F4, duration: 3.5, velocity: 0.65, type: 'strings' },
  { time: 6.45, freq: NOTE.C5, duration: 1.1, velocity: 0.75, type: 'piano' },
  { time: 6.85, freq: NOTE.D5, duration: 1.1, velocity: 0.78, type: 'piano' },

  // Typography starts to appear (7.0s - 10s):
  // "El mejor regalo es tener una gran familia"
  { time: 7.20, freq: NOTE.G2, duration: 2.2, velocity: 0.75, type: 'piano' },
  { time: 7.25, freq: NOTE.D3, duration: 2.0, velocity: 0.65, type: 'piano' },
  { time: 7.30, freq: NOTE.B3, duration: 2.0, velocity: 0.65, type: 'piano' },
  { time: 7.25, freq: NOTE.G4, duration: 3.0, velocity: 0.7, type: 'strings' },
  { time: 7.55, freq: NOTE.E5, duration: 1.4, velocity: 0.8, type: 'piano' },
  { time: 7.70, freq: NOTE.G5, duration: 2.0, velocity: 0.7, type: 'chime' }, // Golden sparkle chime

  // "¡Feliz Cumpleaños, Renzo!"
  { time: 8.10, freq: NOTE.C2, duration: 2.8, velocity: 0.8, type: 'piano' },
  { time: 8.15, freq: NOTE.G2, duration: 2.6, velocity: 0.7, type: 'piano' },
  { time: 8.20, freq: NOTE.E3, duration: 2.5, velocity: 0.7, type: 'piano' },
  { time: 8.25, freq: NOTE.C4, duration: 2.5, velocity: 0.7, type: 'piano' },
  { time: 8.15, freq: NOTE.C5, duration: 2.8, velocity: 0.75, type: 'strings' },
  { time: 8.50, freq: NOTE.G5, duration: 1.8, velocity: 0.75, type: 'piano' },
  { time: 8.70, freq: NOTE.C6, duration: 2.2, velocity: 0.65, type: 'chime' }, // Soft high star chime
  { time: 9.10, freq: NOTE.E5, duration: 1.8, velocity: 0.7, type: 'piano' },
  { time: 9.50, freq: NOTE.C5, duration: 2.0, velocity: 0.6, type: 'piano' },
];

export class EmotionalSoundtrackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.85;
  private startTime: number = 0;
  private activeSources = new Set<AudioScheduledSourceNode>();

  constructor() {
    // AudioContext will be lazily initialized on user interaction
  }

  public init() {
    if (this.ctx) return;
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtxClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

    // Create warm concert hall reverb
    this.reverbNode = this.createReverb(this.ctx, 2.5, 2.0);
    this.reverbNode.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  private createReverb(ctx: AudioContext, duration: number, decay: number): ConvolverNode {
    const convolver = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = ((Math.random() * 2 - 1) * Math.pow(n / length, decay));
      right[i] = ((Math.random() * 2 - 1) * Math.pow(n / length, decay));
    }
    convolver.buffer = impulse;
    return convolver;
  }

  public playFrom(offsetSeconds: number = 0) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.stop();
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    this.startTime = this.ctx.currentTime - offsetSeconds;

    // Filter notes that should play after offsetSeconds
    const notesToPlay = SCORE.filter(n => n.time >= offsetSeconds && n.time <= 10.0);

    notesToPlay.forEach(note => {
      const targetTime = this.startTime + note.time;
      this.scheduleNote(note, targetTime);
    });
  }

  private scheduleNote(note: PianoNote, when: number) {
    if (!this.ctx || !this.masterGain || !this.reverbNode) return;
    if (when < this.ctx.currentTime - 0.05) return;

    const ctx = this.ctx;

    if (note.type === 'strings') {
      // Warm strings pad
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(note.freq * 0.998, when);
      osc2.frequency.setValueAtTime(note.freq * 1.002, when);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, when);
      filter.frequency.exponentialRampToValueAtTime(1400, when + note.duration * 0.5);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(note.velocity * 0.22, when + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + note.duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.reverbNode);
      gain.connect(this.masterGain);

      this.trackSource(osc1);
      this.trackSource(osc2);
      osc1.start(when);
      osc2.start(when);
      osc1.stop(when + note.duration);
      osc2.stop(when + note.duration);
    } else if (note.type === 'chime') {
      // Gentle warm star / music box chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, when);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(note.velocity * 0.25, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + note.duration);

      osc.connect(gain);
      gain.connect(this.reverbNode);

      this.trackSource(osc);
      osc.start(when);
      osc.stop(when + note.duration);
    } else {
      // Acoustic Piano voice (natural acoustic harmonics)
      const fundamental = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      // Triangle for body, subtle sine for fundamental warmth
      fundamental.type = 'triangle';
      fundamental.frequency.setValueAtTime(note.freq, when);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(note.freq * 2, when);

      filter.type = 'lowpass';
      // Piano hammer dynamic brightness
      const cutoff = Math.min(note.freq * 4.5, 6000);
      filter.frequency.setValueAtTime(cutoff, when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(note.freq * 1.2, 400), when + note.duration * 0.7);

      const amp = note.velocity * 0.35;
      gain.gain.setValueAtTime(0.0001, when);
      // Fast strike attack
      gain.gain.linearRampToValueAtTime(amp, when + 0.012);
      // Natural logarithmic acoustic piano decay
      gain.gain.exponentialRampToValueAtTime(amp * 0.35, when + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + note.duration);

      fundamental.connect(filter);
      overtone.connect(filter);
      filter.connect(gain);

      // Direct dry signal + warm reverb wet mix
      gain.connect(this.masterGain);
      gain.connect(this.reverbNode);

      this.trackSource(fundamental);
      this.trackSource(overtone);
      fundamental.start(when);
      overtone.start(when);
      fundamental.stop(when + note.duration);
      overtone.stop(when + note.duration);
    }
  }

  public stop() {
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      const stopAt = now + 0.04;

      // Fade out briefly to avoid clicks, then stop every scheduled oscillator.
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, stopAt);
      for (const source of this.activeSources) {
        try {
          source.stop(stopAt);
        } catch {
          // A source may have finished between scheduling and cleanup.
        }
      }
      this.activeSources.clear();
    }
  }

  private trackSource(source: AudioScheduledSourceNode) {
    this.activeSources.add(source);
    source.addEventListener('ended', () => this.activeSources.delete(source), { once: true });
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getDestination(): AudioNode | null {
    return this.masterGain;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }
}

export const soundtrack = new EmotionalSoundtrackEngine();
