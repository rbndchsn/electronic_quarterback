// Generated square-wave sound effects. No audio files.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Browsers only allow audio after a user gesture, so call this from input handlers.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, start, dur, gain = 0.06, type = 'square') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.setValueAtTime(gain, t + dur * 0.8);
    amp.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  whistle(start, dur) {
    // two close tones beat against each other like a pea whistle
    this.tone(2350, start, dur, 0.04);
    this.tone(2480, start, dur, 0.04);
  }

  play(event) {
    switch (event) {
      case 'tick':
        this.tone(900, 0, 0.018, 0.03);
        break;
      case 'whistle':
        this.whistle(0, 0.45);
        break;
      case 'turnover':
        for (let i = 0; i < 3; i++) this.whistle(i * 0.2, 0.12);
        break;
      case 'catch':
        this.tone(1320, 0, 0.06, 0.05);
        break;
      case 'kick':
        this.tone(140, 0, 0.12, 0.09, 'triangle');
        break;
      case 'score': {
        // short original fanfare
        const notes = [392, 392, 523, 523, 659, 523, 659, 784];
        const lens = [0.14, 0.14, 0.14, 0.14, 0.2, 0.1, 0.14, 0.4];
        let t = 0;
        notes.forEach((f, i) => {
          this.tone(f, t, lens[i] * 0.92, 0.06);
          t += lens[i];
        });
        break;
      }
      default:
        break;
    }
  }
}
