// Generates the game's sound effects as small WAV files (original, CC0).
// Run: node scripts/gen-sfx.mjs  → apps/web/public/sfx/*.wav
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/sfx");
mkdirSync(OUT, { recursive: true });
const RATE = 22050;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32000, 44 + i * 2));
  return buf;
}
const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p) => (p % 1 < 0.5 ? 0.6 : -0.6),
  tri: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
  saw: (p) => 2 * (p % 1) - 1,
};
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
/** tone(freq or fn(t), dur, {type, vol, attack, decay}) */
function tone(f, dur, o = {}) {
  const n = Math.floor(dur * RATE), out = new Float32Array(n);
  const type = osc[o.type ?? "sine"], vol = o.vol ?? 0.5, a = o.attack ?? 0.005, rel = o.release ?? dur * 0.6;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const freq = typeof f === "function" ? f(t / dur) : f;
    phase += freq / RATE;
    const env = Math.min(1, t / a) * (t > dur - rel ? Math.max(0, (dur - t) / rel) : 1);
    out[i] = (o.noise ? noise() : type(phase)) * vol * env;
  }
  return out;
}
function seq(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0), out = new Float32Array(total);
  let off = 0; for (const p of parts) { out.set(p, off); off += p.length; } return out;
}
function mix(...parts) {
  const n = Math.max(...parts.map((p) => p.length)), out = new Float32Array(n);
  for (const p of parts) p.forEach((v, i) => (out[i] += v)); return out;
}
const silence = (d) => new Float32Array(Math.floor(d * RATE));
const note = (n) => 440 * 2 ** ((n - 69) / 12);

const sounds = {
  hop: tone((x) => 300 + 500 * x, 0.08, { type: "tri", vol: 0.45 }),
  coin: seq(tone(note(83), 0.06, { type: "square", vol: 0.25, release: 0.02 }), tone(note(88), 0.22, { type: "square", vol: 0.25 })),
  bad: tone((x) => 320 - 200 * x, 0.35, { type: "saw", vol: 0.3 }),
  match: seq(tone(note(72), 0.09, { type: "tri" }), tone(note(76), 0.09, { type: "tri" }), tone(note(79), 0.09, { type: "tri" }), tone(note(84), 0.3, { type: "tri" })),
  perfect: seq(tone(note(79), 0.07, { type: "square", vol: 0.25 }), tone(note(84), 0.07, { type: "square", vol: 0.25 }), tone(note(88), 0.07, { type: "square", vol: 0.25 }), tone(note(91), 0.4, { type: "square", vol: 0.25 })),
  miss: seq(tone(note(60), 0.18, { type: "tri" }), tone(note(55), 0.35, { type: "tri" })),
  reveal: tone((x) => 200 + 900 * x * x, 0.4, { type: "sine", vol: 0.35 }),
  drumroll: (() => { const parts = []; for (let i = 0; i < 26; i++) parts.push(tone(0, 0.045, { noise: true, vol: 0.12 + i * 0.008, release: 0.03 })); return seq(...parts, tone(0, 0.3, { noise: true, vol: 0.5 })); })(),
  tick: tone(1200, 0.04, { type: "square", vol: 0.2, release: 0.02 }),
  win: seq(...[72, 76, 79, 84, 79, 84].map((n, i) => tone(note(n), i === 5 ? 0.5 : 0.11, { type: "square", vol: 0.22 }))),
  fanfare: seq(...[67, 67, 67, 72, 0, 76, 79].map((n, i) => (n ? tone(note(n), i === 6 ? 0.7 : 0.13, { type: "square", vol: 0.22 }) : silence(0.06)))),
  star: mix(seq(...[84, 88, 91, 96].map((n) => tone(note(n), 0.08, { type: "sine", vol: 0.3 }))), tone((x) => 1200 + 2000 * x, 0.4, { type: "sine", vol: 0.1 })),
  buy: seq(tone(note(76), 0.07, { type: "tri" }), tone(note(81), 0.15, { type: "tri" })),
  steal: tone((x) => 900 - 600 * x, 0.25, { type: "saw", vol: 0.25 }),
  shield: mix(tone(note(64), 0.4, { type: "tri", vol: 0.3 }), tone(note(71), 0.4, { type: "tri", vol: 0.2 })),
  dice: (() => { const parts = []; for (let i = 0; i < 8; i++) parts.push(tone(0, 0.03, { noise: true, vol: 0.3, release: 0.02 }), silence(0.03 + i * 0.008)); return seq(...parts); })(),
  click: tone(800, 0.03, { type: "square", vol: 0.15, release: 0.02 }),
  whoosh: tone(0, 0.35, { noise: true, vol: 0.2, attack: 0.15 }),
  countdown: tone(note(69), 0.18, { type: "square", vol: 0.22 }),
  go: tone(note(81), 0.45, { type: "square", vol: 0.25 }),
  pop: seq(tone(0, 0.05, { noise: true, vol: 0.7, release: 0.04 }), tone((x) => 200 - 150 * x, 0.15, { type: "sine", vol: 0.4 })),
  lock: tone(note(76), 0.08, { type: "tri", vol: 0.35 }),
  event: seq(tone(note(67), 0.1, { type: "tri" }), tone(note(70), 0.1, { type: "tri" }), tone(note(74), 0.25, { type: "tri" })),
  join: seq(tone(note(72), 0.08, { type: "sine" }), tone(note(79), 0.16, { type: "sine" })),
};
for (const [name, s] of Object.entries(sounds)) writeFileSync(join(OUT, `${name}.wav`), wav(s));
console.log(`wrote ${Object.keys(sounds).length} sounds to ${OUT}`);
