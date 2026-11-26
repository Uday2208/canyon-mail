// Sound, all synthesized with WebAudio: no audio files, nothing fetched.
// The engine is a low sawtooth whose pitch follows the throttle, a ring is
// a bright two-note chime, a crash is filtered noise, a landing is a short
// rising arpeggio. Everything is guarded: no AudioContext exists until the
// pilot's first gesture, and a missing API is silence, never an error.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, at, dur, type = 'sine', vol = 0.16) {
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + at);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.05);
    } catch { /* silence */ }
  }

  return {
    ensure,
    /** Engine hum follows throttle (0..1) and airspeed (m/s). */
    engine(throttle, speed) {
      if (!ctx || !engineOsc) return;
      try {
        engineOsc.frequency.value = 42 + throttle * 46 + speed * 0.35;
        engineGain.gain.value = 0.02 + throttle * 0.05;
      } catch { /* silence */ }
    },
    ring() {
      blip(880, 0, 0.22);
      blip(1318, 0.09, 0.3);
    },
    crash() {
      if (!ctx) return;
      try {
        const len = Math.floor(ctx.sampleRate * 0.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.value = 0.4;
        src.connect(f);
        f.connect(g);
        g.connect(ctx.destination);
        src.start();
      } catch { /* silence */ }
    },
    land() {
      blip(523, 0, 0.18);
      blip(659, 0.12, 0.18);
      blip(784, 0.24, 0.3);
    },
    click() {
      blip(660, 0, 0.08, 'square', 0.06);
    },
  };
}
