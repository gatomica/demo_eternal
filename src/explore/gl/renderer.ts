/**
 * gl/renderer.ts — the map drawn with WebGL.
 *
 * The map is painted once, in pages (see `regions` and `bake`), and each page goes to the graphics
 * card as a texture. A frame is then a handful of quads per level, in the order the 2D renderer
 * draws: each level's walls, its floors, the cliffs hanging from them, and whoever stands there,
 * then the next level up. Nothing about the light is worked out per tile on the screen: it is
 * worked out per pixel by the fragment shader, from a few small textures that say how brightly each
 * tile is seen (and which doorway it is seen through, and which walls and cliffs show at all), and
 * from the circle of your sight. The pages are drawn whole, lit or not; the shader cuts the light.
 *
 * The rules about what you see are the 2D renderer's (sight, the room you stand in, which walls
 * face the light); only how they are drawn differs. Walls and cliffs that are cut off by the light
 * fade to black, and floors always draw (dark ones black), so a floor still hides what is under it.
 */
import { BAKE_ALL_SHARE, BAKE_BUDGET, bake, bakedBytes, estimateBytes, isBaked } from "../bake";
import { CHUNK_PAD_TOP, ladderLook, makeCanvas } from "../paint";
import { HIDE_WALLS_ABOVE } from "../plans";
import { PAGES, PAGES_OF_LEVEL, type Page } from "../regions";
import { type Line, LINES, lampCenter, ROOM, ROOM_COUNT, ROOM_TILES } from "../rooms";

/** How bright a wall is, at this fade (1 on your level, 0 where it is gone): full for most of the way, then twilight on the last level before it is gone, like the floors there, so the cut to darkness is not sudden. */
const wallTone = (fade: number) => Math.min(1, fade * 2.5);

/** Every ladder, drawn over everything else on the map (a ladder is on top of whatever wall it climbs). */
const LADDER_LIST = ladderTiles();
/** The columns of the drop ladders (`DROP_LADDER_LIST`), which the painted pages may not have. */
const DROP_TILES = new Set(DROP_LADDER_LIST.map(d => `${d.x},${d.y}`));

/** Per room, its lines grouped by where they lie: a wall a room has on several levels is one group. */
const GROUPS: (Line[][] | undefined)[] = [];
const groupsOf = (room: number) => {
  let g = GROUPS[room];
  if (!g) {
    const by = new Map<string, Line[]>();
    for (const l of LINES[room]) {
      const key = `${l.ax},${l.ay},${l.bx},${l.by},${l.other}`;
      const list = by.get(key);
      if (list) list.push(l); else by.set(key, [l]);
    }
    g = GROUPS[room] = [...by.values()];
  }
  return g;
};
import { seeThrough } from "../sight";
import { BODY_ABOVE_FEET, COLORS, GHOST_ALPHA, MAX_PIXEL_RATIO, RENDER_SCALE, RISE, SIGHT_EASE, TILES_TALL, VISION_FADE, VISION_RADIUS, lampRadius, wallFade } from "../tuning";
import type { Light, MapRenderer, View } from "../view";
import { groupRows, WALL_TILES } from "../view";
import { isDev } from "../../ui/dev";
import { blackAt, openAboveAt, ladderTiles, DROP_LADDER_LIST, raisedLadderAt, rampishAt, barsAt, CLIFFS, DIAG, diagSide, FLOOR, isHoleDiag, levelOf, LEVELS, onShaftOpen, roomLimit, shaftDiagSide, slopeAt, STAIRS, tileAt, WALL, wallFacesInto, WORLD } from "../world";
import { createStatsOverlay } from "./stats";

const VERTEX = `#version 300 es
in vec2 aCorner;
uniform vec4 uRect;
uniform vec4 uUv;
uniform vec2 uScreen;
out vec2 vUv;
out vec2 vPx;
void main() {
  vec2 px = uRect.xy + aCorner * uRect.zw;
  vPx = px;
  vUv = mix(uUv.xy, uUv.zw, aCorner);
  gl_Position = vec4(px.x / uScreen.x * 2.0 - 1.0, 1.0 - px.y / uScreen.y * 2.0, 0.0, 1.0);
}`;

/**
 * uKind: 0 a floor, 1 walls, 2 cliffs (all lit by the light), 3 a plain picture (actors).
 * The light: how brightly the tile is seen (smoothly between tiles for a floor, from the wall light
 * for walls and cliffs, which also show only where they are marked to) x the circle of your sight x
 * the circle of the doorway it is seen through, if any, x the level's tone.
 */
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2D uTex;
uniform sampler2DArray uLight;
uniform sampler2DArray uOrigin;
uniform sampler2DArray uSplit;
uniform sampler2DArray uAltLight;
uniform sampler2DArray uAltLamp;
uniform sampler2DArray uRise;
uniform sampler2DArray uCliffLamp;
uniform int uKind;
uniform int uLevel;
uniform vec2 uPlane;
uniform vec2 uMap;
uniform vec2 uPlayer;
uniform float uT;
uniform float uTone;
uniform float uCircle;
uniform float uRadius;
uniform float uFade;
uniform float uDebug;
in vec2 vUv;
in vec2 vPx;
out vec4 outColor;

ivec2 tileOf(vec2 cell) {
  return clamp(ivec2(floor(cell)), ivec2(0), ivec2(uMap) - 1);
}

void main() {
  vec4 c = texture(uTex, vUv);
  if (c.a <= 0.002) discard;
  if (uKind == 3) {
    outColor = vec4(c.rgb * uTone, c.a);
    return;
  }
  vec2 cell = (vPx - uPlane) / uT;
  vec2 muv = cell / uMap;
  ivec2 tc = tileOf(cell);
  float base;
  ivec2 lampTc = tc;
  ivec2 cliffTc = tc;
  // A tile a slanted line cuts through is two rooms': the half beyond the line has light data of its own.
  bool alt = false;
  if (uKind == 0) {
    vec4 cutBy = texelFetch(uSplit, ivec3(tc, uLevel), 0);
    vec2 at = cell;
    // The top of a stair (and of bars, and the tilt beside diagonal stairs) rises over the tile behind it: a pixel there, in a cell that is not lit itself, belongs to the tile south of it and is lit as that tile is (and cut by that tile's line, not by the cell's: else a half of the stair goes dark).
    ivec2 dataTc = tc;
    // (Whether the pixel is lit by its own cell, whichever half of a cut cell it is in: only a pixel its own cell leaves dark may be a stair's.)
    bool ownAlt = cutBy.w > 0.5 && dot(cutBy.xy, cell) - cutBy.z > 0.0;
    float ownBase = ownAlt ? texelFetch(uAltLight, ivec3(tc, uLevel), 0).r : texelFetch(uLight, ivec3(tc, uLevel), 0).r;
    if (ownBase < 0.5) {
      ivec2 below = tileOf(cell + vec2(0.0, 1.0));
      if (texelFetch(uRise, ivec3(below, uLevel), 0).r > 0.5) {
        dataTc = below;
        cutBy = texelFetch(uSplit, ivec3(below, uLevel), 0);
        at = cell + vec2(0.0, 0.5);
      }
    }
    alt = cutBy.w > 0.5 && dot(cutBy.xy, at) - cutBy.z > 0.0;
    lampTc = dataTc;
    // All or nothing: the rule of rooms says whether a tile is lit. Every soft edge is a circle, below.
    base = alt ? texelFetch(uAltLight, ivec3(dataTc, uLevel), 0).r : texelFetch(uLight, ivec3(dataTc, uLevel), 0).r;
  } else {
    ivec2 south = tileOf(cell + vec2(0.0, 1.0));
    vec4 a = texelFetch(uLight, ivec3(tc, uLevel), 0);
    vec4 b = texelFetch(uLight, ivec3(south, uLevel), 0);
    float own = uKind == 1 ? a.g : a.b;
    float below = uKind == 1 ? b.g : b.b;
    float show = max(own, below);
    // (Marked where the tile in front of it is in the room's whitelist, so a wall shows only where its room does.)
    if (show < 0.004) discard;
    base = show;
    // The doorway that lights it is the one lighting the floor in front of the wall. For a pixel of the wall's own cell that is the tile south of it; for one in the cell above (the wall's top edge, or the upper half of a diagonal's band), the wall is the cell south of it and the floor is a cell further.
    lampTc = own >= below ? south : tileOf(cell + vec2(0.0, 2.0));
    cliffTc = own >= below ? tc : south;
  }
  // How far the tile's room is revealed (1 for your room; less while it fades in or out as you change rooms, the whole room together; 0 for a neighbour's tile), and the light of the doorway it is seen through, if any: its centre (in tiles), its radius, and 1 if there is one.
  float reveal;
  vec4 L;
  if (uKind == 2) {
    // A cliff is lit as the ledge it hangs from is (the record is kept at the cliff's own tile, with the light's centre moved to this level's plane): reveal, and the doorway's light.
    vec4 rec = texelFetch(uCliffLamp, ivec3(cliffTc, uLevel), 0);
    reveal = rec.w;
    // (No record at all: lit as its room is, as cliffs were before.)
    if (rec.w <= 0.0 && rec.z <= 0.0) reveal = 1.0;
    L = vec4(rec.xyz, rec.z > 0.0 ? 1.0 : 0.0);
  } else {
    reveal = alt ? texelFetch(uAltLight, ivec3(lampTc, uLevel), 0).a : texelFetch(uLight, ivec3(lampTc, uLevel), 0).a;
    L = alt ? texelFetch(uAltLamp, ivec3(lampTc, uLevel), 0) : texelFetch(uOrigin, ivec3(lampTc, uLevel), 0);
  }
  float lamp = 0.0;
  if (L.w > 0.5) {
    vec2 centre = uPlane + L.xy * uT;
    lamp = clamp((L.z * uT - length(vPx - centre)) / (uFade * uT), 0.0, 1.0);
  }
  float circle = 1.0;
  if (uCircle > 0.5) circle = clamp((uRadius * uT - length(vPx - uPlayer)) / (uFade * uT), 0.0, 1.0);
  float room = mix(lamp, 1.0, reveal);
  float light = base * circle * room * uTone;
  outColor = vec4(c.rgb * light, c.a);
  if (uDebug > 0.5) {
    // Where the light comes from: green your room's, blue a doorway's (so a preview); and, dim magenta, what the room rule lets in but the light leaves dark.
    vec3 tint = L.w > 0.5 ? vec3(0.15, 0.45, 1.0) : vec3(0.15, 1.0, 0.25);
    float shown = max(light, base > 0.003 ? 0.18 : 0.0);
    if (light < 0.003 && base > 0.003) tint = vec3(1.0, 0.1, 0.9);
    outColor = vec4(tint * shown * c.a, c.a);
  }
}`;

/** The most memory the textures on the card may take, in bytes, before the least recently used go. */
const TEXTURE_BUDGET = 384 * 1024 * 1024;

type Kind = "surface" | "walls" | "cliffs";

/** The colour of the void as the three numbers WebGL wants. */
const VOID_RGB = [1, 3, 5].map(i => parseInt(COLORS.void.slice(i, i + 2), 16) / 255);

/** The WebGL map renderer, or null where the browser can't give one. */
export function createGLRenderer(canvas: HTMLCanvasElement): MapRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const { w: MW, h: MH } = WORLD;
  const N = MW * MH;
  let T = 0;
  let frameNo = 0;
  let lost = false;

  // --- The program and what it draws with. -------------------------------------------------------
  let program: WebGLProgram;
  let U: Record<string, WebGLUniformLocation | null> = {};
  let lightArr: WebGLTexture, originArr: WebGLTexture, splitArr: WebGLTexture, altLightArr: WebGLTexture, altLampArr: WebGLTexture, riseArr: WebGLTexture, cliffLampArr: WebGLTexture, actorTex: WebGLTexture;
  let actorTexSize = "";
  const texCache = new Map<HTMLCanvasElement, { tex: WebGLTexture; bytes: number; last: number }>();
  let texBytes = 0;

  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Map shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const dataTexture = (target: number, internal: number, layers: number) => {
    const t = gl.createTexture()!;
    gl.bindTexture(target, t);
    if (target === gl.TEXTURE_2D_ARRAY) gl.texStorage3D(target, 1, internal, MW, MH, layers);
    else gl.texStorage2D(target, 1, internal, MW, MH);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const init = () => {
    program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(program, 0, "aCorner");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Map program: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);
    U = {};
    for (const name of ["uRect", "uUv", "uScreen", "uTex", "uLight", "uOrigin", "uSplit", "uAltLight", "uAltLamp", "uRise", "uCliffLamp", "uKind", "uLevel", "uPlane", "uMap", "uPlayer", "uT", "uTone", "uCircle", "uRadius", "uFade", "uDebug"]) U[name] = gl.getUniformLocation(program, name);
    // One quad: its corners, scaled and placed by uniforms.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // How brightly each tile is seen: the floor's light, and which walls and cliffs show, per level (x, y, level); where its light comes from; the wall light.
    lightArr = dataTexture(gl.TEXTURE_2D_ARRAY, gl.RGBA8, LEVELS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    originArr = dataTexture(gl.TEXTURE_2D_ARRAY, gl.RGBA32F, LEVELS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // For the tiles a slanted line cuts through: the line (n . p = d, with the flag), and the light data of the half beyond it (as the first two arrays, but for that half).
    for (const [name, format] of [["split", gl.RGBA32F], ["altLight", gl.RGBA8], ["altLamp", gl.RGBA32F]] as const) {
      const t = dataTexture(gl.TEXTURE_2D_ARRAY, format, LEVELS);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      if (name === "split") splitArr = t; else if (name === "altLight") altLightArr = t; else altLampArr = t;
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // For each cliff tile: the light of the ledge it hangs from (centre in this level's plane, radius, and how far its room is revealed).
    cliffLampArr = dataTexture(gl.TEXTURE_2D_ARRAY, gl.RGBA32F, LEVELS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Which tiles rise above their own cell (stairs, the tilt beside diagonal stairs, bars): 1 for those. It never changes.
    riseArr = dataTexture(gl.TEXTURE_2D_ARRAY, gl.R8, LEVELS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    for (let z = 0; z < LEVELS; z++) {
      const rises = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const x = i % MW, y = (i - x) / MW;
        if (tileAt(z, x, y) === STAIRS || slopeAt(z, x, y) || barsAt(z, x, y)) rises[i] = 255;
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RED, gl.UNSIGNED_BYTE, rises);
    }
    actorTex = gl.createTexture()!;
    actorTexSize = "";
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(U.uTex, 0);
    gl.uniform1i(U.uLight, 1);
    gl.uniform1i(U.uOrigin, 2);
    gl.uniform1i(U.uSplit, 3);
    gl.uniform1i(U.uAltLight, 4);
    gl.uniform1i(U.uAltLamp, 5);
    gl.uniform1i(U.uRise, 6);
    gl.uniform1i(U.uCliffLamp, 7);
    gl.uniform2f(U.uMap, MW, MH);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, lightArr);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, originArr);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, splitArr);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, altLightArr);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, altLampArr);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, riseArr);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, cliffLampArr);
    gl.activeTexture(gl.TEXTURE0);
  };
  init();
  const onLost = (e: Event) => { e.preventDefault(); lost = true; };
  const onRestored = () => {
    texCache.clear();
    texBytes = 0;
    init();
    sightKey = "";
    lost = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  /** Runs an upload of a canvas, which comes in with its colours multiplied by its opacity, as the blending below wants them (set only for the upload: typed-array uploads of the light don't take it). */
  const uploadPicture = (upload: () => void) => {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    upload();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  };

  /** The texture of a baked picture on the card, sent the first time it is needed. */
  const textureOf = (picture: HTMLCanvasElement) => {
    let e = texCache.get(picture);
    if (!e) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      uploadPicture(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      e = { tex, bytes: picture.width * picture.height * 4, last: frameNo };
      texCache.set(picture, e);
      texBytes += e.bytes;
    }
    e.last = frameNo;
    return e.tex;
  };
  /** Lets go of the textures used longest ago while there are too many (never ones used this frame). */
  const trimTextures = () => {
    if (texBytes <= TEXTURE_BUDGET) return;
    const old = [...texCache.entries()].filter(([, e]) => e.last < frameNo).sort((a, b) => a[1].last - b[1].last);
    for (const [picture, e] of old) {
      if (texBytes <= TEXTURE_BUDGET) break;
      gl.deleteTexture(e.tex);
      texCache.delete(picture);
      texBytes -= e.bytes;
    }
  };
  const dropTextures = () => {
    for (const e of texCache.values()) gl.deleteTexture(e.tex);
    texCache.clear();
    texBytes = 0;
  };

  // --- The canvas and its size. -------------------------------------------------------------------
  // Where actors are drawn (with an ordinary 2D context) before going up as a picture.
  const actors = makeCanvas(1, 1);
  const ag = actors.getContext("2d")!;
  const ghostCanvas = document.createElement("canvas"), ghostCtx = ghostCanvas.getContext("2d")!;
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * RENDER_SCALE;
    const width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
    if (width === canvas.width && height === canvas.height && T) return;
    canvas.width = width;
    canvas.height = height;
    actors.width = width;
    actors.height = height;
    gl.viewport(0, 0, width, height);
    sightKey = "";
    const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
    if (next !== T) {
      T = next;
      dropTextures();
    }
  };

  // --- What sight shows, worked out here and sent up as small textures. ---------------------------
  // Which walls and cliffs of each level show (255) or not (0).
  const wallShow = WORLD.levels.map(() => new Uint8Array(N));
  const cliffShow = WORLD.levels.map(() => new Uint8Array(N));
  const anyWalls: boolean[] = WORLD.levels.map(() => false);
  const anyCliffs: boolean[] = WORLD.levels.map(() => false);
  const inSight: boolean[] = WORLD.levels.map(() => false);
  // What you see by the rule of rooms: the tiles of your room, and the tiles of its neighbours that the light of a doorway reaches (all or nothing); which doorway lights each; and how far its room is revealed.
  const roomAllowed = WORLD.levels.map(() => new Uint8Array(N));
  const roomReveal = WORLD.levels.map(() => new Float32Array(N));
  // Per room, how far it is revealed: 1 for yours, fading up to it as you come in, and back down to nothing as you leave (so a room fades as a whole, keeping the shape of its light, not tile by tile).
  const roomWeight = new Float32Array(ROOM_COUNT);
  const activeRooms: number[] = [];
  let lastRoom = -1;
  // The light of the doorway that lights each tile: its centre (in tiles, in the tile's own level), its radius, and 1 if there is one (four numbers a tile).
  const lampData = WORLD.levels.map(() => new Float32Array(N * 4));
  const lampScore = WORLD.levels.map(() => new Float32Array(N));
  // The tiles a slanted line between your room and a neighbour cuts through: the line (n . p = d, pointing to the half beyond it, and 1 if there is one), and what lights that half: as `roomAllowed` / `roomReveal` (in the first and fourth numbers of four) and as `lampData`.
  const splitData = WORLD.levels.map(() => new Float32Array(N * 4));
  const altLight = WORLD.levels.map(() => new Uint8Array(N * 4));
  const altLamp = WORLD.levels.map(() => new Float32Array(N * 4));
  // For each cliff tile: the light of its ledge (see the shader).
  const cliffLamp = WORLD.levels.map(() => new Float32Array(N * 4));
  const roomAny: boolean[] = WORLD.levels.map(() => false);
  // Whether the last frame's light was worked out by that rule (else by the flood of sight, for a view with no one in it).
  let byRooms = false;
  // The bytes sent up.
  const lightBytes = WORLD.levels.map(() => new Uint8Array(N * 4));
  // Whether a floor lies between your level and level k at a tile: depends on your level alone.
  const inWay = WORLD.levels.map(() => new Uint8Array(N));
  let inWayCur = -1;
  let sightKey = "";
  let limitKey = "";
  let limit: Int16Array | null = null;

  // (Now that everything `fit` touches exists.)
  fit();
  window.addEventListener("resize", fit);

  // F5 (with the developer tools on, F4) tints what is drawn by where its light comes from (green: your room, blue: a doorway's, magenta: let in by the room rule but dark).
  let lightDebug = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "F5" && isDev()) { e.preventDefault(); lightDebug = !lightDebug; }
  };
  window.addEventListener("keydown", onKey);

  // --- Frame statistics for the F3 readout. ---------------------------------------------------------
  const stat = { cpu: 0, draw: 0, calls: 0, pages: 0, uploads: 0 };
  const stopStats = createStatsOverlay(() =>
    `map (WebGL)  T ${T}px  ${canvas.width}x${canvas.height}\n` +
    `cpu ${stat.cpu.toFixed(1)} ms   draw ${stat.draw.toFixed(1)} ms\n` +
    `draw calls ${stat.calls}   pages ${stat.pages}   picture uploads ${stat.uploads}\n` +
    `baked ${(bakedBytes() / 1048576).toFixed(0)} MB   on the card ${(texBytes / 1048576).toFixed(0)} MB
` +
    `F5: tint by where the light comes from, and tile facts (${lightDebug ? "on" : "off"})   rooms rule: ${byRooms ? "yes" : "no (flood of sight)"}`);

  // --- One page, one quad. ------------------------------------------------------------------------
  const quad = (x: number, y: number, w: number, h: number, v0 = 0, v1 = 1) => {
    gl.uniform4f(U.uRect, x, y, w, h);
    gl.uniform4f(U.uUv, 0, v0, 1, v1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    stat.calls++;
  };

  /** Which pages of a level are asked for in a frame, and the tile rows each gives (see `drawLayer`). */
  const layerOf = (p: Page, kind: Kind) => (kind === "surface" ? p.surface : kind === "walls" ? p.walls : p.cliffs);

  const draw = (v: View, dtMs: number) => {
    if (lost) return;
    const t0 = performance.now();
    stat.calls = 0;
    stat.pages = 0;
    stat.uploads = 0;
    const cur = levelOf(v.x, v.y, v.alt);
    // With someone standing there, what they see depends on the room they're in (the Map viewer's free camera has no room).
    const tx = Math.floor(v.x), ty = Math.floor(v.y);
    // Under the wall half of a shaft's diagonal wall you are outside the room; hugging it, on its open side, you are in it.
    const underWall = shaftDiagSide(cur + 1, tx, ty) >= 0 && !onShaftOpen(cur + 1, tx, ty, v.x, v.y);
    const key = `${cur},${tx},${ty},${underWall}`;
    if (key !== limitKey) {
      limitKey = key;
      limit = roomLimit(cur, tx, ty, underWall);
    }
    /** What's north of your room's north wall is covered by it: pitch black. */
    const walledOff = (x: number, y: number) => !!v.player && !!limit && y < limit[x];
    /** Under or outside a walled room, the walls above you don't draw: they would only cover you. */
    const noWallsAbove = !!v.player && !limit;
    /** Walls this far above you are not drawn where you stand: a place where they would only cover the floor you are on. */
    const hideBox = v.player ? HIDE_WALLS_ABOVE.find(([z, px0, py0, px1, py1]) => z === cur && tx >= px0 + 1 && tx <= px1 + 1 && ty >= py0 + 1 && ty <= py1 + 1) : undefined;
    const hiddenAbove = (k: number, x: number, y: number) => !!hideBox && k > cur && x >= hideBox[5] + 1 && x <= hideBox[7] + 1 && y >= hideBox[6] + 1 && y <= hideBox[8] + 1;
    /** Whether you are in the Nave (a walled room open above, on or above its floor), or no one is (the Map viewer). */
    const inMain = !v.player || (!!limit && cur >= 7);
    const W = canvas.width, H = canvas.height;
    // Snap to whole pixels so the tiles don't shimmer while scrolling.
    const ox = Math.round(W / 2 - v.camX * T);
    const oy = Math.round(H / 2 - (v.camY - BODY_ABOVE_FEET) * T);
    const levelY = (z: number) => oy - Math.round(z * RISE * T);
    const fx = ox + v.x * T, fy = oy + (v.y - v.alt * RISE) * T;
    const circle = !!v.player;

    const ease = 1 - Math.exp(-SIGHT_EASE * dtMs / 1000);

    // Everything that depends on sight is worked out again only when it can have changed: you
    // moved, changed level or room, or a room is still fading in or out.
    const nowKey = `${ox},${oy},${cur},${limitKey}${circle ? `,${v.x},${v.y},${v.alt}` : ""}`;
    let changed = nowKey !== sightKey;
    // Your room.
    let room = -1;
    if (circle) for (const k of [cur, cur - 1, cur + 1]) if (k >= 0 && k < LEVELS && ROOM[k][ty * MW + tx] >= 0) { room = ROOM[k][ty * MW + tx]; break; }
    byRooms = room >= 0;
    if (byRooms) {
      // Rooms fade as wholes: yours in as it becomes yours, the one you leave out as it stops being yours. Never tile by tile.
      if (room !== lastRoom) {
        if (lastRoom < 0) roomWeight[room] = 1;
        lastRoom = room;
        if (!activeRooms.includes(room)) activeRooms.push(room);
        changed = true;
      }
      for (let n = activeRooms.length - 1; n >= 0; n--) {
        const r = activeRooms[n], target = r === room ? 1 : 0;
        let w = roomWeight[r] + (target - roomWeight[r]) * ease;
        if (Math.abs(target - w) < 1 / 255) w = target;
        if (w !== roomWeight[r]) { roomWeight[r] = w; changed = true; }
        if (w === 0 && r !== room) activeRooms.splice(n, 1);
      }
    } else {
      for (const r of activeRooms) roomWeight[r] = 0;
      activeRooms.length = 0;
      lastRoom = -1;
    }
    frameNo++;
    if (changed) {
      sightKey = nowKey;
      if (inWayCur !== cur) { for (const a of inWay) a.fill(0); inWayCur = cur; }

      // What is lit: the tiles of your room (and of a room you are still fading out of), and the tiles of its neighbours that the light of a doorway reaches. Nothing else, however near.
      for (let z = 0; z < LEVELS; z++) { roomAllowed[z].fill(0); roomReveal[z].fill(0); lampScore[z].fill(-Infinity); roomAny[z] = false; splitData[z].fill(0); altLight[z].fill(0); altLamp[z].fill(0); cliffLamp[z].fill(0); }
      if (byRooms) {
        for (const r of activeRooms) {
          const w = roomWeight[r];
          for (const packed of ROOM_TILES[r]) {
            const z = Math.floor(packed / N), i = packed % N;
            if (walledOff(i % MW, Math.floor(i / MW))) continue;
            roomAllowed[z][i] = 1;
            roomReveal[z][i] = w;
            roomAny[z] = true;
            // (Once wholly revealed a room is lit by the circle alone; while it is still coming in, a tile the doorway lit keeps its light, so nothing dips.)
            if (w >= 1) lampData[z][i * 4 + 3] = 0;
          }
        }
        // The light of a doorway on a tile of the room beyond it: centred at (cx, cy) in the tile's level, as far as r. The strongest light wins a tile.
        const setLamp = (zo: number, t: number, cx: number, cy: number, r: number) => {
          if (walledOff(t % MW, Math.floor(t / MW))) return;
          const d = Math.hypot((t % MW) + 0.5 - cx, Math.floor(t / MW) + 0.5 - cy);
          // (A tile beyond what the light reaches is dark anyway; one tile of margin keeps it lit right up to its edge.)
          if (d > r + 1 || r - d <= lampScore[zo][t]) return;
          lampScore[zo][t] = r - d;
          roomAllowed[zo][t] = 1;
          roomAny[zo] = true;
          const k = t * 4, o = lampData[zo];
          o[k] = cx; o[k + 1] = cy; o[k + 2] = r; o[k + 3] = 1;
        };
        const c1 = [0, 0], c2 = [0, 0];
        // A line along a wall that a room has on several levels (a pit's side) is one line: lit as one, from where you stand on the level nearest yours.
        for (const group of groupsOf(room)) {
          let main = group[0];
          for (const l of group) if (Math.abs(l.z - v.alt) < Math.abs(main.z - v.alt)) main = l;
          // The light is centred on the point of the line farthest from you (you taken to stand on its level), and the nearer you stand to it the farther it reaches.
          const py1 = v.y + (main.z - v.alt) * RISE;
          lampCenter(main, v.x, py1, c1);
          const r1 = lampRadius(Math.hypot(v.x - c1[0], py1 - c1[1]));
          /** The light's centre on the plane of level k. */
          const planeY = (k: number) => c1[1] + (k - main.z) * RISE;
          for (const line of group) {
            // A tile the line cuts through is two rooms': its other half is lit by the other room, and only where the preview reaches. (Whether the light reaches or not, the tile is cut: its far half must not be lit as part of the whole tile.)
            for (const c of line.cut) {
              const k = c.t * 4, sd = splitData[line.z], al = altLight[line.z], am = altLamp[line.z];
              if (ROOM[line.z][c.t] === line.other) {
                // The neighbour's tile: the half on your side of the line is yours.
                sd[k] = -c.nx; sd[k + 1] = -c.ny; sd[k + 2] = -c.d; sd[k + 3] = 1;
                al[k] = 255; al[k + 3] = Math.round(roomWeight[room] * 255);
                // (And the doorway's light on it, as before you crossed the line: else this half dips while your room fades in.)
                if (r1 > 0) { am[k] = c1[0]; am[k + 1] = planeY(line.z); am[k + 2] = r1; am[k + 3] = 1; }
              } else {
                // Your tile: the half beyond the line is the neighbour's, lit by this light if it reaches.
                sd[k] = c.nx; sd[k + 1] = c.ny; sd[k + 2] = c.d; sd[k + 3] = 1;
                if (r1 > 0) { al[k] = 255; am[k] = c1[0]; am[k + 1] = planeY(line.z); am[k + 2] = r1; am[k + 3] = 1; }
                else { al[k] = 0; am[k + 3] = 0; }
              }
            }
          }
          // The light is centred on the point of the line farthest from you (you taken to stand on its level), and the nearer you stand to it the farther it reaches.
          if (r1 <= 0) continue;
          for (const line of group) {
            for (const t of line.tiles) setLamp(line.zo, t, c1[0], planeY(line.zo), r1);
            // (And the floors of that room under and over them, seen through its open air.)
            for (const packed of line.deep) { const k = Math.floor(packed / N); setLamp(k, packed % N, c1[0], planeY(k), r1); }
          }
          // Second degree: the room beyond tries its own lines to the rooms past it, as you do from yours, with the first light as the viewer and its (shortened) radius as the reach: a line it doesn't reach has no preview, and one it does has a radius shortened by how far the line is from the light's centre (the same shortening as yours, with the light's radius for the sight). Smooths a junction with several lines near each other.
          // (Not past a stair or a ladder either: from on a ladder you see the room at its top, and no further.)
          const viaPoint = main.ax === main.bx && main.ay === main.by;
          for (const l2 of viaPoint ? [] : LINES[main.other]) {
            if (l2.other === room || l2.other === main.other || activeRooms.includes(l2.other)) continue;
            // (Not through a stair or a ladder: what lies up it is not seen from afar.)
            if (l2.ax === l2.bx && l2.ay === l2.by) continue;
            const vy = planeY(l2.z);
            lampCenter(l2, c1[0], vy, c2);
            const r2 = r1 - Math.hypot(c1[0] - c2[0], vy - c2[1]);
            // A tile that line cuts is two rooms' too, though you stand two rooms away: the half on the nearer room's side is lit as that room is (by the first light), the half beyond by the second if it reaches. (Else the whole tile takes one room's light, and half of a pair of bars or of a stair's end is black.)
            for (const c of l2.cut) {
              const k = c.t * 4, sd = splitData[l2.z], al = altLight[l2.z], am = altLamp[l2.z];
              if (sd[k + 3] > 0.5) continue;
              if (ROOM[l2.z][c.t] === l2.other) {
                sd[k] = -c.nx; sd[k + 1] = -c.ny; sd[k + 2] = -c.d; sd[k + 3] = 1;
                al[k] = 255; al[k + 3] = 0;
                am[k] = c1[0]; am[k + 1] = planeY(l2.z); am[k + 2] = r1; am[k + 3] = 1;
              } else {
                sd[k] = c.nx; sd[k + 1] = c.ny; sd[k + 2] = c.d; sd[k + 3] = 1;
                if (r2 > 0) { al[k] = 255; am[k] = c2[0]; am[k + 1] = vy; am[k + 2] = r2; am[k + 3] = 1; }
                else { al[k] = 0; am[k + 3] = 0; }
              }
            }
            if (r2 <= 0) continue;
            const cy2 = c2[1] + (l2.zo - l2.z) * RISE;
            for (const t of l2.tiles) setLamp(l2.zo, t, c2[0], cy2, r2);
            for (const packed of l2.deep) setLamp(Math.floor(packed / N), packed % N, c2[0], c2[1] + (Math.floor(packed / N) - l2.z) * RISE, r2);
          }
        }
        // A tile that isn't lit has no doorway.
        for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) if (!roomAllowed[z][i]) lampData[z][i * 4 + 3] = 0;
      } else {
        // A view with no one in it (the Map viewer), or no room to stand in: lit wherever sight reaches, on the levels up to yours.
        for (let z = 0; z < LEVELS; z++) lampData[z].fill(0);
        for (let z = 0; z <= Math.min(cur, LEVELS - 1); z++) for (let i = 0; i < N; i++) {
          const x = i % MW, y = (i - x) / MW;
          if (seeThrough(z, x, y) && v.seen[z][i] >= 0 && !walledOff(x, y)) { roomAllowed[z][i] = 1; roomReveal[z][i] = 1; roomAny[z] = true; }
        }
      }
      for (let z = 0; z < LEVELS; z++) inSight[z] = roomAny[z];

      // What lights a wall or a cliff is the tile in front of it, on its own level, and that only if the tile is in the whitelist.
      // A tile of another level at the same place counts for nothing: it is another room.
      const litAt = (k: number, x: number, y: number) => {
        if (x < 0 || y < 0 || x >= MW || y >= MH) return 0;
        const i = y * MW + x;
        if (roomAllowed[k][i]) return 1;
        // (A view with no one in it: a wall above you is lit where sight reaches a level up to yours.)
        if (!byRooms && k > cur) for (let j = 0; j <= cur; j++) if (roomAllowed[j][i]) return 1;
        return 0;
      };
      /** Whether a floor between you and level k, at tile (x, y), hides what's behind it. */
      const floorInWay = (k: number, x: number, y: number) => {
        const cached = x >= 0 && y >= 0 && x < MW && y < MH ? inWay[k] : null, ci = y * MW + x;
        if (cached && cached[ci]) return cached[ci] === 2;
        const lo = k > cur ? cur + 1 : k + 1, hi = k > cur ? k : cur;
        let way = false;
        for (let j = lo; j <= hi; j++) {
          const t = tileAt(j, x, y);
          // (The rim of a door listed as open above is no floor in the way of the door's wall above it.)
          if (t === FLOOR || t === STAIRS || (t === DIAG && !openAboveAt(j, x, y) && !isHoleDiag(j, x, y))) { way = true; break; }
        }
        if (cached) cached[ci] = way ? 2 : 1;
        return way;
      };
      /** Whether a floor on a level strictly between you and level k hides what is at tile (x, y) of level k (its own floor does not: a stair above you is seen from the stair below). */
      const floorBetween = (k: number, x: number, y: number) => {
        const lo = k > cur ? cur + 1 : k + 1, hi = k > cur ? k - 1 : cur;
        for (let j = lo; j <= hi; j++) {
          const t = tileAt(j, x, y);
          // (The rim of a hole is floor on one half only: the stair rising through the other half is seen from below it.)
          if (t === FLOOR || t === STAIRS || (t === DIAG && !isHoleDiag(j, x, y))) return true;
        }
        return false;
      };
      /** Marks the part of level k's walls and cliffs you can see: faces lit from the tile in front of them (255 where they show). */
      const markWalls = (k: number) => {
        const walls = wallShow[k], cliffs = cliffShow[k];
        walls.fill(0);
        cliffs.fill(0);
        anyWalls[k] = false;
        anyCliffs[k] = false;
        // (Walls above you aren't drawn under or outside a walled room, but the stairs are: they rise on ahead of you.)
        const wallsOff = k > cur && noWallsAbove;
        const seen = (x: number, y: number) => (floorInWay(k, x, y) ? 0 : litAt(k, x, y));
        for (const { x, y } of WALL_TILES[k]) {
          const t = tileAt(k, x, y), i = y * MW + x;
          // A stair (and the tilted tile beside one) is drawn with the cliffs, by wall logic: it shows wherever its own tile is lit, from any level, and takes the light of its own tile.
          if (rampishAt(k, x, y) && !floorBetween(k, x, y) && litAt(k, x, y) > 0) {
            const o = lampData[k], q = i * 4, c = cliffLamp[k];
            cliffs[i] = 255;
            anyCliffs[k] = true;
            c[q + 3] = roomReveal[k][i];
            if (o[q + 3] > 0.5) { c[q] = o[q]; c[q + 1] = o[q + 1]; c[q + 2] = o[q + 2]; }
          }
          if (wallsOff || hiddenAbove(k, x, y)) continue;
          const block = CLIFFS[k].get(i);
          // A corner-cut diagonal south of it (floor in its south half) leaves it no face: the diagonal's slanted band is the face there.
          const cutBelow = tileAt(k, x, y + 1) === DIAG && !isHoleDiag(k, x, y + 1) && diagSide(k, x, y + 1) >= 2;
          // A cliff shows only from its own floor's level or above: from below, that floor isn't drawn, and neither is what hangs from it. It belongs to the room of the ledge it hangs from.
          if (block && block.z <= cur && !floorInWay(k, x, y + 1) && litAt(block.z, x, y) > 0) {
            // A cliff is lit as the ledge it hangs from is: the shader gets that ledge's light (moved to this level's plane), so a neighbour's cliff dims and ends with its floor, pixel by pixel.
            const L = block.z, o = lampData[L], q = i * 4, c = cliffLamp[k];
            cliffs[i] = 255;
            anyCliffs[k] = true;
            c[q + 3] = roomReveal[L][i];
            if (o[q + 3] > 0.5) { c[q] = o[q]; c[q + 1] = o[q + 1] + (k - L) * RISE; c[q + 2] = o[q + 2]; }
          }
          // (A black wall curtains the Nave's corner doors, and is there only for someone in the Nave: no one outside it, nor in the tunnels, should see it. The Map viewer shows it.)
          if (t === WALL && blackAt(k, x, y)) { if (inMain) { walls[i] = 255; anyWalls[k] = true; } continue; }
          if (t === WALL) {
            if (cutBelow || !wallFacesInto(k, x, y + 1)) continue;
            if (seen(x, y + 1) > 0) { walls[i] = 255; anyWalls[k] = true; }
          } else if ((t === DIAG && !isHoleDiag(k, x, y)) || shaftDiagSide(k, x, y) >= 0) {
            // Which corner its wall half is in. A north corner has a face rising a level; a south corner faces away and shows nothing.
            const corner = t === DIAG ? 3 - diagSide(k, x, y) : shaftDiagSide(k, x, y);
            if (corner >= 2) continue;
            // A diagonal's wall half above you is under the floor half of its own tile.
            if (k > cur && floorInWay(k, x, y)) continue;
            if (litAt(k, x, y) > 0 || litAt(k, x, y + 1) > 0) { walls[i] = 255; anyWalls[k] = true; }
          }
        }
      };
      for (let z = 0; z < LEVELS; z++) {
        if (wallFade(Math.abs(z - cur)) > 0) markWalls(z);
        else { wallShow[z].fill(0); cliffShow[z].fill(0); anyWalls[z] = false; anyCliffs[z] = false; }
      }

      // Send it up: per level, whether each tile is lit, which walls and cliffs show, and how far its room is revealed; and where each tile's light comes from.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, lightArr);
      for (let z = 0; z < LEVELS; z++) {
        const lb = lightBytes[z], al = roomAllowed[z], rv = roomReveal[z], ws = wallShow[z], cs = cliffShow[z];
        for (let i = 0; i < N; i++) {
          lb[i * 4] = al[i] ? 255 : 0;
          lb[i * 4 + 1] = ws[i];
          lb[i * 4 + 2] = cs[i];
          lb[i * 4 + 3] = Math.round(rv[i] * 255);
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.UNSIGNED_BYTE, lb);
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, originArr);
      for (let z = 0; z < LEVELS; z++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.FLOAT, lampData[z]);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, cliffLampArr);
      for (let z = 0; z < LEVELS; z++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.FLOAT, cliffLamp[z]);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, splitArr);
      for (let z = 0; z < LEVELS; z++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.FLOAT, splitData[z]);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, altLightArr);
      for (let z = 0; z < LEVELS; z++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.UNSIGNED_BYTE, altLight[z]);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, altLampArr);
      for (let z = 0; z < LEVELS; z++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, z, MW, MH, 1, gl.RGBA, gl.FLOAT, altLamp[z]);
      gl.activeTexture(gl.TEXTURE0);
    }
    const t1 = performance.now();

    // --- Drawing. ---------------------------------------------------------------------------------
    gl.clearColor(VOID_RGB[0], VOID_RGB[1], VOID_RGB[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uScreen, W, H);
    gl.uniform1f(U.uT, T);
    gl.uniform2f(U.uPlayer, fx, fy);
    gl.uniform1f(U.uCircle, circle ? 1 : 0);
    gl.uniform1f(U.uRadius, VISION_RADIUS);
    gl.uniform1f(U.uFade, VISION_FADE);
    gl.uniform1f(U.uDebug, lightDebug ? 1 : 0);

    /** Sets what the next quads are: which layer of which level, in what tone. */
    const batch = (kind: number, z: number, tone: number) => {
      gl.uniform1i(U.uKind, kind);
      gl.uniform1i(U.uLevel, z);
      gl.uniform2f(U.uPlane, ox, levelY(z));
      gl.uniform1f(U.uTone, tone);
    };
    /** Draws one layer of level z: every page of it on screen, rows r0..r1 of the level only. */
    const layer = (z: number, kind: Kind, r0: number, r1: number) => {
      const top = levelY(z);
      for (const id of PAGES_OF_LEVEL[z]) {
        const p = PAGES[id];
        if (!layerOf(p, kind)) continue;
        const pw = (p.x1 - p.x0) * T, ph = (p.y1 - p.y0 + CHUNK_PAD_TOP) * T;
        const px = ox + p.x0 * T, py = top + (p.y0 - CHUNK_PAD_TOP) * T;
        // Only the rows asked for (the canvas starts a row above the page's first).
        const from = r0 <= p.y0 - CHUNK_PAD_TOP ? 0 : Math.max(0, Math.min(ph, (r0 - p.y0 + CHUNK_PAD_TOP) * T));
        const to = r1 >= p.y1 ? ph : Math.max(0, Math.min(ph, (r1 - p.y0 + CHUNK_PAD_TOP) * T));
        if (to <= from || px + pw < 0 || px > W || py + to < 0 || py + from > H) continue;
        const picture = bake(p, T, frameNo)[kind];
        if (!picture) continue;
        const known = texCache.has(picture);
        gl.bindTexture(gl.TEXTURE_2D, textureOf(picture));
        if (!known) stat.uploads++;
        quad(px, py + from, pw, to - from, from / ph, to / ph);
        stat.pages++;
      }
    };
    /** Sends the actors' canvas up and draws it as a picture over the whole screen. */
    const picture = (tone: number) => {
      gl.bindTexture(gl.TEXTURE_2D, actorTex);
      const size = `${W}x${H}`;
      if (size !== actorTexSize) {
        uploadPicture(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, actors));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        actorTexSize = size;
      } else {
        uploadPicture(() => gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, actors));
      }
      stat.uploads++;
      gl.uniform1i(U.uKind, 3);
      gl.uniform1f(U.uTone, tone);
      quad(0, 0, W, H);
    };
    /** How brightly you see a spot of level z: nothing if its tile is out of the whitelist, else the circles. */
    const lightOf = (z: number): Light => (x, y) => {
      const itx = Math.floor(x), ity = Math.floor(y);
      if (itx < 0 || ity < 0 || itx >= MW || ity >= MH) return 0;
      const i = ity * MW + itx;
      if (!roomAllowed[z][i]) return 0;
      if (!circle) return 1;
      // The circle of your sight is a circle on the screen, whatever level this is.
      const py = v.y + (z - v.alt) * RISE;
      const round = Math.min(1, Math.max(0, (VISION_RADIUS - Math.hypot(x - v.x, y - py)) / VISION_FADE));
      let lamp = 0;
      const o = lampData[z], k = i * 4;
      if (o[k + 3] > 0.5) lamp = Math.min(1, Math.max(0, (o[k + 2] - Math.hypot(x - o[k], y - o[k + 1])) / VISION_FADE));
      return round * (lamp + (1 - lamp) * roomReveal[z][i]);
    };
    /** The debugging view of the light (F5): on each tile of level z near you, its room number, whether the room rule lets it in (+) or not (-), whether a doorway lights it (L) or not (.), and how bright it is just now (0-9). */
    const tileFacts = (z: number) => {
      ag.globalCompositeOperation = "source-over";
      ag.globalAlpha = 1;
      ag.clearRect(0, 0, W, H);
      const top = levelY(z);
      ag.font = `bold ${Math.max(9, Math.round(T / 6))}px monospace`;
      ag.textAlign = "center";
      for (let y = Math.max(0, Math.floor(v.y) - 8); y <= Math.min(MH - 1, Math.floor(v.y) + 8); y++) for (let x = Math.max(0, Math.floor(v.x) - 9); x <= Math.min(MW - 1, Math.floor(v.x) + 9); x++) {
        const i = y * MW + x;
        if (ROOM[z][i] < 0) continue;
        const org = lampData[z][i * 4 + 3] > 0.5 ? 1 : -1;
        const allowed = roomAllowed[z][i] === 1;
        ag.fillStyle = allowed ? (org >= 0 ? "#6fa0ff" : "#6fff8a") : "#ff7070";
        ag.fillText(`r${ROOM[z][i]} ${allowed ? "+" : "-"}${org >= 0 ? "L" : "."} ${Math.min(9, Math.floor(roomReveal[z][i] * 9.99))}`, ox + (x + 0.5) * T, top + (y + 0.5) * T + 4);
      }
      ag.textAlign = "start";
      picture(1);
    };
    /** Draws the actors on level z whose feet are in a row passing `test`. */
    const actorsOnly = (z: number, test: (y: number) => boolean) => {
      if (!v.actors) return;
      ag.globalCompositeOperation = "source-over";
      ag.globalAlpha = 1;
      ag.clearRect(0, 0, W, H);
      // (Nobody there: nothing to cut or send.)
      if (v.actors(ag, z, ox, oy, T, test, lightOf(z)) === false) return;
      ag.globalAlpha = 1;
      // From inside a walled room, whoever stands in a doorway is cut off at the wall over it.
      if (v.player && limit) {
        ag.globalCompositeOperation = "destination-out";
        ag.fillStyle = "#000";
        for (let x = 0; x < MW; x++) ag.fillRect(ox + x * T, 0, T, levelY(z) + limit[x] * T);
      }
      picture(z < cur ? wallFade(cur - z) : 1);
    };

    // Going up the stack: each level's walls, its floor, the cliffs hanging in front of that floor,
    // and only then whoever stands there, so no block of their own level covers them. Levels at or
    // below you go down whole. Above you there are only walls, split at your row: the part behind
    // you first, then whoever stands on your level north of you, then you, then the part in front,
    // then whoever is south of you. With nobody standing there, every level goes down whole.
    const base = cur;
    const split = v.player ? Math.max(0, Math.min(MH, Math.floor(v.y))) : MH;
    // With the rows anyone stands in known, the walls above you are drawn between those rows (see `wallsAbove`), so each wall covers whoever stands behind it.
    const banded = !!(v.player && v.actorRows);
    /** The walls (and cliffs) of the levels above, rows `from` up to `to`. */
    const wallsAbove = (from: number, to: number) => {
      if (to <= from) return;
      for (let z = base + 1; z < LEVELS; z++) {
        const fade = wallFade(Math.abs(z - cur));
        if (fade <= 0) continue;
        if (anyWalls[z]) { batch(1, z, wallTone(fade)); layer(z, "walls", from, to); }
        if (anyCliffs[z]) { batch(2, z, fade); layer(z, "cliffs", from, to); }
      }
    };
    for (let z = 0; z < LEVELS; z++) {
      const end = z <= base ? MH : split;
      const fade = wallFade(Math.abs(z - cur));
      const above = banded && z > base; // (drawn between the rows instead)
      if (fade > 0 && anyWalls[z] && !above) { batch(1, z, wallTone(fade)); layer(z, "walls", 0, end); }
      // (Even a level with nothing in sight: its floor still covers what's under it, black.)
      if (z <= base && fade > 0) { batch(0, z, z < cur ? fade : 1); layer(z, "surface", 0, MH); }
      if (fade > 0 && anyCliffs[z] && !above) { batch(2, z, fade); layer(z, "cliffs", 0, end); }
      if (lightDebug && z === base) tileFacts(z);
      if (z < base && inSight[z] && fade > 0) actorsOnly(z, () => true);
    }
    /**
     * The ladders, over the walls: seen wherever the floor in front of them is lit. Not the one you climb, which you are in front of (the
     * painted pages have it behind you); `behindYou`: only that one, if it is a drop ladder let down after the pages were painted, drawn
     * before you so it doesn't vanish where you are.
     */
    const ladderOverlay = (behindYou = false) => {
      ag.globalCompositeOperation = "source-over";
      ag.globalAlpha = 1;
      ag.clearRect(0, 0, W, H);
      const grout = Math.max(1, Math.round(T / 24));
      let any = false;
      ag.lineCap = "round";
      for (const l of LADDER_LIST) {
        // (Not one still pulled up.)
        if (raisedLadderAt(l.x, l.y)) continue;
        if (wallFade(Math.abs(l.z - cur)) <= 0 || (l.z > cur && noWallsAbove) || hiddenAbove(l.z, l.x, l.y)) continue;
        // (Not through a floor above it that is drawn: the bridges of a higher floor cover a ladder far below.)
        let covered = false;
        for (let j = l.z + 1; j <= base && !covered; j++) {
          const t = tileAt(j, l.x, l.y + (j - l.z) - 1);
          covered = t === FLOOR || t === STAIRS || t === DIAG;
        }
        if (covered) continue;
        // (Not over you: you climb in front of it.)
        const atYou = !!v.player && Math.floor(v.x) === l.x && Math.floor(v.y) === l.y && v.alt >= l.z - 0.01 && v.alt <= l.z + 1.01;
        if (behindYou ? !(atYou && DROP_TILES.has(`${l.x},${l.y}`)) : atYou) continue;
        const sx = ox + l.x * T, sy = levelY(l.z) + l.y * T;
        if (sx < -T || sx > W || sy < -T || sy > H + T) continue;
        const light = lightOf(l.z)(l.x + 0.5, l.y + 0.5);
        if (light < 0.02) continue;
        any = true;
        // (Fading with the walls they rest on: by how many levels away they are.)
        ag.globalAlpha = light * wallTone(wallFade(Math.abs(l.z - cur)));
        ag.strokeStyle = ladderLook(l.z, l.x, l.y).rung;
        const top = sy - RISE * T, left = sx + 0.25 * T, right = sx + 0.75 * T;
        ag.lineWidth = grout * 2;
        ag.beginPath();
        for (const rx of [left, right]) { ag.moveTo(rx, top); ag.lineTo(rx, sy); }
        ag.stroke();
        ag.lineWidth = grout * 1.5;
        ag.beginPath();
        for (let k = 0; k < 5; k++) { const ry = sy - ((k + 0.5) / 5) * (sy - top); ag.moveTo(left, ry); ag.lineTo(right, ry); }
        ag.stroke();
        ag.lineWidth = grout * 2;
        ag.beginPath();
        if (l.start) for (const [rx, out] of [[left, -1], [right, 1]]) { ag.moveTo(rx, sy - grout); ag.lineTo(rx + out * 0.1 * T, sy - grout); }
        if (l.finish) {
          const ty = top + grout * 2;
          ag.moveTo(left, ty); ag.lineTo(right, ty);
          for (const [rx, out] of [[left, -1], [right, 1]]) { ag.moveTo(rx, ty); ag.lineTo(rx + out * 0.1 * T, ty); }
        }
        ag.stroke();
      }
      ag.lineCap = "butt";
      ag.globalAlpha = 1;
      if (any) picture(1);
    };
    if (banded) {
      // Whoever is north of you (or in your row, behind you), row by row: the walls up to the row after theirs are under them, the rest of the walls (the ones in front of them) over.
      let from = 0;
      for (const [r0, r1] of groupRows(v.actorRows!(base).filter(r => r <= split), base)) {
        const to = Math.min(r1 + 1, split);
        wallsAbove(from, to);
        from = Math.max(from, to);
        if (inSight[base]) actorsOnly(base, y => y <= v.y && Math.floor(y) >= r0 && Math.floor(y) <= r1);
      }
      wallsAbove(from, split);
    } else if (inSight[base]) actorsOnly(base, y => !v.player || y <= v.y);
    if (!v.player) ladderOverlay();
    if (v.player) {
      ladderOverlay(true);
      ag.globalCompositeOperation = "source-over";
      ag.globalAlpha = 1;
      ag.clearRect(0, 0, W, H);
      v.player.draw(ag, fx, fy - BODY_ABOVE_FEET * T, T, true);
      picture(1);
      if (v.actorRows) {
        // Whoever is south of you, row by row: the walls in front of each of them (further south) are drawn over them, and the rows behind are under them.
        let from = split;
        for (const [r0, r1] of groupRows(v.actorRows(base).filter(r => r >= split), base)) {
          wallsAbove(from, r1 + 1);
          if (inSight[base]) actorsOnly(base, y => y > v.y && Math.floor(y) >= r0 && Math.floor(y) <= r1);
          from = r1 + 1;
        }
        wallsAbove(from, MH);
        ladderOverlay();
      } else {
        wallsAbove(split, MH);
        ladderOverlay();
        if (inSight[base]) actorsOnly(base, y => y > v.y);
      }
      // Your outline shows faintly through anything covering you (it vanishes into you otherwise).
      ag.globalCompositeOperation = "source-over";
      ag.clearRect(0, 0, W, H);
      // (Drawn whole and opaque on a scratch canvas first, then laid over faintly in one go: drawn faint piece by piece, the gear would show the body through it.)
      if (ghostCanvas.width !== W || ghostCanvas.height !== H) { ghostCanvas.width = W; ghostCanvas.height = H; }
      ghostCtx.clearRect(0, 0, W, H);
      v.player.draw(ghostCtx, fx, fy - BODY_ABOVE_FEET * T, T, false);
      ag.globalAlpha = GHOST_ALPHA;
      ag.drawImage(ghostCanvas, 0, 0);
      ag.globalAlpha = 1;
      picture(1);
    }
    trimTextures();
    // Painting one more page ahead of need, when the frame was quick: walking never waits on a page.
    if (performance.now() - t0 < 6) preload(v.x, v.y, v.alt, cur, 1);

    stat.cpu = t1 - t0;
    stat.draw = performance.now() - t1;
  };

  // --- Painting pages ahead of need. --------------------------------------------------------------
  /** Whether the page lies within `reach` tiles of the spot (x, y) (as drawn on its own level). */
  const near = (p: Page, x: number, y: number, alt: number, reach: number) => {
    const cy = y + (p.z - alt) * RISE;
    return p.x1 + reach > x && p.x0 - reach < x && p.y1 + reach > cy && p.y0 - reach < cy;
  };
  /** The pages worth having ready around a spot: within reach, on the levels that show from there. */
  const wanted = (x: number, y: number, alt: number, cur: number, reach: number) => {
    const out: Page[] = [];
    for (let z = 0; z < LEVELS; z++) {
      if (wallFade(Math.abs(z - cur)) <= 0) continue;
      for (const id of PAGES_OF_LEVEL[z]) {
        const p = PAGES[id];
        // (Above you only walls and cliffs show; floors are not drawn.)
        if (z > cur && !p.walls && !p.cliffs) continue;
        if (near(p, x, y, alt, reach)) out.push(p);
      }
    }
    return out;
  };
  /** Paints a page if it isn't painted yet, and sends it up if it isn't on the card. */
  const ready = (p: Page) => {
    const b = bake(p, T, frameNo);
    for (const picture of [b.surface, b.walls, b.cliffs]) if (picture) textureOf(picture);
  };
  /** Gets up to `count` of the pages near the spot ready, if they aren't. Returns how many are left. */
  const preload = (x: number, y: number, alt: number, cur: number, count: number) => {
    const todo = wanted(x, y, alt, cur, 9).filter(p => !isBaked(p.id, T) || !onCard(p));
    for (const p of todo.slice(0, count)) ready(p);
    return Math.max(0, todo.length - count);
  };
  /** Whether every picture of the page is on the card. */
  const onCard = (p: Page) => {
    const b = bake(p, T, frameNo);
    return [b.surface, b.walls, b.cliffs].every(picture => !picture || texCache.has(picture));
  };

  return {
    draw,
    get T() { return T; },
    async warm(x, y, alt, onProgress) {
      const cur = levelOf(x, y, alt);
      // Where it fits in memory, the whole map is painted now; else just what is near.
      const everything = estimateBytes(T) <= BAKE_BUDGET * BAKE_ALL_SHARE;
      const near = wanted(x, y, alt, cur, 9);
      const painting = (everything ? PAGES : near).filter(p => !isBaked(p.id, T));
      const total = painting.length + near.length;
      let done = 0;
      onProgress?.(0);
      // A few pages at a time, giving the browser a breath between (so the loading screen shows).
      for (let i = 0; i < painting.length; i += 2) {
        for (const p of painting.slice(i, i + 2)) bake(p, T, frameNo);
        done += Math.min(2, painting.length - i);
        onProgress?.(done / total);
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
      // And what is near goes up to the card.
      for (let i = 0; i < near.length; i += 3) {
        for (const p of near.slice(i, i + 3)) ready(p);
        done += Math.min(3, near.length - i);
        onProgress?.(done / total);
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
      onProgress?.(1);
    },
    dispose() {
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      stopStats();
      // (The context itself is left to the browser: the same canvas may be given to a new renderer straight away.)
      dropTextures();
    },
  };
}
