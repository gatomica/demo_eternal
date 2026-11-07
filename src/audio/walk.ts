/**
 * walk.ts — the map's sounds, synthesized with Tone.js like the combat's (`sfx.ts`): footsteps that change with the floor
 * (stone, wax, planks, dug rock, stairs, ladder rungs) and with who is walking (your soft tread, the sleepwalkers' shuffle,
 * a patrol warden's boots, the waxed dragging themselves, the Wax Blob's slop), what the enemies cry out when they find you
 * (a warden's howl, a sleepwalker's moan, a waxed one's gurgle), drips of wax, a landing, and the guide's voice as it speaks.
 * None is loud: they are there to be felt. Placeholders to be tuned by ear, found in `build`.
 */
type ToneModule = typeof import("tone");
import { isMuted, masterBus, prepare } from "./sfx";

/** Who makes a footstep. */
export type Stepper = "player" | "sleepwalker" | "warden" | "waxed" | "blob" | "boss";
/** What they step on (`land`: coming down from a fall). */
export type Floor = "stone" | "wax" | "wood" | "rock" | "stairs" | "ladder" | "land";
/** What an enemy cries when it finds you. */
export type Cry = "howl" | "moan" | "gurgle" | "slosh";

function build(Tone: ToneModule) {
  const out = masterBus(Tone);
  // Everything underfoot goes through one pan (set before each sound, by where it is) and a room.
  const room = new Tone.Reverb({ decay: 2, wet: 0.34 }).connect(out);
  const pan = new Tone.Panner(0).connect(room);
  const bus = new Tone.Gain(1).connect(pan);

  // A scuff: a band of noise (the foot on the floor), its pitch and length set for each step.
  const scuffBand = new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 1 }).connect(bus);
  const scuff = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.004, decay: 0.06, sustain: 0, release: 0.01 } }).connect(scuffBand);
  // A click: the hard edge of a heel or a grain of grit.
  const clickBand = new Tone.Filter({ type: "highpass", frequency: 2400 }).connect(bus);
  const clicks = [0, 1, 2].map(() => new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.004 } }).connect(clickBand));
  // A thud or a hollow knock.
  const thud = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 3, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 } }).connect(bus);
  // A blip: a wet "tuk" dropping in pitch, or a rung's clink, or a drip.
  const blip = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.01 } }).connect(bus);
  const ting = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 } }).connect(bus);

  // A voice: a rough buzz through two vowel-like bands that slide as it goes, with a little tremble.
  const vowelA = new Tone.Filter({ type: "bandpass", frequency: 700, Q: 5 });
  const vowelB = new Tone.Filter({ type: "bandpass", frequency: 1100, Q: 6 });
  const voiceBus = new Tone.Gain(1).connect(bus);
  vowelA.connect(voiceBus); vowelB.connect(voiceBus);
  const tremble = new Tone.Vibrato({ frequency: 5.5, depth: 0.12 }).fan(vowelA, vowelB);
  const voice = new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.12, decay: 0.2, sustain: 0.8, release: 0.4 } }).connect(tremble);
  voice.volume.value = -6;
  const breath = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.15, decay: 0.5, sustain: 0.3, release: 0.4 } })
    .connect(new Tone.Filter({ type: "bandpass", frequency: 1500, Q: 1.2 }).connect(bus));
  breath.volume.value = -14;
  // A wet gurgle: noise in a low band, wobbling fast.
  const gurgleBand = new Tone.Filter({ type: "bandpass", frequency: 380, Q: 3 }).connect(bus);
  const wobble = new Tone.Tremolo({ frequency: 13, depth: 0.9 }).connect(gurgleBand).start();
  const gurgle = new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.03, decay: 0.4, sustain: 0.4, release: 0.2 } }).connect(wobble);
  gurgle.volume.value = -4;

  // The guide's voice: not a tone but a breath, shaped into a murmur: soft puffs of air through a band that moves with the letter, with
  // the faintest whispered pitch under it, in a hall of its own.
  const hall = new Tone.Reverb({ decay: 3, wet: 0.5 }).connect(out);
  const speechBus = new Tone.Gain(0.6).connect(hall);
  const huffBand = new Tone.Filter({ type: "bandpass", frequency: 1400, Q: 2.2 }).connect(speechBus);
  const huff = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.03, decay: 0.12, sustain: 0, release: 0.06 } }).connect(huffBand);
  huff.volume.value = 0;
  const speak = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.03, decay: 0.12, sustain: 0, release: 0.08 } }).connect(speechBus);
  speak.volume.value = -22;

  return { room, hall, pan, scuff, scuffBand, clicks, thud, blip, ting, voice, vowelA, vowelB, breath, gurgle, gurgleBand, speak, huff, huffBand };
}

let tone: ToneModule | null = null;
let bank: ReturnType<typeof build> | null = null;
let ready: Promise<void> | null = null;

/** Loads Tone.js and builds the synths (it is the same Tone the combat's sounds use; the audio starts on the first key press). */
function load(): Promise<void> {
  prepare();
  ready ??= import("tone").then(async T => {
    tone = T;
    bank = build(T);
    await Promise.all([bank.room.ready, bank.hall.ready]);
  });
  return ready;
}

/** Starts loading now (when the map opens), so the first step is not lost. */
export const prepareWalk = () => { void load(); };

/** Each synth plays one note at a time and refuses a start no later than its last: nudge ours. */
const lastStart = new Map<object, number>();
function when(synth: object, t: number) {
  // (Stay ahead of the audio clock too: Tone moves a start that is already past up to the clock's present, and two of those in one instant would be
  // the same time, which a synth refuses.)
  const at = Math.max(t, (tone?.getContext().currentTime ?? 0) + 0.005, (lastStart.get(synth) ?? 0) + 0.015);
  lastStart.set(synth, at);
  return at;
}

/** The bank and the time, if sound can play now. */
function ready_(): { b: NonNullable<typeof bank>; T: ToneModule; t: number } | null {
  if (isMuted()) return null;
  if (!bank || !tone) { void load(); return null; }
  if (tone.getContext().state !== "running") { void tone.start(); return null; }
  return { b: bank, T: tone, t: tone.immediate() };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** How each floor sounds underfoot. `band`: the scuff's pitch (Hz), `len`: its length (s); the rest are the extras. */
const FLOORS: Record<Exclude<Floor, "ladder" | "land">, { band: number; q: number; len: number; click?: number; knock?: number; grit?: number; wet?: number }> = {
  stone: { band: 1900, q: 1.2, len: 0.05, click: 0.5 },
  wax: { band: 650, q: 0.8, len: 0.09, wet: 1 },
  wood: { band: 1100, q: 2, len: 0.06, knock: 175 },
  rock: { band: 3000, q: 0.9, len: 0.05, grit: 3 },
  stairs: { band: 1500, q: 1.4, len: 0.05, click: 0.6, knock: 120 },
};

/** How each walker treads: its loudness, how high its sound sits, how long it lasts, how heavy, and its own extras. */
const WALKERS: Record<Stepper, { gain: number; tone: number; len: number; thud: number; clink?: boolean; drag?: boolean; slop?: boolean }> = {
  player: { gain: 0.5, tone: 1, len: 1, thud: 0 },
  // The sleepwalkers shuffle: long soft scuffs and the dull weight of a body.
  sleepwalker: { gain: 0.5, tone: 0.7, len: 2.2, thud: 70 },
  // The patrol wardens walk in boots, and something metal chinks at their belts.
  warden: { gain: 0.65, tone: 0.8, len: 1.2, thud: 85, clink: true },
  // The waxed drag their bound legs: a long scrape, and the wet of the wax.
  waxed: { gain: 0.5, tone: 0.5, len: 4, thud: 0, drag: true },
  // The blob slops along.
  blob: { gain: 0.8, tone: 0.35, len: 3, thud: 55, slop: true },
  boss: { gain: 1, tone: 0.5, len: 1.6, thud: 42, clink: true },
};

/** One footstep (`gain`: 0 to 1, how near it is; `pan`: -1 left to 1 right). */
export function step(who: Stepper, floor: Floor, gain = 1, pan = 0) {
  const r = ready_();
  if (!r || gain <= 0.02) return;
  const { b, t } = r;
  const w = WALKERS[who], v = gain * w.gain;
  b.pan.pan.value = Math.max(-1, Math.min(1, pan));
  if (floor === "ladder") {
    // A rung: a small knock and a chink of the rail.
    b.thud.triggerAttackRelease(rand(150, 190), 0.05, when(b.thud, t), 0.5 * v);
    b.ting.triggerAttackRelease(rand(1500, 2100), 0.04, when(b.ting, t), 0.35 * v);
    return;
  }
  if (floor === "land") {
    // Coming down hard: a heavy thud and a cloud of scuff.
    b.thud.triggerAttackRelease(rand(52, 62), 0.2, when(b.thud, t), 0.9 * v);
    b.scuffBand.frequency.setValueAtTime(700, t); b.scuffBand.Q.setValueAtTime(0.8, t);
    b.scuff.envelope.decay = 0.16;
    b.scuff.triggerAttackRelease(0.16, when(b.scuff, t), 0.8 * v);
    return;
  }
  const f = FLOORS[floor];
  if (w.drag) {
    // A scrape that slides along, then the wax letting go of the floor.
    const at = when(b.scuff, t);
    b.scuffBand.frequency.setValueAtTime(rand(520, 640), at);
    b.scuffBand.frequency.exponentialRampToValueAtTime(rand(260, 330), at + 0.34);
    b.scuffBand.Q.setValueAtTime(1.4, at);
    b.scuff.envelope.decay = 0.34;
    b.scuff.triggerAttackRelease(0.34, at, 0.7 * v);
    const sq = when(b.blip, t + 0.12);
    b.blip.triggerAttackRelease(rand(300, 420), 0.07, sq, 0.35 * v);
    b.blip.frequency.exponentialRampToValueAtTime(rand(110, 150), sq + 0.07);
    return;
  }
  if (w.slop) {
    // A heavy wet slap, and the heap settling.
    b.thud.triggerAttackRelease(rand(48, 62), 0.14, when(b.thud, t), 0.8 * v);
    const sq = when(b.blip, t + 0.02);
    b.blip.triggerAttackRelease(rand(240, 300), 0.12, sq, 0.5 * v);
    b.blip.frequency.exponentialRampToValueAtTime(rand(70, 100), sq + 0.12);
    b.scuffBand.frequency.setValueAtTime(420, t); b.scuffBand.Q.setValueAtTime(1, t);
    b.scuff.envelope.decay = 0.22;
    b.scuff.triggerAttackRelease(0.22, when(b.scuff, t), 0.6 * v);
    return;
  }
  // The scuff of the foot: the floor's band, as long and as deep as the walker makes it.
  const at = when(b.scuff, t);
  b.scuffBand.frequency.setValueAtTime(f.band * w.tone * rand(0.9, 1.1), at);
  b.scuffBand.Q.setValueAtTime(f.q, at);
  b.scuff.envelope.decay = f.len * w.len;
  b.scuff.triggerAttackRelease(f.len * w.len, at, 0.7 * v);
  if (f.click) b.clicks[0].triggerAttackRelease(0.012, when(b.clicks[0], t), f.click * v * (w.tone > 0.9 ? 1 : 0.6));
  if (f.grit) for (let i = 0; i < f.grit; i++) b.clicks[i % 3].triggerAttackRelease(0.01, when(b.clicks[i % 3], t + i * rand(0.012, 0.03)), rand(0.3, 0.8) * v);
  if (f.knock) b.thud.triggerAttackRelease(f.knock * w.tone * rand(0.92, 1.08), 0.07, when(b.thud, t), 0.7 * v);
  if (f.wet) {
    // The wax sticks and lets go: a little wet "tuk".
    const sq = when(b.blip, t + 0.015);
    b.blip.triggerAttackRelease(rand(300, 380), 0.05, sq, 0.3 * v);
    b.blip.frequency.exponentialRampToValueAtTime(rand(120, 160), sq + 0.05);
  }
  // A body's weight, if it has one.
  if (w.thud) b.thud.triggerAttackRelease(w.thud * rand(0.92, 1.08), 0.12, when(b.thud, t + 0.005), 0.55 * v);
  if (w.clink) b.ting.triggerAttackRelease(rand(2400, 3200), 0.05, when(b.ting, t + 0.03), 0.18 * v);
}

/** What an enemy cries on finding you (`delay`: seconds from now, so those it alerts answer a moment after). */
export function cry(kind: Cry, gain = 1, pan = 0, delay = 0) {
  const r = ready_();
  if (!r || gain <= 0.02) return;
  const { b, t } = r;
  const at = t + delay;
  b.pan.pan.value = Math.max(-1, Math.min(1, pan));
  if (kind === "howl") {
    // A long howl: up from a moan to a wail, then down and away, the vowel opening as it climbs.
    const s = when(b.voice, at), d = 1.3;
    b.voice.triggerAttack(190, s, 0.9 * gain);
    b.voice.frequency.exponentialRampToValueAtTime(330, s + d * 0.4);
    b.voice.frequency.exponentialRampToValueAtTime(150, s + d);
    b.voice.triggerRelease(s + d);
    b.vowelA.frequency.setValueAtTime(420, s); b.vowelA.frequency.linearRampToValueAtTime(820, s + d * 0.4); b.vowelA.frequency.linearRampToValueAtTime(500, s + d);
    b.vowelB.frequency.setValueAtTime(900, s); b.vowelB.frequency.linearRampToValueAtTime(1250, s + d * 0.4); b.vowelB.frequency.linearRampToValueAtTime(800, s + d);
    b.breath.triggerAttackRelease(d, when(b.breath, s), 0.8 * gain);
  } else if (kind === "moan") {
    // A low groan, half asleep.
    const s = when(b.voice, at), d = 0.7;
    b.voice.triggerAttack(rand(105, 130), s, 0.6 * gain);
    b.voice.frequency.exponentialRampToValueAtTime(rand(82, 95), s + d);
    b.voice.triggerRelease(s + d);
    b.vowelA.frequency.setValueAtTime(500, s); b.vowelA.frequency.linearRampToValueAtTime(380, s + d);
    b.vowelB.frequency.setValueAtTime(850, s); b.vowelB.frequency.linearRampToValueAtTime(700, s + d);
    b.breath.triggerAttackRelease(d * 0.8, when(b.breath, s), 0.35 * gain);
  } else if (kind === "gurgle") {
    // A throat full of wax.
    const s = when(b.gurgle, at);
    b.gurgleBand.frequency.setValueAtTime(rand(330, 420), s);
    b.gurgleBand.frequency.linearRampToValueAtTime(rand(220, 280), s + 0.5);
    b.gurgle.triggerAttackRelease(0.5, s, 0.7 * gain);
    for (let i = 0; i < 3; i++) {
      const q = when(b.blip, s + 0.05 + i * rand(0.1, 0.16));
      b.blip.triggerAttackRelease(rand(260, 360), 0.05, q, 0.25 * gain);
      b.blip.frequency.exponentialRampToValueAtTime(rand(110, 150), q + 0.05);
    }
  } else {
    // The blob: a slow, thick slosh.
    const s = when(b.gurgle, at);
    b.gurgleBand.frequency.setValueAtTime(240, s);
    b.gurgleBand.frequency.linearRampToValueAtTime(150, s + 0.7);
    b.gurgle.triggerAttackRelease(0.7, s, 0.8 * gain);
    b.thud.triggerAttackRelease(46, 0.25, when(b.thud, s), 0.7 * gain);
  }
}

/** A drip of wax somewhere in the dark: a soft round "plip" and its echo. */
export function drip(gain = 1, pan = 0) {
  const r = ready_();
  if (!r) return;
  const { b, t } = r;
  b.pan.pan.value = Math.max(-1, Math.min(1, pan));
  const f = rand(620, 980);
  for (const [i, k] of [[0, 0.3], [0.16, 0.1]] as const) {
    const s = when(b.blip, t + i);
    b.blip.triggerAttackRelease(f * (i ? 0.97 : 1), 0.06, s, k * gain);
    b.blip.frequency.exponentialRampToValueAtTime(f * 1.5, s + 0.05);
  }
}

/** Where each vowel's breath sits (Hz): the open ones low, the thin ones high. */
const VOWEL_BAND: Record<string, number> = { a: 1000, e: 1700, i: 2200, o: 800, u: 600 };
/** The faint whispered pitches under the breath (a pentatonic scale, so it is always gentle). */
const VOICE = [220, 261.63, 293.66, 329.63, 392];
let voiceAt = 2;

/**
 * One letter of the guide's speech, as it is written: a soft puff of breath, higher for a thin vowel and lower for an open one, a hush for a
 * consonant, with the faintest pitch wandering under it. Spaces and most punctuation are silent; every second letter sounds, so it is a
 * murmur and not a rattle.
 */
export function speak(ch: string, index: number) {
  if (index % 2 !== 0 || !/[\p{L}\p{N}]/u.test(ch)) return;
  const r = ready_();
  if (!r) return;
  const { b, t } = r;
  const vowel = VOWEL_BAND[ch.toLowerCase()];
  const s = when(b.huff, t);
  b.huffBand.frequency.setValueAtTime((vowel ?? rand(1200, 2600)) * rand(0.92, 1.08), s);
  b.huffBand.Q.setValueAtTime(vowel ? 2.6 : 0.9, s);
  b.huff.envelope.decay = vowel ? 0.14 : 0.08;
  b.huff.triggerAttackRelease(vowel ? 0.14 : 0.08, s, vowel ? 0.8 : 0.5);
  voiceAt = Math.max(0, Math.min(VOICE.length - 1, voiceAt + Math.round(rand(-1.4, 1.4))));
  if (vowel) b.speak.triggerAttackRelease(VOICE[voiceAt], 0.12, when(b.speak, t), 0.5);
}
