/**
 * music.ts — the game's music: one track at a time, from `public/music/`, looped, and moved between with slow fades (the old one
 * fading out as the new one fades in). Played through the Web Audio API on its own, not Tone, so a loop can have exact start and
 * end points (the Pus Ridden Beast's two phases are the two halves of one file). Nothing is heard until the first click or key
 * press (the browser's rule): the track asked for waits and starts then. Muted with the sounds (see `sfx.ts`).
 */
import { isMuted, onMute } from "./sfx";

/** The tracks. The file, and the part of it that loops (seconds; the end defaults to the end of the file). */
const TRACKS = {
  /** The main menu and the tutorial. */
  church: { file: "church.mp3" },
  /** Ordinary fights. */
  dungeon: { file: "dungeon.mp3" },
  /** The lower labyrinth. */
  temple: { file: "temple.mp3" },
  /** The dungeon proper. */
  quella: { file: "quella.mp3" },
  /** The Penitent Warden, phase one: the first 1:25 of the piece. */
  wardenOne: { file: "beast.mp3", loopStart: 0, loopEnd: 85 },
  /** The Penitent Warden, phase two: the rest of it. */
  wardenTwo: { file: "beast.mp3", loopStart: 85 },
} as const;

export type Track = keyof typeof TRACKS;

/** How long a track takes to fade in or out, in seconds. */
const FADE = 3;
/** The Warden's phase two: what was playing fades out over `fadeOut` seconds at once, and this starts, with no fade, `delay` seconds after. */
export const PHASE_TWO = { fade: 0.02, delay: 2, fadeOut: 2 };
/** How loud the music is next to the sounds, with the slider all the way up. */
const LEVEL = 0.55;

const VOLUME_KEY = "music-volume";
/** The slider's setting, 0 to 1 (kept between visits). */
let volume = (() => {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
})();
export const musicVolume = () => volume;
/** (Squared: loudness is felt in steps of ratio, so a straight slider would do almost nothing in its upper half and everything near the bottom.) */
const level = () => (isMuted() ? 0 : LEVEL * volume * volume);

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
let playing: { track: Track; gain: GainNode; source: AudioBufferSourceNode } | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function context() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
    onMute(() => master!.gain.setTargetAtTime(level(), ctx!.currentTime, 0.03));
    // Sound is allowed from the first click or key press.
    const wake = () => { void ctx!.resume(); };
    for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, wake, { capture: true });
  }
  return { ctx, master: master! };
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
    if (old) { ramp(old.gain, 0, fade); old.source.stop(ctx.currentTime + fade + 0.1); playing = null; }
    return;
  }
  const t = TRACKS[track];
  if (delay > 0 && old) { ramp(old.gain, 0, fadeOut); old.source.stop(ctx.currentTime + fadeOut + 0.1); playing = null; }
  load(t.file).then(buffer => {
    if (mine !== request) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const loopStart = "loopStart" in t ? t.loopStart : 0;
    source.loopStart = loopStart;
    source.loopEnd = "loopEnd" in t ? t.loopEnd : buffer.duration;
    source.connect(gain);
    source.start(ctx.currentTime + delay, loopStart);
    ramp(gain, 1, fade, delay);
    // The one that was playing goes out as this one comes in.
    if (playing) { ramp(playing.gain, 0, fade); playing.source.stop(ctx.currentTime + fade + 0.1); }
    playing = { track, gain, source };
  }).catch(() => { /* No file or no decoder: the game goes on in silence. */ });
}
