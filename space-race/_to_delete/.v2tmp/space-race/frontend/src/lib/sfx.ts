/**
 * Synthesised sound effects (Web Audio API) - no audio files to ship.
 * Browsers only allow audio after a user gesture; every call is safe before that.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem("spacerace.muted") === "1";

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.3, slideTo?: number, delay = 0) {
  const c = ac(); if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, filterTo?: number): { stop: () => void } {
  const c = ac(); if (!c || !master) return { stop: () => {} };
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(filterFreq, c.currentTime);
  if (filterTo) f.frequency.exponentialRampToValueAtTime(filterTo, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
  return { stop: () => { try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0.0001, c.currentTime, 0.2); } catch { /* */ } } };
}

export const sfx = {
  get muted() { return muted; },
  toggleMute() { muted = !muted; localStorage.setItem("spacerace.muted", muted ? "1" : "0"); return muted; },
  click: () => tone(900, 0.05, "square", 0.08),
  pick: () => { tone(520, 0.08, "triangle", 0.2); tone(780, 0.12, "triangle", 0.2, undefined, 0.06); },
  release: () => tone(400, 0.12, "triangle", 0.15, 220),
  error: () => { tone(160, 0.18, "sawtooth", 0.15); tone(120, 0.22, "sawtooth", 0.15, undefined, 0.1); },
  steal: () => { tone(880, 0.07, "square", 0.12); tone(660, 0.07, "square", 0.12, undefined, 0.08); tone(440, 0.15, "square", 0.12, undefined, 0.16); },
  tick: () => tone(1200, 0.04, "square", 0.1),
  countdown: (final = false) => tone(final ? 1320 : 660, final ? 0.6 : 0.25, "sine", 0.35),
  ready: () => { [440, 554, 659].forEach((f, i) => tone(f, 0.2, "triangle", 0.2, undefined, i * 0.07)); },
  matchFound: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, "triangle", 0.22, undefined, i * 0.09)); },
  rumble: (dur = 4) => noise(dur, 0.9, 400, 80),
  whoosh: () => noise(0.8, 0.4, 3000, 200),
  explosion: () => { noise(1.6, 1.0, 1200, 60); tone(90, 1.0, "sine", 0.5, 30); },
  chime: () => { tone(1046, 0.4, "sine", 0.18); tone(1568, 0.5, "sine", 0.12, undefined, 0.08); },
  warn: () => { tone(740, 0.12, "square", 0.1); tone(740, 0.12, "square", 0.1, undefined, 0.18); },
  fanfare: () => {
    [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.45], [784, 0.7], [1046, 0.85]].forEach(([f, d]) =>
      tone(f, 0.35, "triangle", 0.25, undefined, d));
  },
  sad: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.4, "triangle", 0.2, undefined, i * 0.25)); },
};
