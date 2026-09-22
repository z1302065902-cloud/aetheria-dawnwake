/**
 * All audio in Aetheria is synthesised at runtime with the Web Audio API — no sample
 * files are shipped, so there is nothing to license. Music is a lookahead step
 * sequencer, SFX are short one-shot synthesis graphs.
 */
export type SfxName =
  | 'sword' | 'swordHeavy' | 'arrow' | 'arrowHit' | 'magic' | 'fireball' | 'explosion'
  | 'build' | 'buildDone' | 'harvest' | 'deposit' | 'levelUp' | 'skill' | 'bossRoar'
  | 'bossSlam' | 'unitReady' | 'click' | 'error' | 'select' | 'victory' | 'defeat' | 'heroDown' | 'heroRevive';

export type MusicTrack = 'none' | 'menu' | 'battle' | 'boss';

const SCALES: Record<string, number[]> = {
  // minor pentatonic-ish, sounds "epic fantasy" without being a copy of anything
  menu: [0, 3, 5, 7, 10],
  battle: [0, 2, 3, 7, 8, 10],
  boss: [0, 1, 5, 6, 8, 11],
};

const ROOTS: Record<string, number> = { menu: 220, battle: 174.6, boss: 146.8 };

class AudioBusImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private track: MusicTrack = 'none';
  private step = 0;
  private nextNoteTime = 0;
  private schedulerId: number | null = null;

  musicVolume = 0.42;
  sfxVolume = 0.55;
  muted = false;

  /** Must be called from a user gesture the first time (browser autoplay policy). */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch (err) {
      console.warn('[audio] unavailable', err);
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    // shared noise buffer for impacts / explosions
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.muted = muted;
    if (this.musicGain) this.musicGain.gain.value = muted ? 0 : music;
    if (this.sfxGain) this.sfxGain.gain.value = muted ? 0 : sfx;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    dur: number,
    gain: number,
    dest: AudioNode,
    detune = 0,
    freqEnd?: number,
  ): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    if (detune) osc.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, filter: BiquadFilterType, freq: number, q = 1, sweepTo?: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  sfx(name: SfxName, volume = 1): void {
    if (!this.ctx || this.muted) return;
    const d = this.sfxGain!;
    const v = volume * 0.5;
    switch (name) {
      case 'sword':
        this.noise(0.09, 0.5 * v, 'highpass', 1800);
        this.tone('triangle', 620, 0.08, 0.16 * v, d, 0, 280);
        break;
      case 'swordHeavy':
        this.noise(0.16, 0.62 * v, 'lowpass', 1400, 1, 300);
        this.tone('square', 180, 0.18, 0.2 * v, d, 0, 70);
        break;
      case 'arrow':
        this.noise(0.12, 0.34 * v, 'bandpass', 2600, 2, 900);
        break;
      case 'arrowHit':
        this.tone('square', 320, 0.06, 0.22 * v, d, 0, 140);
        this.noise(0.06, 0.3 * v, 'highpass', 2400);
        break;
      case 'magic':
        this.tone('sine', 520, 0.35, 0.2 * v, d, 0, 1180);
        this.tone('triangle', 780, 0.3, 0.12 * v, d, 12, 1600);
        break;
      case 'fireball':
        this.noise(0.4, 0.4 * v, 'lowpass', 900, 1, 180);
        this.tone('sawtooth', 160, 0.35, 0.16 * v, d, 0, 60);
        break;
      case 'explosion':
        this.noise(0.55, 0.7 * v, 'lowpass', 1200, 0.8, 90);
        this.tone('sine', 110, 0.5, 0.32 * v, d, 0, 42);
        break;
      case 'build':
        this.tone('triangle', 260, 0.12, 0.2 * v, d, 0, 340);
        this.noise(0.1, 0.24 * v, 'bandpass', 900, 1.5);
        break;
      case 'buildDone':
        this.tone('triangle', 420, 0.14, 0.22 * v, d);
        setTimeout(() => this.tone('triangle', 620, 0.18, 0.22 * v, d), 90);
        setTimeout(() => this.tone('triangle', 830, 0.24, 0.2 * v, d), 190);
        break;
      case 'harvest':
        this.noise(0.08, 0.22 * v, 'bandpass', 1400, 2);
        this.tone('triangle', 480, 0.07, 0.12 * v, d, 0, 620);
        break;
      case 'deposit':
        this.tone('sine', 980, 0.1, 0.2 * v, d);
        setTimeout(() => this.tone('sine', 1320, 0.12, 0.18 * v, d), 70);
        break;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone('triangle', f, 0.3, 0.22 * v, d), i * 90));
        break;
      case 'skill':
        this.tone('sawtooth', 300, 0.3, 0.18 * v, d, 0, 900);
        this.noise(0.3, 0.24 * v, 'bandpass', 1200, 1.4, 2600);
        break;
      case 'bossRoar':
        this.tone('sawtooth', 90, 1.1, 0.4 * v, d, 0, 46);
        this.tone('square', 62, 1.2, 0.22 * v, d, 6, 34);
        this.noise(1.0, 0.34 * v, 'lowpass', 700, 1, 180);
        break;
      case 'bossSlam':
        this.tone('sine', 70, 0.6, 0.5 * v, d, 0, 30);
        this.noise(0.5, 0.5 * v, 'lowpass', 500, 1, 80);
        break;
      case 'unitReady':
        this.tone('triangle', 660, 0.12, 0.24 * v, d);
        setTimeout(() => this.tone('triangle', 880, 0.16, 0.2 * v, d), 80);
        break;
      case 'click':
        this.tone('square', 900, 0.04, 0.1 * v, d, 0, 700);
        break;
      case 'select':
        this.tone('triangle', 720, 0.05, 0.12 * v, d, 0, 880);
        break;
      case 'error':
        this.tone('square', 180, 0.16, 0.2 * v, d, 0, 120);
        break;
      case 'heroDown':
        this.tone('sawtooth', 300, 0.8, 0.3 * v, d, 0, 80);
        break;
      case 'heroRevive':
        [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone('sine', f, 0.4, 0.24 * v, d), i * 130));
        break;
      case 'victory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone('triangle', f, 0.6, 0.26 * v, d, 0, f * 1.01), i * 150));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone('sawtooth', f, 0.8, 0.24 * v, d, 0, f * 0.98), i * 220));
        break;
    }
  }

  // ───────────────────────── music ─────────────────────────

  playMusic(track: MusicTrack): void {
    if (this.track === track) return;
    this.track = track;
    if (!this.ctx) return;
    if (track === 'none') {
      if (this.schedulerId !== null) {
        window.clearInterval(this.schedulerId);
        this.schedulerId = null;
      }
      return;
    }
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    if (this.schedulerId === null) {
      this.schedulerId = window.setInterval(() => this.scheduler(), 60);
    }
  }

  private scheduler(): void {
    if (!this.ctx || this.track === 'none' || this.muted) return;
    const bpm = this.track === 'boss' ? 138 : this.track === 'battle' ? 116 : 84;
    const stepDur = 60 / bpm / 2; // 8th notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;
    const track = this.track;
    if (track === 'none') return;
    const scale = SCALES[track];
    const root = ROOTS[track];
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;

    const note = (semi: number, dur: number, gain: number, type: OscillatorType = 'triangle', octave = 0) => {
      const osc = this.ctx!.createOscillator();
      osc.type = type;
      osc.frequency.value = root * Math.pow(2, semi / 12 + octave);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(this.musicGain!);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    };

    // bass: root on every 4 steps
    if (beat % 4 === 0) {
      const bassSemi = scale[(bar * 2 + Math.floor(beat / 8)) % scale.length] - 12;
      note(bassSemi, 0.72, 0.5, 'sawtooth', 0);
    }
    // pad chord on bar start
    if (beat === 0 || beat === 8) {
      const base = scale[(bar * 3) % scale.length];
      note(base, 1.6, 0.16, 'triangle', 1);
      note(base + 7, 1.6, 0.12, 'triangle', 1);
    }
    // lead melody (deterministic pseudo-random walk so each track feels different)
    const melodyPattern = track === 'boss' ? [0, 2, 4, 3, 1, 5] : track === 'battle' ? [0, 3, 1, 4, 2, 5] : [0, 2, 4, 2];
    if (beat % 2 === 0 && (beat % 8 !== 6 || track !== 'menu')) {
      const idx = (step * 7 + bar * 3) % melodyPattern.length;
      const semi = scale[melodyPattern[idx] % scale.length] + (beat >= 8 ? 0 : 0);
      note(semi, 0.34, track === 'boss' ? 0.2 : 0.16, 'square', 1);
    }
    // percussion
    if (this.noiseBuffer && (beat === 0 || beat === 8)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.3);
    }
    if (this.noiseBuffer && track !== 'menu' && beat % 4 === 2) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 5200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      src.start(time);
      src.stop(time + 0.12);
    }
  }

  get ready(): boolean {
    return this.ctx !== null;
  }
}

export const audio = new AudioBusImpl();
