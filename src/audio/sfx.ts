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

export type Sfx = "hit" | "clang" | "dodge" | "rest" | "stagger" | "fall" | "flame" | "tic" | "tac" | "string" | "stringBoss" | "stringBossNote" | "eternity" | "eternityDeath";

const MUTE_KEY = "sfx-muted";

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

/** Who else must hear of a change of the mute (the music). */
const muteListeners: (() => void)[] = [];
export const onMute = (fn: () => void) => { muteListeners.push(fn); };

export function setMuted(v: boolean) {
  muted = v;
  muteListeners.forEach(fn => fn());
  applyLevel();
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked: the choice just lasts until the page closes.
  }
}

const VOLUME_KEY = "sfx-volume";
/** The sounds' slider, 0 to 1 (kept between visits). */
let volume = (() => {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
})();
export const sfxVolume = () => volume;

/** Sets the sounds' volume (0 to 1), at once. */
export function setSfxVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  applyLevel();
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Storage blocked: it lasts until the page closes. */ }
}

/** The speakers' level: the slider (squared, like the music's) on top of the sounds' own -4 dB, and the mute. */
function applyLevel() {
  if (!tone) return;
  const dest = tone.getDestination();
  dest.volume.value = -4 + 20 * Math.log10(Math.max(volume * volume, 1e-4));
  dest.mute = muted || volume === 0;
}

let master: InstanceType<ToneModule["Gain"]> | null = null;

/**
 * Where every sound goes, the combat's and the map's: a soft echo, then a low-pass that muffles all of it (the echoes too), as if
 * heard through stone, then the speakers.
 */
export function masterBus(Tone: ToneModule) {
  if (!master) {
    const input = new Tone.Gain(0.85);
    const echo = new Tone.FeedbackDelay({ delayTime: 0.24, feedback: 0.34, wet: 0.3 });
    const muffle = new Tone.Filter({ type: "lowpass", frequency: 2300, Q: 0.4 });
    input.chain(echo, muffle, Tone.getDestination());
    master = input;
  }
  return master;
}

/** Every synth, built once on first use and wired to the speakers. */
function build(Tone: ToneModule) {
  applyLevel();
  const out = masterBus(Tone);
  // A good deal of room around the metal and the breath.
  const room = new Tone.Reverb({ decay: 2.2, wet: 0.36 }).connect(out);

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

  // The menus' sounds. Tic (changing option): a very faint, dry click. Tac (choosing): a firmer knock.
  // (Straight to the speakers: `out` has the world's echo and muffling on it, which these don't want.)
  const dry = Tone.getDestination();
  const tic = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.02, sustain: 0, release: 0.005 } })
    .connect(new Tone.Filter({ type: "bandpass", frequency: 3400, Q: 1.4 }).connect(dry));
  tic.volume.value = -20;
  const tacKnock = new Tone.MembraneSynth({ pitchDecay: 0.012, octaves: 2.5, envelope: { attack: 0.0005, decay: 0.07, sustain: 0, release: 0.02 } }).connect(dry);
  tacKnock.volume.value = -9;
  const tacClick = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.0005, decay: 0.025, sustain: 0, release: 0.005 } })
    .connect(new Tone.Filter({ type: "bandpass", frequency: 2200, Q: 1 }).connect(dry));
  tacClick.volume.value = -14;

  // String flying through the air: a wisp of breath rising through a band of noise, and a faint high shimmer over it, both ethereal in the room.
  // Several strings may fly at once, so the wisps take turns among a few voices of their own (each with its own filter): one filter swept by
  // two overlapping wisps, or one voice cut short by the next, would only garble them.
  const wisps = Array.from({ length: 4 }, () => {
    const band = new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 2.5 }).connect(room);
    const noise = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.3, decay: 1.2, sustain: 0, release: 0.5 } }).connect(band);
    noise.volume.value = -24;
    return { noise, band };
  });
  const shimmer = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.25, decay: 1.4, sustain: 0, release: 0.8 } }).connect(room);
  shimmer.volume.value = -27;
  // A boss's String (stringBoss, once for the whole burst) is one long swell of breath and a low rising hum drowned in a long echo, and over it
  // each of its strings (stringBossNote) is a hushed, wavering note ringing out in the same echo.
  const bossRoom = new Tone.Reverb({ decay: 6.5, wet: 0.85 }).connect(out);
  const breathBand = new Tone.Filter({ type: "bandpass", frequency: 700, Q: 1.1 }).connect(bossRoom);
  const breath = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.9, decay: 2.4, sustain: 0, release: 1.2 } }).connect(breathBand);
  breath.volume.value = -17;
  const hissBand = new Tone.Filter({ type: "highpass", frequency: 3200, Q: 0.5 }).connect(bossRoom);
  const hiss = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 1.1, decay: 2.2, sustain: 0, release: 1.0 } }).connect(hissBand);
  hiss.volume.value = -34;
  const swell = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 1.3, decay: 2.6, sustain: 0, release: 1.0 } }).connect(bossRoom);
  swell.volume.value = -20;
  const choir = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.35, decay: 2.2, sustain: 0, release: 1.3 } }).connect(bossRoom);
  choir.volume.value = -27;

  return { wisps, shimmer, bossRoom, breath, breathBand, hiss, swell, choir, tic, tacKnock, tacClick, room, ringRoom, puff, bassGain, sub, roar, roarBand, crackles, crackleBand, whump, thump, slap, tear, tearBand, rip, ripBand, wetBed, ticks, tickBand, metal, air, airBand, sigh, sighBand, sighHigh, hum, body };
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
    await Promise.all([bank.room.ready, bank.ringRoom.ready, bank.bossRoom.ready]);
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
  // (Tone moves a start that is already past up to the audio clock's present; two such starts in one instant would be the same time, which a
  // synth refuses, so we stay ahead of the clock ourselves and keep each start strictly after the last.)
  const at = Math.max(t, (tone?.getContext().currentTime ?? 0) + 0.005, (lastStart.get(synth) ?? 0) + 0.02);
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

/** Which of the wisps' voices goes next. */
let wispNext = 0;

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
      case "string": {
        // A wisp rising through the air as it flies (on the next voice in turn), and a high note shimmering over it.
        const w = b.wisps[wispNext++ % b.wisps.length], p = varied("string"), at = when(w.noise, t);
        w.band.frequency.setValueAtTime(900 * p, at);
        w.band.frequency.exponentialRampToValueAtTime(3400 * p, at + 1.4);
        w.noise.triggerAttackRelease(1.4, at, 0.8 * v);
        const notes = [784, 988, 1175, 1568];
        b.shimmer.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)] * p, 1.2, t + 0.05, 0.7 * v);
        break;
      }
      case "stringBoss": {
        // The burst as a whole: a slow swell of breath rising through the dark with a thin hiss on top, and a low hum climbing under it.
        const p = varied("stringBoss"), at = when(b.breath, t);
        b.breathBand.frequency.setValueAtTime(320 * p, at);
        b.breathBand.frequency.exponentialRampToValueAtTime(1500 * p, at + 3);
        b.breath.triggerAttackRelease(3, at, v);
        b.hiss.triggerAttackRelease(2.6, when(b.hiss, t + 0.1), v);
        b.swell.triggerAttackRelease(55 * p, 3, when(b.swell, t), 0.9 * v);
        b.swell.frequency.exponentialRampToValueAtTime(110 * p, at + 2.8);
        break;
      }
      case "stringBossNote": {
        // One of the boss's strings: a hushed note, ringing out in the long echo (a different one each time, from a minor pentatonic).
        const notes = [196, 233, 262, 311, 349, 392, 466, 523];
        const note = notes[Math.floor(Math.random() * notes.length)] * varied("stringBossNote");
        b.choir.triggerAttackRelease(note, 1.8, t, 0.75 * v);
        break;
      }
      case "eternity": {
        // An eternal effect taking hold: a short, bright wisp rising through the air, with a high chime over it, close kin of the String's.
        const w = b.wisps[wispNext++ % b.wisps.length], p = varied("eternity"), at = when(w.noise, t);
        w.band.frequency.setValueAtTime(1300 * p, at);
        w.band.frequency.exponentialRampToValueAtTime(4200 * p, at + 0.8);
        w.noise.triggerAttackRelease(0.8, at, 0.75 * v);
        const notes = [1175, 1568, 1760, 2093];
        b.shimmer.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)] * p, 0.9, t + 0.03, 0.65 * v);
        break;
      }
      case "eternityDeath": {
        // The same, paid in Death: the wisp sinks instead of rising, low and dull, with a dark note ringing under it in the long echo.
        const w = b.wisps[wispNext++ % b.wisps.length], p = varied("eternityDeath"), at = when(w.noise, t);
        w.band.frequency.setValueAtTime(900 * p, at);
        w.band.frequency.exponentialRampToValueAtTime(330 * p, at + 0.9);
        w.noise.triggerAttackRelease(0.9, at, 0.85 * v);
        const notes = [147, 175, 196, 233];
        b.choir.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)] * p, 1.4, t + 0.02, 0.7 * v);
        b.shimmer.triggerAttackRelease(392 * p, 0.8, t + 0.03, 0.3 * v);
        break;
      }
      case "tic":
        b.tic.triggerAttackRelease(0.02, when(b.tic, t), v);
        break;
      case "tac":
        b.tacKnock.triggerAttackRelease(190, 0.08, when(b.tacKnock, t), v);
        b.tacClick.triggerAttackRelease(0.025, when(b.tacClick, t), v);
        break;
    }
  } catch (err) {
    // A sound that can't be scheduled doesn't play; say so in the console instead of vanishing without a trace. (It is not retried: part of it
    // may already have sounded, and a second go would play that part twice.)
    console.warn(`[sfx] "${name}" could not be scheduled:`, err);
  }
}

const ALL: Sfx[] = ["hit", "clang", "dodge", "rest", "stagger", "fall", "flame", "tic", "tac", "string", "stringBoss", "stringBossNote", "eternity", "eternityDeath"];

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
    case "eternal":
      // An eternal weapon's effect, just after its blow: the chisel bites again, the torch's wax hisses, the hammer rings on the guard.
      return { name: ev.effect === "chisel" || ev.effect === "axe" || ev.effect === "sickle" ? "hit" : ev.effect === "torch" ? "flame" : ev.effect === "shortsword" ? "dodge" : "clang", delay: 0.08 };
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

/** The sound an eternal effect makes as it takes hold, over the effect's own: a wisp like the String's, lower and darker when it was paid in Death. */
export function eternalSfx(ev: Extract<CombatEvent, { kind: "eternal" }>): { name: Sfx; delay: number } {
  return { name: ev.death > 0 ? "eternityDeath" : "eternity", delay: 0.1 };
}
