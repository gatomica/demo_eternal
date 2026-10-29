/**
 * sfx.ts — the combat's sounds, synthesized with Tone.js (no sound files): a direct hit, a clang
 * when a Block catches a blow, a dodge's whoosh, a Rest's sigh, a stagger's (the same breath, louder and with a clear plosive start) and a fall. They are
 * placeholders to be tuned by ear: each is a synth with a few settings, found in `bank`.
 *
 * Browsers only start audio after a click or key press; the first sound after one is the first
 * you can hear. `sfxFor` turns a combat event into its sound; the combat screen calls it as each
 * step's blow lands, so the sound lands with the picture.
 */
/** Tone.js is big, so it is only fetched when the first sound is wanted. */
type ToneModule = typeof import("tone");
import type { CombatEvent } from "../core/types";

export type Sfx = "hit" | "clang" | "dodge" | "rest" | "stagger" | "fall" | "flame";

const MUTE_KEY = "sfx-muted";

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(v: boolean) {
  muted = v;
  if (tone) tone.getDestination().mute = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked: the choice just lasts until the page closes.
  }
}

/** Every synth, built once on first use and wired to the speakers. */
function build(Tone: ToneModule) {
  const out = Tone.getDestination();
  out.volume.value = -4;
  out.mute = muted;
  // A little room around the metal and the breath.
  const room = new Tone.Reverb({ decay: 1.6, wet: 0.22 }).connect(out);

  // Hit: a dull thump (a drum dropping in pitch) with a short slap of noise.
  const thump = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 } }).connect(out);
  const slap = new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.02 } })
    .connect(new Tone.Filter(1800, "lowpass").connect(out));

  // The gore on a hit: a high tearing slash, a ragged wet rip under it, and the blood trickling after.
  const tear = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.02 } });
  const tearBand = new Tone.Filter({ type: "bandpass", frequency: 3500, Q: 1.2 }).connect(out);
  tear.connect(tearBand);
  tear.volume.value = -10;
  const ripBand = new Tone.Filter({ type: "bandpass", frequency: 2200, Q: 2 }).connect(room);
  const ripFlutter = new Tone.Tremolo({ frequency: 38, depth: 0.9 }).connect(ripBand).start(); // the ragged, wet texture
  const rip = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.005, decay: 0.28, sustain: 0, release: 0.05 } }).connect(ripFlutter);
  rip.volume.value = -8;
  const wetBed = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.05, decay: 0.6, sustain: 0, release: 0.1 } })
    .connect(new Tone.Filter({ type: "bandpass", frequency: 3200, Q: 1.5 }).connect(room));
  wetBed.volume.value = -34;
  // The splatter's drops are dry little "tacs", like rain on rock: two synths take turns so they can fall close together.
  const tickBand = new Tone.Filter({ type: "bandpass", frequency: 4000, Q: 1.2 }).connect(out);
  const ticks = [0, 1].map(() => {
    const t = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.014, sustain: 0, release: 0.005 } }).connect(tickBand);
    t.volume.value = -27;
    return t;
  });

  // Clang: inharmonic metal ringing out, in the room.
  // The blades keep vibrating after the blow: a long ring, wavering slowly, in a big room.
  const ringRoom = new Tone.Reverb({ decay: 4.5, wet: 0.5 }).connect(out);
  const waver = new Tone.Tremolo({ frequency: 5.5, depth: 0.45 }).connect(ringRoom).start();
  const metal = new Tone.MetalSynth({
    harmonicity: 5.1, modulationIndex: 24, resonance: 3200, octaves: 1.4,
    envelope: { attack: 0.001, decay: 2.6, release: 1.4 },
  }).connect(waver);
  metal.frequency.value = 330;
  metal.volume.value = -14;

  // Dodge: air, a band of noise sweeping upward.
  const airBand = new Tone.Filter({ type: "bandpass", frequency: 500, Q: 1.4 }).connect(out);
  const air = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.04, decay: 0.2, sustain: 0, release: 0.05 } }).connect(airBand);
  air.volume.value = -6;

  // Rest: a sigh. Soft pink noise through a vowel-like band that sinks as the breath goes, swelling
  // in and fading slowly, with a faint voice under it.
  const sighBand = new Tone.Filter({ type: "bandpass", frequency: 900, Q: 3 }).connect(room);
  const sighHigh = new Tone.Filter({ type: "bandpass", frequency: 2100, Q: 4 }).connect(room);
  const sigh = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.02, decay: 2.2, sustain: 0, release: 0.8 } });
  sigh.connect(sighBand);
  sigh.connect(sighHigh);
  // Bass: the breath's low end, silent unless asked for (the stagger), and a sub-bass body under it.
  const bassGain = new Tone.Gain(0).connect(room);
  sigh.connect(new Tone.Filter({ type: "lowpass", frequency: 260, Q: 0.8 }).connect(bassGain));
  const sub = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 0.3 } }).connect(room);
  sub.volume.value = -40;
  sigh.volume.value = -3;
  const hum = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.15, decay: 1.6, sustain: 0, release: 0.5 } }).connect(room);
  hum.volume.value = -30;

  // The sigh's first instant, the "hh" of breath leaving the lips: loud enough to mark exactly when it starts.
  const puff = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.003, decay: 0.12, sustain: 0, release: 0.02 } })
    .connect(new Tone.Filter({ type: "bandpass", frequency: 2600, Q: 0.7 }).connect(room));
  puff.volume.value = -3;

  // Flame: a hungry whoosh of fire catching, crackling sparks, and a soft low whump.
  const roarBand = new Tone.Filter({ type: "bandpass", frequency: 400, Q: 0.9 }).connect(room);
  const roar = new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.03, decay: 0.55, sustain: 0, release: 0.15 } }).connect(roarBand);
  roar.volume.value = 2;
  const crackleBand = new Tone.Filter({ type: "bandpass", frequency: 5000, Q: 1.1 }).connect(out);
  const crackles = [0, 1].map(() => {
    const c = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.004 } }).connect(crackleBand);
    c.volume.value = -18;
    return c;
  });
  const whump = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 2, envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.05 } }).connect(out);
  whump.volume.value = -6;

  // Fall: a heavy body on the ground.
  const body = new Tone.MembraneSynth({ pitchDecay: 0.12, octaves: 3, envelope: { attack: 0.001, decay: 0.55, sustain: 0, release: 0.1 } }).connect(out);
  body.volume.value = 2;

  return { room, ringRoom, puff, bassGain, sub, roar, roarBand, crackles, crackleBand, whump, thump, slap, tear, tearBand, rip, ripBand, wetBed, ticks, tickBand, metal, air, airBand, sigh, sighBand, sighHigh, hum, body };
}

let tone: ToneModule | null = null;
let bank: ReturnType<typeof build> | null = null;
let ready: Promise<void> | null = null;

/**
 * Fetches Tone.js and builds every synth and the reverb rooms (which take a moment to render).
 * It needs no click, so it's started as early as the main menu: a sound asked for before it's done
 * has to wait for it, and would land late.
 */
function load(): Promise<void> {
  ready ??= import("tone").then(async T => {
    tone = T;
    T.getContext().lookAhead = 0.01; // play the moment a sound is asked for, so it lands with the picture
    bank = build(T);
    await Promise.all([bank.room.ready, bank.ringRoom.ready]);
  });
  return ready;
}

let unlockSet = false;

/**
 * Gets the sounds ready before they are wanted: loads and builds them now, and on the first click or
 * key press (when the browser lets audio start) starts the audio and warms everything up, so the
 * first sound of a fight is as quick as the hundredth.
 */
export const prepare = () => {
  void load();
  if (unlockSet || typeof window === "undefined") return;
  unlockSet = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    void load().then(() => tone!.start()).then(warmUp);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
};

/** Each synth plays one note at a time and refuses a start time that isn't later than its last; nudge ours. */
const lastStart = new Map<object, number>();
function when(synth: object, t: number) {
  const at = Math.max(t, (lastStart.get(synth) ?? 0) + 0.02);
  lastStart.set(synth, at);
  return at;
}

/** How one sigh differs from another. */
interface SighLook {
  /** Loudness, in dB. */
  db: number;
  /** The "hh" of a plosive start. */
  plosive: boolean;
  /** How long it takes to swell in, in seconds. */
  fadeIn: number;
  /** Pitch, as a multiple of the usual (the vowel bands and the voice beneath it). */
  pitch: number;
  /** How much bass is added (0 for none): the breath's low end, and a sub-bass body. */
  bass: number;
}

/**
 * A sigh at `at`. The vowel-like bands sink as the breath goes, and a faint voice hums beneath.
 */
function sigh(b: NonNullable<typeof bank>, at: number, look: SighLook, v: number) {
  const { db, plosive, fadeIn, pitch, bass } = look;
  const start = when(b.sigh, at);
  b.sigh.envelope.attack = fadeIn;
  b.sighBand.frequency.setValueAtTime(900 * pitch, start);
  b.sighBand.frequency.exponentialRampToValueAtTime(480 * pitch, start + 2.4);
  b.sighHigh.frequency.setValueAtTime(2100 * pitch, start);
  b.sighHigh.frequency.exponentialRampToValueAtTime(1200 * pitch, start + 2.4);
  b.sigh.volume.setValueAtTime(db, start);
  b.hum.volume.setValueAtTime(db - 27, start);
  b.bassGain.gain.setValueAtTime(bass, start);
  if (plosive) b.puff.triggerAttackRelease(0.14, when(b.puff, start), v);
  b.sigh.triggerAttackRelease(2.0, start, v);
  b.hum.triggerAttackRelease(190 * pitch, 1.6, when(b.hum, start + 0.1), v);
  b.hum.frequency.exponentialRampToValueAtTime(140 * pitch, start + 1.8);
  if (bass > 0) {
    b.sub.volume.setValueAtTime(-8 + 3 * Math.log2(bass), start);
    b.sub.triggerAttackRelease(62, 1.2, when(b.sub, start), v);
    b.sub.frequency.exponentialRampToValueAtTime(42, start + 1.1);
  } else {
    b.sub.volume.setValueAtTime(-60, start);
  }
}

/** A few pitches for a hit to pick from (multiples of the usual), so it isn't the same every turn. */
const HIT_PITCHES = [0.82, 1, 1.18, 1.38];
let lastHitPitch = 1;

/**
 * A hit: a thump and a slap, a high slash and a ragged rip tearing through, then blood trickling
 * in drops after. It picks one of a few pitches (never the one it used last), and its drops fall
 * at random.
 */
function hit(b: NonNullable<typeof bank>, t: number, v: number) {
  const others = HIT_PITCHES.filter(p => p !== lastHitPitch);
  const pitch = lastHitPitch = others[Math.floor(Math.random() * others.length)];
  b.thump.triggerAttackRelease(32.7 * pitch, 0.2, when(b.thump, t), v);
  b.slap.triggerAttackRelease(0.1, when(b.slap, t), 0.8 * v);
  // The slash: a bright band of noise sweeping up through the blow.
  const cut = when(b.tear, t);
  b.tearBand.frequency.setValueAtTime(3000 * pitch, cut);
  b.tearBand.frequency.exponentialRampToValueAtTime(7500 * pitch, cut + 0.16);
  b.tear.triggerAttackRelease(0.16, cut, v);
  // The rip: flutters just after, lower and wetter.
  const tearAt = when(b.rip, t + 0.03);
  b.ripBand.frequency.setValueAtTime(2600 * pitch, tearAt);
  b.ripBand.frequency.exponentialRampToValueAtTime(1500 * pitch, tearAt + 0.28);
  b.rip.triggerAttackRelease(0.28, tearAt, v);
  // The splatter: barely a wet hiss, then dry "tacs" like rain on rock, scattered and thinning out.
  b.wetBed.triggerAttackRelease(0.5, when(b.wetBed, t + 0.12), 0.8 * v);
  let at = t + 0.18;
  const tacs = 9 + Math.floor(Math.random() * 5);
  for (let i = 0; i < tacs; i++) {
    at += 0.015 + Math.random() * 0.06 + i * 0.012;
    const synth = b.ticks[i % 2];
    const start = when(synth, at);
    // Each strikes the rock a little differently: its own pitch, its own force.
    b.tickBand.frequency.setValueAtTime((2800 + Math.random() * 3200) * pitch, start);
    synth.triggerAttackRelease(0.012, start, (0.35 + Math.random() * 0.65) * (1 - i / (tacs + 2)) * v);
  }
}

/** A narrow range of pitches (multiples of the usual) for every other sound to pick from. */
const VARIETY = [0.94, 1, 1.06];
const lastVariety = new Map<Sfx, number>();

/** One of the pitches, never the one this sound used last. */
function varied(name: Sfx) {
  const others = VARIETY.filter(p => p !== lastVariety.get(name));
  const p = others[Math.floor(Math.random() * others.length)];
  lastVariety.set(name, p);
  return p;
}

/**
 * Schedules one sound, `delay` seconds from now, at `v` of its loudness (0 to 1; 0 runs all of
 * it with no sound, to warm everything up).
 */
function trigger(name: Sfx, delay: number, v: number) {
  const b = bank;
  if (!b || !tone) return;
  const t = tone.immediate() + delay;
  try {
    switch (name) {
      case "hit":
        hit(b, t, v);
        break;
      case "clang":
        b.metal.triggerAttackRelease(261.6 * varied("clang"), 2.6, when(b.metal, t), v);
        break;
      case "dodge": {
        const at = when(b.air, t), p = varied("dodge");
        b.airBand.frequency.setValueAtTime(500 * p, at);
        b.airBand.frequency.exponentialRampToValueAtTime(2600 * p, at + 0.24);
        b.air.triggerAttackRelease(0.24, at, 0.9 * v);
        break;
      }
      case "rest":
        // Soft, higher, no plosive: the breath swells in just slightly.
        sigh(b, t, { db: -9, plosive: false, fadeIn: 0.1, pitch: 1.35 * varied("rest"), bass: 0 }, v);
        break;
      case "stagger":
        // Louder, a clear "hh" at the start, and bass boosted: the wind knocked out of you.
        sigh(b, t, { db: 1, plosive: true, fadeIn: 0.02, pitch: varied("stagger"), bass: 5 }, v);
        break;
      case "flame": {
        const p = varied("flame");
        // The whoosh opens and brightens as the fire takes hold; sparks crackle over it, thinning out.
        const at = when(b.roar, t);
        b.roarBand.frequency.setValueAtTime(350 * p, at);
        b.roarBand.frequency.exponentialRampToValueAtTime(1700 * p, at + 0.4);
        b.roar.triggerAttackRelease(0.5, at, v);
        b.whump.triggerAttackRelease(62 * p, 0.2, when(b.whump, t), 0.8 * v);
        const sparks = 7 + Math.floor(Math.random() * 4);
        let spark = t + 0.04;
        for (let i = 0; i < sparks; i++) {
          spark += 0.02 + Math.random() * 0.06 + i * 0.008;
          const synth = b.crackles[i % 2];
          const start = when(synth, spark);
          b.crackleBand.frequency.setValueAtTime((3000 + Math.random() * 4000) * p, start);
          synth.triggerAttackRelease(0.012, start, (0.3 + Math.random() * 0.7) * (1 - i / (sparks + 2)) * v);
        }
        break;
      }
      case "fall":
        b.body.triggerAttackRelease(27.5 * varied("fall"), 0.5, when(b.body, t), v);
        break;
    }
  } catch {
    // A sound that can't be scheduled just doesn't play.
  }
}

const ALL: Sfx[] = ["hit", "clang", "dodge", "rest", "stagger", "fall", "flame"];

let warmed = false;

/**
 * Runs every sound once, silently, so that nothing is left to prepare when it is first wanted for
 * real (the noise they are made from, each synth's first start). Needs the audio to be running.
 */
function warmUp() {
  if (warmed) return;
  warmed = true;
  for (const name of ALL) trigger(name, 0, 0);
}

/** Plays one sound, `delay` seconds from now. */
export function play(name: Sfx, delay = 0) {
  if (muted) return;
  // (The browser only lets audio start after a click or key press; `start` is instant once it has.)
  void load().then(() => tone!.start()).then(() => {
    warmUp();
    trigger(name, delay, 1);
  });
}

/** The sounds a combat event makes (a stagger or a fall follows the blow that caused it a moment later). */
export function sfxFor(ev: CombatEvent): { name: Sfx; delay: number } | null {
  switch (ev.kind) {
    case "attack":
      return { name: ev.result === "blocked" ? "clang" : ev.result === "dodged" ? "dodge" : ev.fire ? "flame" : "hit", delay: 0 };
    case "burned":
      return { name: "flame", delay: 0.05 };
    case "splash":
      return { name: "flame", delay: 0 };
    case "rest":
      // A Rest sighs as its animation starts (when the attack phase ends and it goes through). A
      // broken one is silent: the blow itself already sounded, in its own step.
      return ev.result === "interrupted" ? null : { name: "rest", delay: 0 };
    case "stagger":
      // The guard breaking: the same breath as a Rest, but louder and with a plosive start (a moment after the blow).
      return { name: "stagger", delay: 0.12 };
    case "fall":
      return { name: "fall", delay: 0.15 };
    case "revive":
      return { name: "rest", delay: 0 };
    default:
      return null;
  }
}
