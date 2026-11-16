// Procedural sound: every effect is synthesised with the Web Audio API, so
// the game ships no audio files and makes no network request. The context is
// created on the first user gesture (browsers require one) and every call is
// guarded, so headless or muted play never throws.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  tone({ freq, freqEnd, type = 'sine', dur = 0.12, vol = 0.5, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  noise({ dur = 0.15, vol = 0.4, delay = 0, lowpass = 1200 }) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime + delay;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(now);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  shoot() { this.tone({ freq: 880, freqEnd: 220, type: 'square', dur: 0.07, vol: 0.16 }); }
  enemyDie(big = false) {
    this.noise({ dur: big ? 0.3 : 0.16, vol: big ? 0.5 : 0.32, lowpass: big ? 700 : 1400 });
    this.tone({ freq: big ? 160 : 320, freqEnd: 50, type: 'triangle', dur: big ? 0.3 : 0.16, vol: 0.3 });
  }
  playerHit() {
    this.tone({ freq: 220, freqEnd: 60, type: 'sawtooth', dur: 0.25, vol: 0.5 });
    this.noise({ dur: 0.2, vol: 0.4, lowpass: 900 });
  }
  pickup() {
    this.tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.4 });
    this.tone({ freq: 990, type: 'sine', dur: 0.14, vol: 0.4, delay: 0.07 });
  }
  dash() { this.noise({ dur: 0.18, vol: 0.25, lowpass: 2600 }); }
  waveStart() {
    this.tone({ freq: 196, type: 'triangle', dur: 0.35, vol: 0.4 });
    this.tone({ freq: 294, type: 'triangle', dur: 0.4, vol: 0.4, delay: 0.12 });
  }
  waveClear() {
    this.tone({ freq: 523, type: 'sine', dur: 0.12, vol: 0.35 });
    this.tone({ freq: 659, type: 'sine', dur: 0.12, vol: 0.35, delay: 0.09 });
    this.tone({ freq: 784, type: 'sine', dur: 0.2, vol: 0.35, delay: 0.18 });
  }
  nova() {
    this.noise({ dur: 0.5, vol: 0.55, lowpass: 500 });
    this.tone({ freq: 120, freqEnd: 40, type: 'sine', dur: 0.5, vol: 0.5 });
  }
  click() { this.tone({ freq: 520, type: 'sine', dur: 0.06, vol: 0.25 }); }
  gameOver() {
    this.tone({ freq: 330, freqEnd: 110, type: 'triangle', dur: 0.7, vol: 0.45 });
    this.tone({ freq: 165, freqEnd: 55, type: 'triangle', dur: 0.9, vol: 0.4, delay: 0.25 });
  }
  victory() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      this.tone({ freq, type: 'triangle', dur: 0.3, vol: 0.4, delay: i * 0.13 });
    });
  }
}
