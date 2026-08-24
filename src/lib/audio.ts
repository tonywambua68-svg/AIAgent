/* J.A.R.V.I.S OS — audio engine (WebAudio synth, no asset files) */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function primeAudio() { ensure(); }
export function setVolume(v: number) { volume = v; if (master) master.gain.value = muted ? 0 : v; }
export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : volume; }

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slide?: number } = {}) {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function click(at = 0, gain = 0.08) {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const buf = c.createBuffer(1, c.sampleRate * 0.03, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf; src.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  /** cash-register style double-ding */
  sale() { click(0, 0.1); tone(1318.5, 0.12, { type: "triangle", gain: 0.16 }); tone(1760, 0.28, { type: "triangle", gain: 0.18, at: 0.09 }); tone(2637, 0.18, { type: "sine", gain: 0.08, at: 0.09 }); },
  notify() { tone(880, 0.14, { type: "sine", gain: 0.1 }); tone(1174.7, 0.16, { type: "sine", gain: 0.09, at: 0.1 }); },
  error() { tone(220, 0.3, { type: "sawtooth", gain: 0.08, slide: 110 }); },
  confirm() { tone(660, 0.1, { type: "sine", gain: 0.1 }); tone(990, 0.14, { type: "sine", gain: 0.1, at: 0.07 }); },
  boot() { tone(220, 0.5, { type: "sine", gain: 0.06, slide: 880 }); tone(1760, 0.2, { type: "sine", gain: 0.05, at: 0.4 }); },
  tick() { tone(1400, 0.04, { type: "square", gain: 0.03 }); },
};
