/**
 * music.ts — the game's music: one track at a time, from `public/music/`, looped, and moved between with slow fades (the old one
 * fading out as the new one fades in). Played through the Web Audio API on its own, not Tone, so a loop can have exact start and
 * end points (the Pus Ridden Beast's two phases are the two halves of one file). Nothing is heard until the first click or key
 * press (the browser's rule): the track asked for waits and starts then. Muted on its own (the speaker by its slider).
 */

/**
 * The tracks. The file, the part of it that loops (seconds; the end defaults to the end of the file), where the first play begins (`startAt`,
 * default: the loop's start), how long before the end of the loop its continuation starts (`overlap`, default `LOOP_OVERLAP`) and how long
 * that continuation takes to fade in (`fadeIn`, default: the overlap; 0 for none, so it comes in at full volume).
 */
const TRACKS = {
  /** The main menu and the tutorial. */
  church: { file: "church.mp3" },
  /** Ordinary fights. It starts 3 seconds in. */
  dungeon: { file: "dungeon.mp3", startAt: 3 },
  /** The lower labyrinth. It starts 3 seconds in. */
  temple: { file: "temple.mp3", startAt: 3 },
  /** The dungeon proper. */
  quella: { file: "quella.mp3" },
  /** The Penitent Warden, phase one: the first 1:25 of the piece, less the half second of silence at the very start. */
  wardenOne: { file: "beast.mp3", loopStart: 0.5, loopEnd: 85, overlap: 7.71, fadeIn: 4 },
  /** The Penitent Warden, phase two: the rest of it. */
  wardenTwo: { file: "beast.mp3", loopStart: 85, overlap: 10, fadeIn: 1 },
} as const;

export type Track = keyof typeof TRACKS;

/**
 * Looping: the continuation starts this many seconds before the end of the loop and fades in gently over the ending, which plays on
 * at full volume to its last moment (it is never faded out). A track may set its own `overlap`.
 */
const LOOP_OVERLAP = 4;

/**
 * A sound is asked to start a little ahead of the audio clock. Asked for "now", it would start at the next moment the browser can
 * (a few milliseconds late, a different number every time), and the continuation, scheduled to the exact second, would land that
 * much early on the ending: the loop's two layers would never line up the same way twice.
 */
const LEAD = 0.1;

/** How long a track takes to fade in or out, in seconds. */
const FADE = 3;
/** The Warden's phase two: what was playing fades out over `fadeOut` seconds at once, and this starts `delay` seconds after, fading in over a second (`fade`): so phase one is still sounding under it for the last `fadeOut - delay` seconds. */
export const PHASE_TWO = { fade: 1, delay: 2, fadeOut: 5 };
/** How loud the music is next to the sounds, with the slider all the way up. */
const LEVEL = 0.55;

const VOLUME_KEY = "music-volume";
/** Where the slider starts when the player has never set it. */
const DEFAULT_VOLUME = 0.5;
/** The slider's setting, 0 to 1 (kept between visits). */
let volume = (() => {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
})();
export const musicVolume = () => volume;
/** (Squared: loudness is felt in steps of ratio, so a straight slider would do almost nothing in its upper half and everything near the bottom.) */
const level = () => (muted ? 0 : LEVEL * volume * volume);

const MUTE_KEY = "music-muted";
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
})();
export const isMusicMuted = () => muted;

/** Mutes or unmutes the music alone (the speaker beside its slider). */
export function setMusicMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* Storage blocked: it lasts until the page closes. */ }
  if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
}

/** Sets the music's volume (0 to 1), at once. */
export function setMusicVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Storage blocked: it lasts until the page closes. */ }
  if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** The track asked for last (`null`: silence), whether or not it has started yet. */
let wanted: Track | null | undefined;
/** Which request is the latest, so a track that finishes loading after another was asked for doesn't start. */
let request = 0;
/** One stretch of a track's file being played, from `offset` to the end of the loop (the next stretch starts before it ends). */
interface Segment { source: AudioBufferSourceNode; startAt: number; offset: number }

let playing: {
  track: Track; gain: GainNode; buffer: AudioBuffer;
  segments: Segment[];
  /** The timer that makes the next stretch ready, and whether this track has been let go (nothing more is made for it). */
  timer?: number; over: boolean;
} | null = null;

/** The track's settings: where it loops, where it first starts, how long the crossfade of its loop is. */
function settingsOf(track: Track, buffer: AudioBuffer) {
  const t: { file: string; loopStart?: number; loopEnd?: number; startAt?: number; overlap?: number; fadeIn?: number } = TRACKS[track];
  const start = t.loopStart ?? 0, end = t.loopEnd ?? buffer.duration;
  const overlap = Math.min(t.overlap ?? LOOP_OVERLAP, (end - start) / 2);
  return { start, end, first: t.startAt ?? start, overlap, fadeIn: Math.min(t.fadeIn ?? overlap, overlap) };
}

/** What is playing and where it is in its loop (for the music viewer), or null in silence. */
export function musicStatus(): { track: Track; position: number; loopStart: number; loopEnd: number } | null {
  if (!ctx || !playing) return null;
  const { start, end } = settingsOf(playing.track, playing.buffer);
  // The newest stretch that has begun.
  const seg = [...playing.segments].reverse().find(sg => sg.startAt <= ctx!.currentTime) ?? playing.segments[0];
  if (!seg) return null;
  const position = Math.min(end, seg.offset + Math.max(0, ctx.currentTime - seg.startAt));
  return { track: playing.track, position, loopStart: start, loopEnd: end };
}

const CURVE_STEPS = 64;
/** A continuation's fade-in: slow at first and at the end (a raised cosine). */
const FADE_IN = Float32Array.from({ length: CURVE_STEPS }, (_, i) => 0.5 - 0.5 * Math.cos((i / (CURVE_STEPS - 1)) * Math.PI));

/**
 * Plays the track from `offset` at audio time `when` to the end of its loop, and makes ready the stretch that follows: it starts
 * `overlap` seconds before this one ends, from the loop's start, fading in over it (this one is not faded out: it ends at full volume).
 * `crossfade`: this stretch is itself a continuation, so it fades in.
 */
function playStretch(p: NonNullable<typeof playing>, when: number, offset: number, crossfade: boolean) {
  const { start, end, overlap, fadeIn } = settingsOf(p.track, p.buffer);
  const c = ctx!;
  const gain = c.createGain();
  const fades = crossfade && fadeIn > 0;
  gain.gain.value = fades ? 0 : 1;
  gain.connect(p.gain);
  const source = c.createBufferSource();
  source.buffer = p.buffer;
  source.connect(gain);
  const endAt = when + (end - offset);
  if (fades) gain.gain.setValueCurveAtTime(FADE_IN, when, fadeIn);
  source.start(when, offset);
  source.stop(endAt);
  // (Only the last few stretches are kept: the older ones have finished.)
  p.segments = [...p.segments, { source, startAt: when, offset }].slice(-3);
  // The next stretch is made a couple of seconds before it starts, so a track that is let go meanwhile makes nothing more.
  const nextAt = endAt - overlap;
  p.timer = window.setTimeout(() => {
    if (p.over || playing !== p) return;
    playStretch(p, nextAt, start, true);
  }, Math.max(0, (nextAt - c.currentTime - 2) * 1000));
}

/** Lets this track go: it fades over `seconds` (from `delay`) and everything it has scheduled stops after. */
function letGo(p: NonNullable<typeof playing>, seconds: number, delay = 0) {
  p.over = true;
  window.clearTimeout(p.timer);
  ramp(p.gain, 0, seconds, delay);
  for (const sg of p.segments) { try { sg.source.stop(ctx!.currentTime + delay + seconds + 0.1); } catch { /* Already stopped. */ } }
}

/** Jumps what is playing to `seconds` before the end of its loop, to hear how it comes round (the music viewer). */
export function seekToLoopEnd(seconds = 15) {
  if (!ctx || !playing) return;
  const p = playing;
  const { start, end } = settingsOf(p.track, p.buffer);
  window.clearTimeout(p.timer);
  for (const sg of p.segments) { try { sg.source.stop(); } catch { /* Already stopped. */ } }
  p.segments = [];
  playStretch(p, ctx.currentTime + LEAD, Math.max(start, end - seconds), false);
}

const buffers = new Map<string, Promise<AudioBuffer>>();

function context() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    // Sound is allowed from the first click or key press.
    const wake = () => { void ctx!.resume(); };
    for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, wake, { capture: true });
  }
  return { ctx, master: master! };
}

/** Fetches and decodes a track now, so that it starts the moment it is asked for. (The Warden's two halves are one file.) A failure is left for `playMusic` to meet. */
export function preloadMusic(track: Track): Promise<void> {
  return load(TRACKS[track].file).then(() => undefined, () => undefined);
}

function load(file: string) {
  let buf = buffers.get(file);
  if (!buf) {
    const { ctx } = context();
    buf = fetch(`/music/${file}`).then(r => r.arrayBuffer()).then(data => ctx.decodeAudioData(data));
    buffers.set(file, buf);
    buf.catch(() => buffers.delete(file));
  }
  return buf;
}

/** Lets a source's gain ramp to `to` over `seconds` from wherever it is now. */
function ramp(gain: GainNode, to: number, seconds: number, delay = 0) {
  const at = ctx!.currentTime + delay;
  gain.gain.cancelScheduledValues(at);
  gain.gain.setValueAtTime(gain.gain.value, at);
  gain.gain.linearRampToValueAtTime(to, at + seconds);
}

/**
 * Plays this track, fading to it from whatever is playing (`null`: fades to silence). Asking for the track already playing
 * does nothing, so screens may ask as often as they like. `fade`: seconds the change takes. With `delay`, the new track starts
 * that many seconds later, and what was playing is already fading out (over `fadeOut`) in the meantime.
 */
export function playMusic(track: Track | null, fade: number = FADE, { delay = 0, fadeOut = fade }: { delay?: number; fadeOut?: number } = {}) {
  if (wanted === track) return;
  wanted = track;
  const mine = ++request;
  const { ctx, master } = context();
  const old = playing;
  if (!track) {
    if (old) { letGo(old, fade); playing = null; }
    return;
  }
  const t = TRACKS[track];
  if (delay > 0 && old) { letGo(old, fadeOut); playing = null; }
  load(t.file).then(buffer => {
    if (mine !== request) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const p: NonNullable<typeof playing> = { track, gain, buffer, segments: [], over: false };
    const { first } = settingsOf(track, buffer);
    playStretch(p, ctx.currentTime + LEAD + delay, first, false);
    ramp(gain, 1, fade, LEAD + delay);
    // The one that was playing goes out as this one comes in.
    if (playing) letGo(playing, fade);
    playing = p;
  }).catch(() => { /* No file or no decoder: the game goes on in silence. */ });
}
