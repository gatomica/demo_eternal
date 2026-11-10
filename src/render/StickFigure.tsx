/**
 * StickFigure.tsx — a figure: the stick body, its gear, wax and held props (the Warden is drawn
 * in warden/). Drawing only; no game rules live here.
 *
 * The camera looks at the fight from a 3/4 angle: the player stands on the left, seen from
 * behind and facing right into the scene; enemies stand on the right, seen from the front
 * and facing left toward the player.
 *
 * Both use the same poses, drawn facing right. What changes is depth:
 *  - The player's weapon arm is the far arm, so it and the weapon are drawn behind the body.
 *  - An enemy carries its weapon in its right hand too: the far arm, drawn behind the body, and the
 *    figure is mirrored. (The waxed carry nothing in that hand: their arms keep their own depth. An armed
 *    waxed holds its weapon in its free hand, see `waxedGrip`.)
 * Gear attaches to joints: the weapon to the weapon hand, armor to the torso, shoulders and head.
 */
import { memo, type ReactNode, useContext } from "react";
import { DebugLimbsContext } from "./debugLimbs";
import { LittleFlame } from "./LittleFlame";
import type { Variant } from "../core/bestiary";
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { lerp, limb, type Pt } from "./geom";
import { lookOf } from "./looks";
import { ALL_POSES, type PoseName, type Skeleton } from "./poses";
import { fitLimbs, fitTorso, reachArm, RIG } from "./rig";
import { HIP_HALF, onBody, SHOULDER_HALF } from "./body";
import { SideTags } from "./SideTags";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";

/* ============================================================
 * Gear
 * ============================================================ */

/**
 * The sealing king's mark, pressed into the torch's wax: a closed eye, its lid a shallow curve across
 * the torch, and what the mark is really about, three straight parallel lashes hanging from it toward
 * the torch's tip, stopping short of it, the middle one longer than the other two. The lid's middle is
 * at (x, 0), `r` half its width; the side lashes end at `side`, the middle one at `mid` (along the torch, +x).
 */
function SealingMark({ x, r, side, mid }: { x: number; r: number; side: number; mid: number }) {
  const lid = `M${x} ${-r} Q${x + r * 0.9} 0 ${x} ${r}`;
  // Where each lash leaves the lid (on the curve), and where it ends.
  const lashes = [-0.62, 0, 0.62].map(u => `M${x + r * 0.45 * (1 - u * u) + r * 0.05} ${u * r} H${u === 0 ? mid : side}`).join(" ");
  return (
    <g>
      <path d={lid} className="fig-stamp-line" />
      <path d={lashes} className="fig-stamp-lash" />
    </g>
  );
}

/**
 * Weapons are drawn along +x from the grip at (0, 0), +y across the blade. Each is the demo's one
 * weapon of its weight:
 *  - light, the **Jagged Chisel**: an imperial short sword snapped in half and ground into a chisel.
 *    A ball pommel and a ridged grip, the bulky oval guard seen edge-on, a broad blade with its fuller,
 *    ending square, a ground bevel across its end; small nicks and chips along its edges, and wax
 *    from carving smeared on the blade in streaks, like paint.
 *  - normal, the **Waxed Torch**: a wooden torch whose head (rags, charred) is sealed in a bulb of wax,
 *    stamped with the sealing king's mark; the wax has run down the shaft in runnels.
 *  - heavy, the **Brick Hammer**: a crooked branch with a grey brick of the bedchambers lashed to it by
 *    cord, mortar still on one edge, a corner knocked off, a crack running through it.
 */
/** The starting classes' weapons, drawn like the rest: along +x from the grip. */
function ItemWeapon({ item }: { item: WeaponItem }) {
  const bronze = "#5e9a78", bronzeDark = "#3d6b53", iron = "#8f93a3";
  switch (item) {
    case "shortsword": // Bronze Shortsword: a leaf blade, a short bar for a guard, a wrapped grip and a round pommel
      return (
        <g>
          <circle cx={-5.6} cy={0} r={2} fill={bronzeDark} />
          <line x1={-4} y1={0} x2={2.2} y2={0} className="fig-grip" strokeWidth={2.6} />
          <rect x={2.2} y={-4.3} width={2.2} height={8.6} rx={0.9} fill={bronzeDark} />
          <path d="M4.4 -2 L15 -3.1 L26 -2 L34 0 L26 2 L15 3.1 L4.4 2 Z" fill={bronze} stroke={bronzeDark} strokeWidth={0.5} strokeLinejoin="round" />
          <line x1={5.6} y1={0} x2={29} y2={0} stroke={bronzeDark} strokeWidth={0.7} strokeLinecap="round" />
        </g>
      );
    case "axe": // Barbarian's Axe: a long wooden haft, the broad two-lobed iron head set on its side near the end, the haft showing past it
      return (
        <g>
          <line x1={-6} y1={0} x2={43} y2={0} className="fig-grip" strokeWidth={3} />
          {/* The head: its edge runs alongside the haft, its two lobes (a top and a beard) bulging out to the side. */}
          <g transform="translate(35 1.2) rotate(90) translate(-28.5 0)">
            <path d="M28.5 -2 L28.5 2 L32 3.4 L36.5 10.5 Q41.5 6.5 41.5 0 Q41.5 -6.5 36.5 -10.5 L32 -3.4 Z" fill={iron} stroke="#5d6070" strokeWidth={0.6} strokeLinejoin="round" />
            <path d="M31.6 -2.8 L36 -8.4 M31.6 2.8 L36 8.4" stroke="#5d6070" strokeWidth={0.7} strokeLinecap="round" fill="none" />
          </g>
          <path d="M31 -1.8 v3.6 M32.3 -1.8 v3.6 M37.7 -1.8 v3.6 M39 -1.8 v3.6" className="fig-cord" />
        </g>
      );
    case "sickle": // Nomadic Sickle: a short handle, and an iron blade in the shape of a crescent moon whose two tips lie on the handle's line
      return (
        <g>
          <circle cx={-4.8} cy={0} r={1.7} className="fig-wood-fill" />
          <line x1={-4} y1={0} x2={6} y2={0} className="fig-grip" strokeWidth={2.6} />
          <path d="M6 0 A6.9 9.5 0 0 1 19.8 0 A6.9 7.6 0 0 0 6 0 Z" fill={iron} stroke="#5d6070" strokeWidth={0.6} strokeLinejoin="round" />
        </g>
      );
  }
}

export function Weapon({ tier, item }: { tier: WeaponTier; item?: WeaponItem }) {
  if (item) return <ItemWeapon item={item} />;
  switch (tier) {
    case "baseline": // bare hands
      return null;
    case "light": // the Jagged Chisel
      return (
        <g>
          <circle cx={-5.4} cy={0} r={2.1} fill="#3d6b53" />
          <line x1={-4} y1={0} x2={1.4} y2={0} className="fig-grip" strokeWidth={2.6} />
          {/* Finger ridges on the grip. */}
          <path d="M-2.6 -1.2 v2.4 M-0.8 -1.2 v2.4" className="fig-wood-line" />
          {/* The oval guard, edge-on. */}
          <ellipse cx={2.2} cy={0} rx={1.3} ry={3.3} fill="#3d6b53" />
          {/* The broad blade, ground square at the break like a chisel: small nicks along its edges, a chipped corner. */}
          <path d="M3.4 -2.3 L6.3 -2.3 L6.65 -1.85 L7 -2.3 L10 -2.3 L10.25 -2 L10.5 -2.3 L14 -2.3 L14.7 -1.6 L14.7 0.4 L14.35 0.7 L14.7 1 L14.7 2.3 L12.5 2.3 L12.2 1.95 L11.9 2.3 L8.7 2.3 L8.4 2 L8.1 2.3 L3.4 2.3 Z" fill="#5e9a78" />
          <line x1={4.4} y1={0} x2={11.4} y2={0} stroke="#3d6b53" strokeWidth={0.7} strokeLinecap="round" />
          {/* The bevel ground across its end. */}
          <line x1={13.3} y1={-2.1} x2={13.3} y2={2.1} stroke="#8fc4a6" strokeWidth={0.6} strokeLinecap="round" />
          {/* Wax smeared on the blade from carving it, in streaks like paint. */}
          <path d="M4.8 -1.3 Q7.6 -0.85 10.6 -1.45 M5.9 1.15 Q8.9 1.6 12.3 1.05" className="fig-wax-paint" />
        </g>
      );
    case "normal": // the Waxed Torch
      return (
        <g>
          <path d="M-5 -1.2 L24 -1.6 L24 1.6 L-5 1.2 Z" className="fig-wood-fill" />
          {/* Cord bound under the head. */}
          <path d="M20.4 -1.9 v3.8 M21.8 -1.9 v3.8" className="fig-cord" />
          {/* The charred rags of the head, showing under the wax. */}
          <rect x={23} y={-3.1} width={6} height={6.2} rx={1} className="fig-char" />
          {/* The wax that sealed it, run down the shaft. */}
          <path d="M25 -1.2 Q23.4 -0.4 22.2 -1 Q21 -1.5 19.4 -0.9" className="fig-wax-runnel" />
          <circle cx={19.2} cy={-0.8} r={0.75} className="fig-wax-fill" />
          <path d="M25 0.9 Q22.8 1.5 21 0.9 Q18.6 0.2 16.2 0.8" className="fig-wax-runnel" />
          <circle cx={15.9} cy={0.85} r={0.85} className="fig-wax-fill" />
          <path d="M25.4 -3.7 Q31 -5.6 34.6 -2.4 Q36.2 0 34.6 2.4 Q31 5.6 25.4 3.7 Q24 0 25.4 -3.7 Z" className="fig-wax-seal" />
          {/* The seal pressed into it: the sealing king's mark. */}
          <circle cx={30.6} cy={0} r={2.7} className="fig-wax-stamp" />
          <SealingMark x={28.6} r={1.9} side={32.6} mid={34} />
        </g>
      );
    case "heavy": // the Brick Hammer
      return (
        <g>
          {/* A crooked branch for a haft, a knot on it. */}
          <polyline points="-6,0.4 6,-0.5 18,0.6 31,0" className="fig-grip" strokeWidth={3} fill="none" />
          <circle cx={11} cy={-1.3} r={0.9} className="fig-wood-fill" />
          {/* The brick, a corner knocked off, mortar still caked on its far edge. */}
          <path d="M29.5 -7 L38.6 -7 L41 -4.6 L41 7 L29.5 7 Z" className="fig-brick" />
          <path d="M40.2 -4.2 L41 -4.6 L41 7 L40 7 Z" className="fig-mortar" />
          {/* The crack that runs through it. */}
          <path d="M38.6 -7 L37.4 -4.6 L38.6 -2.4 L36.9 0.4 L37.8 3.2 L37 5.2" className="fig-crack" />
          {/* The cord that lashes it on: wound round the haft, then over the near face of the brick. */}
          <path d="M27.4 -1.7 L31.1 -5.2 M27.4 1.7 L31.1 5.2 M31.1 -6.3 V6.3 M27.4 -1.9 v3.8 M28.6 -1.9 v3.8" className="fig-cord" />
        </g>
      );
  }
}

/**
 * A weapon in the hand. `flash`: an eternal effect just happened: it flashes pale blue, the colour of Eternity, or dark red when it was
 * paid in Death (a key starting "death|"), once (a new key plays the flash again).
 */
export function HeldWeapon({ tier, flash, item }: { tier: WeaponTier; flash?: string; item?: WeaponItem }) {
  return (
    <>
      {flash && tier !== "baseline" && <g key={flash} className={`fig-eternal-flash ${flash.startsWith("death|") ? "is-death" : ""}`} aria-hidden="true"><Weapon tier={tier} item={item} /></g>}
      <Weapon tier={tier} item={item} />
    </>
  );
}

/** The floor, in a pose's coordinates (feet stand on it). */
const FLOOR_Y = 114;

/** The armed waxed's attack: its hands raised to strike (Hands Raised), and the blow itself. */
const WAXED_ATTACK_POSES = new Set<string>(["w-hands", "w-scratch"]);

/** The Brick Hammer along its axis (see `Weapon`): the butt of its haft behind the grip, and where its brick begins. */
const HAMMER_BUTT = 6, HAMMER_HEAD = 29.5;

/**
 * How an armed waxed holds its weapon in its free hand (the other one tears off the wax it hurls): on
 * along the forearm, raised when its hands go up, thrust forward as it rakes. Where that would run it
 * into the floor (the arm hanging, the hand planted to crawl, toppled), it tilts up just enough to rest its
 * tip on the floor, still pointing the way the forearm does, forward or back. Returns where the grip is
 * and the angle in degrees.
 */
function waxedGrip(elbow: Pt, hand: Pt, reach: number): { at: Pt; angle: number } {
  const along = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
  const deg = (a: number) => (a * 180) / Math.PI;
  if (hand[1] + Math.sin(along) * reach <= FLOOR_Y - 1) return { at: hand, angle: deg(along) };
  const lift = Math.asin(Math.max(-1, (FLOOR_Y - 1 - hand[1]) / reach));
  return { at: hand, angle: deg(Math.cos(along) >= 0 ? lift : Math.PI - lift) };
}

/**
 * The hammer outside its attack, held like a walking stick: its brick on top, the haft passing through the hand and its butt
 * on the floor. `angle` is the way the hammer points from the butt to the brick (-90 is straight up; a little past it leans the
 * brick back toward the body and puts the butt out ahead, like a cane planted in front). Where the hand is higher than the haft
 * reaches (leaning back with the wax, cowering, flinching), it is held just under the brick, the butt a little off the floor.
 */
function walkingStick(hand: Pt, angle = -90): { at: Pt; angle: number } {
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  // How far along the haft, from its butt, the hand is: down to the floor, or at most just under the brick.
  const t = Math.min((hand[1] - (FLOOR_Y - 1)) / dy, HAMMER_HEAD - 3.5 + HAMMER_BUTT);
  return { at: [hand[0] - dx * t + dx * HAMMER_BUTT, hand[1] - dy * t + dy * HAMMER_BUTT], angle };
}

/** The poses where an armed waxed holds its hammer out in front, hand level with its middle, rather than hanging or planted. */
const CANE_POSES = new Set<string>(["w-idle", "w-crawl"]);

const ARMOR_WIDTH: Record<ArmorTier, number> = { none: 0, light: 9, normal: 11, heavy: 14 };

function Armor({ tier, s, near, item, frontShown = false, turn = 0 }: { tier: ArmorTier; s: Skeleton; near: Pt; item?: ArmorItem; frontShown?: boolean; turn?: number }) {
  if (tier === "none") return null;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const ex = nx + (hx - nx) * 0.86;
  const ey = ny + (hy - ny) * 0.86;
  // The starting classes' own: a bronze cuirass with the muscles worked into it, padded black leather, a white robe hanging to the knees.
  if (item) {
    const len = Math.hypot(hx - nx, hy - ny) || 1, dx = (hx - nx) / len, dy = (hy - ny) / len, px = -dy, py = dx;
    const at = (k: number, side: number): Pt => [nx + (hx - nx) * k + px * side, ny + (hy - ny) * k + py * side];
    // Seen at 3/4 the front's details are not square to the camera: its middle shifts toward the way the body turns and its width narrows (`turn`: the way the
    // chest faces across the page, -1 to 1; 0 is straight on). The back's ridge shifts the other way, less.
    const c = (frontShown ? 1 : -0.6) * turn * 7, w = frontShown ? Math.max(0.4, 1 - Math.abs(turn) * 0.9) : 1;
    const fr = (k: number, side: number): Pt => at(k, side * w - c);
    if (item === "robe") {
      // A white robe, tight about the body and (see `.armor-robe` in index.css) wound close round the arms and legs: a sash at the waist, a collar.
      return (
        <g>
          <line x1={nx} y1={ny + 2} x2={ex} y2={ey} stroke="#ebe9f1" strokeWidth={ARMOR_WIDTH[tier]} strokeLinecap="round" />
          {/* The collar's V is on the front: shown only when the hips turn the front toward the camera. */}
          {frontShown && <path d={`M${fr(0.04, -4)[0]} ${fr(0.04, -4)[1]} L${fr(0.2, 0)[0]} ${fr(0.2, 0)[1]} L${fr(0.04, 4)[0]} ${fr(0.04, 4)[1]}`} fill="none" stroke="#b9b5c6" strokeWidth={0.9} strokeLinejoin="round" />}
          <line x1={at(0.78, -5)[0]} y1={at(0.78, -5)[1]} x2={at(0.78, 5)[0]} y2={at(0.78, 5)[1]} stroke="#8e8aa0" strokeWidth={2} strokeLinecap="round" />
          <circle cx={near[0]} cy={near[1]} r={2} fill="#ebe9f1" stroke="#b9b5c6" strokeWidth={0.6} />
        </g>
      );
    }
    if (item === "garb") {
      // A black cloak rather than tight leather: a cape over the shoulders and a long, loose fall of cloth down the back to below the hips, its hem ragged.
      const hem = (side: number, down: number): Pt => [hx + dx * down + px * side, hy + dy * down + py * side];
      const sl = at(0.02, -8), sr = at(0.02, 8);
      const h1 = hem(-13, 22), h2 = hem(-6, 26), h3 = hem(1, 22), h4 = hem(7, 27), h5 = hem(13, 22);
      return (
        <g strokeLinejoin="round">
          <path d={`M${sl[0]} ${sl[1]} L${sr[0]} ${sr[1]} L${h5[0]} ${h5[1]} L${h4[0]} ${h4[1]} L${h3[0]} ${h3[1]} L${h2[0]} ${h2[1]} L${h1[0]} ${h1[1]} Z`} fill="#17171c" />
          {/* The folds fall down the back; from the front there is only the clasp at the throat. */}
          {frontShown ? <circle cx={fr(0.06, 0)[0]} cy={fr(0.06, 0)[1]} r={1.4} fill="#8e8aa0" /> : <path d={`M${at(0.12, -2)[0]} ${at(0.12, -2)[1]} L${hem(-4, 21)[0]} ${hem(-4, 21)[1]} M${at(0.12, 3)[0]} ${at(0.12, 3)[1]} L${hem(5, 22)[0]} ${hem(5, 22)[1]}`} fill="none" stroke="#2a2a33" strokeWidth={0.8} strokeLinecap="round" />}
          <ellipse cx={near[0]} cy={near[1]} rx={3.4} ry={2.4} fill="#1f1f26" />
        </g>
      );
    }
    // The Bronze Chestplate
    return (
      <g>
        <line x1={nx} y1={ny + 2} x2={ex} y2={ey} stroke="#5a9475" strokeWidth={ARMOR_WIDTH[tier]} strokeLinecap="round" />
        {/* The muscles are worked into the front; the back is plain, with only the spine's ridge. */}
        <g stroke="#3a6650" strokeWidth={0.9} strokeLinecap="round" fill="none">
          <line x1={fr(0.12, 0)[0]} y1={fr(0.12, 0)[1]} x2={fr(0.82, 0)[0]} y2={fr(0.82, 0)[1]} />
          {frontShown && <path d={`M${fr(0.28, -5.4)[0]} ${fr(0.28, -5.4)[1]} Q${fr(0.4, 0)[0]} ${fr(0.4, 0)[1]} ${fr(0.28, 5.4)[0]} ${fr(0.28, 5.4)[1]}`} />}
          {frontShown && [0.52, 0.66].map(k => <line key={k} x1={fr(k, -4.2)[0]} y1={fr(k, -4.2)[1]} x2={fr(k, 4.2)[0]} y2={fr(k, 4.2)[1]} />)}
        </g>
        <circle cx={near[0]} cy={near[1]} r={3.6} fill="#5a9475" stroke="#3a6650" strokeWidth={0.7} />
      </g>
    );
  }
  return (
    <g>
      <line x1={nx} y1={ny + 2} x2={ex} y2={ey} className="fig-armor" strokeWidth={ARMOR_WIDTH[tier]} />
      {tier !== "light" && <circle cx={near[0]} cy={near[1]} r={tier === "heavy" ? 6.5 : 4.5} className="fig-armor-fill" />}
    </g>
  );
}

/**
 * A foe's frail torso: a spine as thick as its limbs rising from the hips to a filled, skinny
 * ribcage, where the shoulders and, through a neck as thick as the limbs, the head attach. The ribs
 * are thin shaded moons lying sideways (flat bowls), in two columns, one per half of the ribcage.
 * Straight on the columns match. At 3/4 the near half is the prominent one: its ribs sit close to the
 * middle and run long, while the far half's are short and pressed against the edge.
 * `nearSide`: which way on the page the near shoulder is (-1, 1, or 0 straight on).
 * Seen from behind the ribs are typically on the front only: none straight on, and at 3/4 just the short moons
 * at the edge of the prominent (near) side, where the ribs wrap around.
 */
function Ribcage({ s, nearSide, behind }: { s: Skeleton; nearSide: number; behind: boolean }) {
  const [nx, ny] = s.neck;
  // The ribcage follows the spine from the neck to the waist, if it has one (an arched back), else to the hip.
  const [px, py] = s.waist ?? s.hip;
  const len = s.waist ? Math.hypot(px - nx, py - ny) + Math.hypot(s.hip[0] - px, s.hip[1] - py) : Math.hypot(px - nx, py - ny);
  const mid = lerp(s.neck, s.waist ?? s.hip, s.waist ? (0.25 * len) / Math.hypot(px - nx, py - ny) : 0.25);
  const turn = (Math.atan2(nx - px, py - ny) * 180) / Math.PI; // the spine's lean, from straight down
  const ry = len * 0.3;
  const rows = [-0.55, -0.05, 0.45].map(k => k * ry);
  const EDGE = 6.6; // half the ribcage's width
  // Each column runs from `from` to `to` across the page, measured from the middle of the ribcage.
  const farColumn = { from: -nearSide * 4.6, to: -nearSide * EDGE };
  const columns = behind
    ? nearSide === 0 ? [] : [{ from: nearSide * 4.6, to: nearSide * EDGE }]
    : nearSide === 0
      ? [{ from: -1, to: -6 }, { from: 1, to: 6 }]
      : [{ from: nearSide * 0.6, to: nearSide * 5.6 }, farColumn];
  /** A thin sideways moon: a flat bowl, and the flatter one back inside it. */
  const moon = (from: number, to: number, y: number) => {
    const lo = Math.min(from, to), hi = Math.max(from, to), half = (hi - lo) / 2;
    return `M${lo} ${y} A${half} 1.8 0 0 0 ${hi} ${y} A${half} 0.7 0 0 1 ${lo} ${y} Z`;
  };
  return (
    <g>
      <polyline points={limb(s.head, s.neck)} className="fig-limb" />
      <polyline points={s.waist ? limb(s.neck, s.waist, s.hip) : limb(s.neck, s.hip)} className="fig-limb" />
      <g transform={`translate(${mid[0]} ${mid[1]}) rotate(${turn})`}>
        <ellipse cx={0} cy={0} rx={EDGE} ry={ry} className="fig-ribcage" />
        {columns.flatMap(c => rows.map(y => <path key={`${c.from}${y}`} d={moon(c.from, c.to, y)} className="fig-rib" />))}
      </g>
    </g>
  );
}

/**
 * A patrol warden's hood: the Penitent Warden's (its round, its point hanging behind, one flat colour),
 * sized to an ordinary head, with only the shadow of the opening where the face is, from the front. No
 * beak and no wax beard: the wardens of the patrols wear no mask.
 */
function PatrolHood({ x, y, front }: { x: number; y: number; front: boolean }) {
  return (
    <g>
      <path d={`M${x - 2.4} ${y - 6.6} L${x - 10.4} ${y - 10.2} L${x - 7.8} ${y + 0.8} Z`} className="fig-hood" />
      <circle cx={x} cy={y} r={8.9} className="fig-hood" />
      {front && <ellipse cx={x + 3} cy={y + 1.3} rx={4.3} ry={5.6} className="fig-hood-dark" />}
    </g>
  );
}

/** A little steady-but-uneven number from 0 to 1 for an integer (so the wrappings are the same every time, and not regular). */
const jitter = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

/**
 * A limb (its points from the shoulder or hip down to the hand or foot) and what the starting classes' armor puts on it: the Soldier's white cloth with
 * brown leather over the last of the forearm and shin (gloves and boots); the Nomad's pale gray cloth, wound round with soft, uneven wrappings, and over the
 * thigh the puffy gray trousers gathered at the knee. (Hands and feet stay round.)
 */
function LimbPoly({ pts, className, item, leg, tag }: { pts: Pt[]; className: string; item?: ArmorItem; leg?: boolean; tag: string }) {
  const poly = limb(...pts);
  if (item === "bronze-chestplate") {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const gid = `leather-${tag}-${Math.round(a[0])}-${Math.round(a[1])}-${Math.round(b[0])}-${Math.round(b[1])}`;
    return (
      <g>
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}>
            <stop offset="0" stopColor="#efece4" /><stop offset="0.52" stopColor="#efece4" />
            <stop offset="0.52" stopColor="#7a5232" /><stop offset="1" stopColor="#7a5232" />
          </linearGradient>
        </defs>
        <polyline points={poly} className={className} style={{ stroke: `url(#${gid})` }} />
      </g>
    );
  }
  if (item !== "robe") return <polyline points={poly} className={className} />;
  const marks: ReactNode[] = [];
  let thigh: ReactNode = null;
  pts.slice(1).forEach((q, i) => {
    const p = pts[i];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    if (leg && i === 0) {
      // Puffy trousers from the hip to the knee: a loose bag of gray cloth, gathered at the knee.
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      thigh = (
        <g>
          <ellipse cx={mx} cy={my} rx={len / 2 + 1.2} ry={5.8} transform={`rotate(${ang} ${mx} ${my})`} fill="#cfcdd6" stroke="#a8a5b5" strokeWidth={0.6} />
          <path d={`M${p[0] + ux * 3 - uy * 2.4} ${p[1] + uy * 3 + ux * 2.4} Q${mx + ux * 1} ${my + uy * 1 + 1.2} ${q[0] - ux * 3 - uy * 2.2} ${q[1] - uy * 3 + ux * 2.2}`} fill="none" stroke="#b4b1c0" strokeWidth={0.7} strokeLinecap="round" />
          <path d={`M${p[0] + ux * 4 + uy * 2.6} ${p[1] + uy * 4 - ux * 2.6} Q${mx} ${my - 1.4} ${q[0] - ux * 3 + uy * 2.4} ${q[1] - uy * 3 - ux * 2.4}`} fill="none" stroke="#b4b1c0" strokeWidth={0.7} strokeLinecap="round" />
          <line x1={q[0] - uy * 3.8} y1={q[1] + ux * 3.8} x2={q[0] + uy * 3.8} y2={q[1] - ux * 3.8} stroke="#9c99ab" strokeWidth={1.1} strokeLinecap="round" />
        </g>
      );
      return;
    }
    // Wrappings round the arm and the shin: short soft gray strokes across it, each a little slanted and bowed, none quite alike.
    const n = Math.max(2, Math.floor(len / 4.2));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5 + (jitter(k + i * 7 + Math.round(p[0])) - 0.5) * 0.5) / n;
      const cx = p[0] + dx * t, cy = p[1] + dy * t;
      const slant = (jitter(k * 3 + i * 11 + Math.round(q[1])) - 0.5) * 0.9, bow = (jitter(k * 5 + i) - 0.5) * 1.8;
      const c = Math.cos(slant), sn = Math.sin(slant);
      const vx = -uy * c - ux * sn, vy = ux * c - uy * sn;
      marks.push(<path key={`${i}-${k}`} d={`M${cx - vx * 2.9} ${cy - vy * 2.9} Q${cx + ux * bow} ${cy + uy * bow} ${cx + vx * 2.9} ${cy + vy * 2.9}`} fill="none" stroke="#8d899c" strokeOpacity={0.34} strokeWidth={0.55} strokeLinecap="round" />);
    }
  });
  return (
    <g>
      <polyline points={poly} className={className} />
      {marks}
      {thigh}
    </g>
  );
}

/** Head gear: a bronze helm with its red crest, a black hood, a clay mask. Drawn on the head at (x, y), the figure facing right. */
export function HeadGear({ item, x, y, front }: { item: HeadItem; x: number; y: number; front?: boolean }) {
  if (item === "helm") {
    return (
      <g strokeLinejoin="round">
        <path d={`M${x - 7} ${y - 5} Q${x} ${y - 19} ${x + 7} ${y - 5} Z`} fill="#a63a2e" stroke="#7a261d" strokeWidth={0.6} />
        <path d={`M${x - 8.8} ${y + 1.5} A8.8 8.8 0 0 1 ${x + 8.8} ${y + 1.5} L${x + 8.8} ${y + 4} L${x - 8.8} ${y + 4} Z`} fill="#5a9475" stroke="#3a6650" strokeWidth={0.8} />
        {/* The hanging cheek guard, on the side of the head that shows: seen from behind it is the near side toward the way the figure faces (the right); turned 3/4 to the camera it is the figure's own right (the page's left). */}
        <path d={front ? `M${x - 4.6} ${y + 3} L${x - 9} ${y + 3} L${x - 7.4} ${y + 10} L${x - 4.2} ${y + 8} Z` : `M${x + 4.6} ${y + 3} L${x + 9} ${y + 3} L${x + 7.4} ${y + 10} L${x + 4.2} ${y + 8} Z`} fill="#549070" stroke="#3a6650" strokeWidth={0.7} />
        <line x1={x - 8.8} y1={y + 1.8} x2={x + 8.8} y2={y + 1.8} stroke="#3a6650" strokeWidth={0.7} />
      </g>
    );
  }
  if (item === "wardenhood") return <PatrolHood x={x} y={y} front={!!front} />;
  if (item === "hood") {
    // Like the wardens' hood (a round hood, its point hanging behind), black, with no outline, a gray streak from the tip. Seen from the front it has an
    // opening: just a gap, the face beneath showing through it and, past the head, the hood's pitch-black inner side (`HoodInside`, drawn under the head).
    const A = [x - 5.6, y + 6.9], B = [x + 8.5, y + 2.6];
    const d = front
      ? `M${A[0]} ${A[1]} A8.9 8.9 0 1 1 ${B[0]} ${B[1]} Q${x + 4.5} ${y - 9} ${A[0]} ${A[1]} Z`
      : `M${x - 8.9} ${y} A8.9 8.9 0 1 1 ${x + 8.9} ${y} A8.9 8.9 0 1 1 ${x - 8.9} ${y} Z`;
    return (
      <g strokeLinejoin="round" strokeLinecap="round">
        {!front && <path d={`M${x - 2.4} ${y - 6.6} L${x - 10.4} ${y - 10.2} L${x - 7.8} ${y + 0.8} Z`} fill="#17171c" />}
        <path d={d} fill="#17171c" />
        <path d={`M${x - 10.4} ${y - 10.2} Q${x - 4} ${y - 8.5} ${x + 1.5} ${y - 0.5}`} fill="none" stroke="#5a5a64" strokeWidth={0.9} />
      </g>
    );
  }
  // The Desert Mask: cloth wrapped round the whole head, in turns, a knotted end hanging behind. Seen from the front, a real opening is cut in it for the
  // eyes (the face beneath shows through; nothing is drawn in it).
  const ring = `M${x - 8.9} ${y} A8.9 8.9 0 1 1 ${x + 8.9} ${y} A8.9 8.9 0 1 1 ${x - 8.9} ${y} Z`;
  const cx = x + 3.7;
  const hole = front ? ` M${cx - 4.6} ${y} A4.6 2.5 0 1 0 ${cx + 4.6} ${y} A4.6 2.5 0 1 0 ${cx - 4.6} ${y} Z` : "";
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={`M${x - 7} ${y - 3} L${x - 14} ${y + 2} L${x - 8} ${y + 4} Z`} fill="#d9ceb1" stroke="#b3a687" strokeWidth={0.5} />
      <path d={ring + hole} fillRule="evenodd" fill="#e3d9be" stroke="#b3a687" strokeWidth={0.6} />
      <path d={`M${x - 8.4} ${y - 3.6} Q${x} ${y - 7} ${x + 8.4} ${y - 2}`} fill="none" stroke="#b9ad8c" strokeWidth={0.7} />
      <path d={`M${x - 8.4} ${y + 4.6} Q${x} ${y + 2.8} ${x + 8.4} ${y + 5.6}`} fill="none" stroke="#b9ad8c" strokeWidth={0.7} />
      <path d={`M${x - 6} ${y + 7.4} Q${x} ${y + 5.8} ${x + 6} ${y + 8.2}`} fill="none" stroke="#b9ad8c" strokeWidth={0.7} />
    </g>
  );
}

/** The hood's inside, pitch black, drawn under the head: it shows through the hood's opening round the face. */
export function HoodInside({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x - 2.4} ${y - 6.6} L${x - 10.4} ${y - 10.2} L${x - 7.8} ${y + 0.8} Z`} fill="#050507" />
      <circle cx={x} cy={y} r={8.9} fill="#050507" />
    </g>
  );
}

function Helmet({ s }: { s: Skeleton }) {
  const [x, y] = s.head;
  return <path d={`M${x - 8.5} ${y + 2} A8.5 8.5 0 0 1 ${x + 8.5} ${y + 2} L${x + 8.5} ${y + 5} L${x - 8.5} ${y + 5} Z`} className="fig-armor-fill" />;
}

/** How far each weapon reaches from the grip, so the strike trail ends at its tip. */
export const WEAPON_REACH: Record<WeaponTier, number> = { baseline: 0, light: 15, normal: 34, heavy: 41 };

/**
 * The swing trail on a strike: a tapered crescent around the shoulder, sweeping from where the
 * weapon was raised (up and behind) to its tip, fading out as it plays.
 */
function StrikeTrail({ s, tier }: { s: Skeleton; tier: WeaponTier }) {
  const reach = WEAPON_REACH[tier];
  const rad = (s.weapon.angle * Math.PI) / 180;
  const tip: Pt = [s.weapon.at[0] + Math.cos(rad) * reach, s.weapon.at[1] + Math.sin(rad) * reach];
  // A level swing (`flat`) sweeps a flat crescent round the body at the weapon's own height; the overhead swing, a tall one round the neck.
  const flat = s.flat ?? 1;
  const pivot: Pt = s.flat ? [s.neck[0], tip[1]] : s.neck;
  const r = Math.hypot(tip[0] - pivot[0], (tip[1] - pivot[1]) / flat);
  const end = s.flat ? (tip[0] >= pivot[0] ? 0 : Math.PI) : Math.atan2(tip[1] - pivot[1], tip[0] - pivot[0]);
  const sweep = s.sweep ?? 140;
  const start = end - (sweep * Math.PI) / 180; // the swing covers 140 degrees, unless the pose says otherwise
  const sweepFlag = sweep < 0 ? 0 : 1;
  const big = Math.abs(sweep) > 180 ? 1 : 0; // (an arc of more than half a circle)
  const at = (radius: number, angle: number): Pt => [pivot[0] + Math.cos(angle) * radius, pivot[1] + Math.sin(angle) * radius * flat];
  const from = at(r, start);
  const innerEnd = at(r * 0.8, end);
  const d = [
    `M${from[0]} ${from[1]}`,
    `A${r} ${r * flat} 0 ${big} ${sweepFlag} ${tip[0]} ${tip[1]}`,      // outer edge, following the tip
    `L${innerEnd[0]} ${innerEnd[1]}`,
    `A${r * 0.9} ${r * 0.9 * flat} 0 ${big} ${1 - sweepFlag} ${from[0]} ${from[1]}`, // inner edge, tapering back to a point
    "Z",
  ].join(" ");
  return <path d={d} className="fig-trail" />;
}

interface StickFigureProps {
  /** Draw no shade disc under it (the fight's scene draws one on the floor itself). */
  noShade?: boolean;
  /** "back": the player, seen from behind, facing right.
   *  "front": an enemy, seen from the front, facing left toward the player. */
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  title?: string;
  /** "waxed": kneeling, shins bound together and head sealed in wax. "warden": the Penitent Warden. */
  variant?: Variant;
  /** The Warden's candle arm. */
  arm?: CandleArm;
  /** The Warden: the rest pose he has just left, whose trails keep fading. */
  lingerFrom?: WardenPoseName;
  /** The Warden: his flame went out this long ago (ms), smoke still leaving his hand. */
  smokeAgo?: number;
  /** The Warden: phase two's look whatever his arm. */
  phase2Look?: boolean;
  /** The Warden: his flail is on fire. */
  flailFire?: boolean;
  /** Wax caked on it (Waxed, still standing). */
  waxCaked?: boolean;
  /** You just spent Eternity on your weapon's effect: it flashes pale blue once (a new key flashes again). */
  eternalFlash?: string;
  /** The starting classes' own weapon, armor and head gear (the look, instead of the tier's). */
  weaponItem?: WeaponItem;
  armorItem?: ArmorItem;
  headItem?: HeadItem;
  /** A level swing's trail, shown on this pose: how many degrees it sweeps (positive: clockwise on the page, ending at the weapon's tip). */
  trail?: number;
  /** A patrol warden: the Penitent Warden's pointed hood over its head (its face in shadow; no beak, no cloak). */
  hooded?: boolean;
  /** Sealed whole in wax: every limb, the body and the head. */
  encased?: boolean;
  /**
   * Seen straight on, not at a 3/4 angle (the Model viewer): `front` facing the camera, `back` away from it.
   * The shoulders and hips sit level and apart, nothing is mirrored, and no limb is layered by depth.
   */
  straight?: boolean;
  /** An enemy (frail, a ribcage and no solid torso), whichever way it's seen. Default: seen from the front. */
  foe?: boolean;
  /** Only the armor, with no body: its torso piece alone (the sprite of a piece of armor, as it is worn seen from the front). */
  gearOnly?: boolean;
  /** A skeleton to draw instead of the named pose's (the map's walking frames: a stride, or a figure seen straight on). `pose` still says which kind of pose it is. */
  skeleton?: Skeleton;
  /** The hand that holds the weapon (default right). */
  hand?: Side;
  /** Label the hands and feet R and L (the Model stance). */
  sides?: boolean;
}

/** Sickly yellow wax binding the shins together (drawn behind the body). */
function WaxBinding({ s }: { s: Skeleton }) {
  return (
    <g className="fig-wax">
      <polyline points={limb(s.leadLeg.knee, s.leadLeg.foot)} className="fig-wax-bind" />
      <polyline points={limb(s.rearLeg.knee, s.rearLeg.foot)} className="fig-wax-bind" />
    </g>
  );
}

/** The lump of wax sealing the head. */
function WaxHead({ s }: { s: Skeleton }) {
  const [hx, hy] = s.head;
  return (
    <g className="fig-wax">
      <ellipse cx={hx} cy={hy} rx={9.5} ry={10} className="fig-wax-head" />
      <path d={`M${hx - 4} ${hy + 8} q1 5 0 7 M${hx + 3} ${hy + 9} q1 3 0 4`} className="fig-wax-drip" />
    </g>
  );
}

/**
 * Wax caked on a fighter still standing (Waxed): splashed over a shoulder and the back, gobbets
 * stuck to an arm and a thigh, a run of it down the head.
 */
function WaxCaked({ s, near }: { s: Skeleton; near: Pt }) {
  const [hx, hy] = s.head;
  const back = lerp(s.neck, s.hip, 0.35);
  const arm = lerp(s.freeArm.elbow, s.freeArm.hand, 0.4);
  const thigh = lerp(s.hip, s.leadLeg.knee, 0.5);
  return (
    <g className="fig-wax">
      <ellipse cx={near[0]} cy={near[1]} rx={6} ry={4.2} className="fig-wax-head" />
      <path d={`M${near[0] - 3} ${near[1] + 3} q-0.6 4 0.2 6 M${near[0] + 2} ${near[1] + 3.5} q0.5 3 0 4.5`} className="fig-wax-drip" />
      <ellipse cx={back[0]} cy={back[1]} rx={4.4} ry={5.5} className="fig-wax-head" />
      <circle cx={arm[0]} cy={arm[1]} r={3.2} className="fig-wax-head" />
      <circle cx={thigh[0]} cy={thigh[1]} r={3.6} className="fig-wax-head" />
      <path d={`M${hx - 6} ${hy - 4} q4 -5 9 -2 q-2 3 -4 3 q-1 4 -2 6 q-1 -3 -3 -7 Z`} className="fig-wax-head" />
    </g>
  );
}

/** Sealed whole in wax: a thick coat over every limb, the body and the head, drips running off it. */
function WaxShell({ s, near, far }: { s: Skeleton; near: Pt; far: Pt }) {
  const [hx, hy] = s.head;
  const parts: Pt[][] = [
    [s.hip, s.rearLeg.knee, s.rearLeg.foot],
    [s.hip, s.leadLeg.knee, s.leadLeg.foot],
    [far, near],
    [s.neck, s.hip],
    [near, s.weaponArm.elbow, s.weaponArm.hand],
    [far, s.freeArm.elbow, s.freeArm.hand],
  ];
  return (
    <g className="fig-wax">
      {parts.map((pts, i) => <polyline key={i} points={limb(...pts)} className="fig-wax-shell" />)}
      <ellipse cx={hx} cy={hy} rx={10.5} ry={11} className="fig-wax-head" />
      <path d={`M${s.hip[0] - 4} ${s.hip[1] + 4} q-1 6 0 9 M${s.hip[0] + 5} ${s.hip[1] + 3} q1 4 0 6 M${hx + 5} ${hy + 9} q1 4 0 6`} className="fig-wax-drip" />
    </g>
  );
}

/** A held wax lump, or a small flame. */
export function Prop({ prop }: { prop: NonNullable<Skeleton["prop"]> }) {
  const [x, y] = prop.at;
  // The wax torn off to throw: soft and molten, paler and glossier than the wax it came from, so it shows apart from the body even from afar;
  // it sags, drips hang from it and stretch, and drops keep falling from it.
  if (prop.kind === "wax") {
    return (
      <g transform={`translate(${x} ${y})`} className="fig-wax-molten">
        {/* Drops falling from it (they loop: swell, fall, fade). */}
        {([[-1.6, 0], [1.4, 0.45], [0.1, 0.8]] as const).map(([dx, delay], i) => (
          <circle key={`drop${i}`} cx={dx} cy={5.2} r={1.05} className="fig-wax-dribble" style={{ animationDelay: `${delay}s` }} />
        ))}
        {/* Two drips hanging from its underside, stretching and snapping back. */}
        <path d="M-2.6 2.8 Q-2.4 6.4 -1.6 6.6 Q-0.9 6.4 -0.9 3.6 Z" className="fig-wax-hang" />
        <path d="M0.9 3.4 Q1.1 7.6 1.8 7.8 Q2.5 7.6 2.6 3 Z" className="fig-wax-hang" style={{ animationDelay: "0.5s" }} />
        {/* The lump, sagging into a drop shape, with a wet shine on it. */}
        <path d="M0 -4.6 C3.4 -4.6 5 -2 4.7 0.6 C4.4 3.2 2.4 4.6 0 4.6 C-2.4 4.6 -4.5 3.3 -4.7 0.6 C-4.9 -2.2 -3.3 -4.6 0 -4.6 Z" className="fig-wax-molten-lump" />
        <ellipse cx={-1.6} cy={-2.2} rx={1.5} ry={0.9} className="fig-wax-shine" />
      </g>
    );
  }
  return <LittleFlame x={x} y={y + 2} height={9} />;
}

/** Colour the right arm and leg while posing (dev server only): see `debug` in StickFigure below. Off for now. */
const DEBUG_LIMB_COLORS = import.meta.env.DEV && false;
/** How much a T-pose's sideways arms are foreshortened in a 3/4 view (they run across the view). */
const ACROSS_34 = 0.72;

/** A figure, redrawn only when something about its look changes (the scene redraws every frame). */
export const StickFigure = memo(function StickFigure({ view, pose, weapon, armor, weaponItem, armorItem, headItem, trail, title, variant, arm, lingerFrom, smokeAgo, phase2Look, flailFire, waxCaked, eternalFlash, hooded, encased, straight = false, foe, gearOnly = false, skeleton, hand = "right", sides = false, noShade = false }: StickFigureProps) {
  // The Model viewer's Debug status: the right arm and the right leg red.
  const debugLimbs = useContext(DebugLimbsContext);
  const raw = skeleton ?? ALL_POSES[pose];
  const front = view === "front";
  // A look that draws itself (the Warden), in its own poses.
  const own = lookOf(variant)?.figure;
  if (own?.owns(raw)) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view}`} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        {!noShade && <ellipse cx={50} cy={115} rx={own.shadow.rx} ry={own.shadow.ry} className="fig-shadow" />}
        <g transform={front && !straight ? "translate(100 0) scale(-1 1)" : undefined}>
          {own.draw({ s: raw, front, straight, sides, arm, lingerFrom, smokeAgo, phase2Look, flailFire })}
        </g>
      </svg>
    );
  }
  const waxed = variant === "waxed";
  // The player and the foes are re-solved to the rig (rig.ts): each bone keeps its direction from the
  // pose but has its true length. First the torso, which the shoulders and hips are placed on.
  const base = fitTorso(raw);
  const [hx, hy] = base.head;
  const [nx, ny] = base.neck;
  // Turned 3/4, the shoulders sit slightly apart: the near one lower, toward the camera. A foe
  // (not the waxed) turns its left shoulder toward the player, ahead of it, and its right, with the
  // weapon, away; the player and the waxed have it the other way round.
  // Foes (but the waxed) are frail: a thin spine and a skinny ribcage rather than a solid torso.
  const frail = (foe ?? front) && !waxed;
  // A crossing strike twists the shoulders and hips the other way, brings the weapon arm across in
  // front of the body, and puts the right leg forward, the left behind.
  const crossing = !!raw.crossing && !waxed;
  const turned = front && !waxed && !crossing || !front && crossing;
  // (A crossing strike twists them in depth: the right shoulder swung to the front, toward the
  // camera and so lower on screen, the left to the back, away from it and higher, both staying
  // close to the middle of the ribcage. Remember the 3/4 view: front and back are depth.)
  // Seen straight on, the shoulders sit level either side of the neck, the weapon (right) one toward -x
  // from the front (the figure's right is the page's left), +x from behind.
  const side = front ? -1 : 1;
  // The model (a T-pose seen at 3/4): the body is yawed toward the camera, so the right (weapon) shoulder
  // is on the player's side of the page, from the front (the far one), and on the other, from behind (the
  // near one). Always the weapon arm goes out toward its own side: the same side as straight on.
  // A pose can be turned like the model too (`torso34`): then the model's 3/4 body, whichever way it's seen from.
  // The waxed, seen from the front in a fight, have the same 3/4 front body: chest and hips turned toward the player.
  const yaw = raw.torso34 ?? (raw.armsOut ? (front ? "front" : "back") : waxed && front ? "front" : undefined);
  const yawFront = yaw === "front";
  const modelled = !!yaw && !straight;
  // The player's own poses (`yaw`): the shoulders and the hips placed from how each is turned, the right side the near one (see body.ts).
  const yawed = !!raw.yaw && !front && !straight && !waxed;
  // The player standing facing the camera (the inventory, the class screen): the shoulders and hips turned that way too, level, the right ones on the page's left.
  const faceCam = !!raw.faceCamera && front && !straight && !waxed && foe === false;
  // The player's own poses: the near shoulder (hip) is the right one when the right side is the nearer, else the left one (a body turned the other way round).
  const rightLower = (deg: number) => Math.cos((deg * Math.PI) / 180) + Math.sin((deg * Math.PI) / 180) > 1e-6;
  const nearS = yawed && !rightLower(raw.yaw!.shoulders) ? -1 : 1;
  const nearH = yawed && !rightLower(raw.yaw!.hips) ? -1 : 1;
  const nearShoulder0: Pt = faceCam ? [nx - 4.6, ny + 2] : yawed ? [nx + onBody(0, nearS * SHOULDER_HALF, raw.yaw!.shoulders)[0], ny + 3 + onBody(0, nearS * SHOULDER_HALF, raw.yaw!.shoulders)[1]] : straight ? [nx - 6 * side, ny + 2] : modelled ? [nx + (yawFront ? -5 : 5), ny + 3] : crossing ? [nx + 2, ny + 7] : [nx + (turned ? 3 : -3), ny + 4];
  const farShoulder0: Pt = faceCam ? [nx + 4, ny + 1.2] : yawed ? [nx - onBody(0, nearS * SHOULDER_HALF, raw.yaw!.shoulders)[0], ny + 3 - onBody(0, nearS * SHOULDER_HALF, raw.yaw!.shoulders)[1]] : straight ? [nx + 6 * side, ny + 2] : modelled ? [nx + (yawFront ? 5 : -5), ny + 3] : crossing ? [nx - 2, ny - 1] : [nx + (turned ? -3 : 3), ny + 2];
  // The hips are set apart the same way, so the legs read as a left and a right: the near hip
  // carries the leading leg, the far hip the one behind. (The waxed kneel, legs bound as one.)
  // Straight on the hips are level. (A crossing strike has its own twist.)
  // In the model the shoulders and the hips are each level, and the hips close together, nearly square to the
  // player. Each hip is on its own side of the body, the same page side as the shoulder above it (the right one
  // toward +x, like the weapon arm), and nearer or farther like that shoulder: from the front the right side is
  // the far one, from behind the near one.
  const nearHip0: Pt = faceCam ? [base.hip[0] - 2.4, base.hip[1] + 0.3] : yawed ? [base.hip[0] + onBody(0, nearH * HIP_HALF, raw.yaw!.hips)[0], base.hip[1] + onBody(0, nearH * HIP_HALF, raw.yaw!.hips)[1]] : waxed && !modelled ? base.hip : modelled ? [base.hip[0] + (yawFront ? -2 : 2), base.hip[1]] : straight ? [base.hip[0] - 3.5 * side, base.hip[1]] : [base.hip[0] + (turned ? 2 : -2), base.hip[1] + 1];
  const farHip0: Pt = faceCam ? [base.hip[0] + 2.2, base.hip[1] - 0.3] : yawed ? [base.hip[0] - onBody(0, nearH * HIP_HALF, raw.yaw!.hips)[0], base.hip[1] - onBody(0, nearH * HIP_HALF, raw.yaw!.hips)[1]] : waxed && !modelled ? base.hip : modelled ? [base.hip[0] + (yawFront ? 2 : -2), base.hip[1]] : straight ? [base.hip[0] + 3.5 * side, base.hip[1]] : [base.hip[0] + (turned ? -2 : 2), base.hip[1] - 1];
  const nearShoulder = nearShoulder0, farShoulder = farShoulder0, nearHip = nearHip0, farHip = farHip0;

  // Which side is which. The right shoulder is the near one when crossing, in the model seen from behind, and
  // for the waxed seen from the front; otherwise (the default 3/4 views, straight on) it's the far one. The
  // hips are twisted the other way in the crossing strike (the right hip is the far one then); in the model
  // each hip is as near or far as the shoulder on its side.
  // (For the player: the right shoulder is the near one while the shoulders face the camera's side of the floor, and the far one once they have turned so far left that the right
  // swings round to the far side, as in a stance with the right leg leading.)
  const rad = (d: number) => (d * Math.PI) / 180;
  const rightIsNear = faceCam ? true : yawed ? rightLower(raw.yaw!.shoulders) : straight ? false : modelled ? !yawFront : crossing ? true : front && waxed;
  const rightHipNear = waxed ? false : faceCam ? true : yawed ? rightLower(raw.yaw!.hips) : modelled ? rightIsNear : crossing ? !rightIsNear : rightIsNear;
  const shoulderOf = (side: Side) => ((side === "right") === rightIsNear ? nearShoulder : farShoulder);
  const hipOf = (side: Side) => ((side === "right") === rightHipNear ? nearHip : farHip);
  // The weapon is held in the `hand` hand (the right, by default): that arm and its shoulder, and the leading
  // leg from the hip of its own side.
  const weaponShoulder = shoulderOf(hand);
  const freeShoulder = shoulderOf(hand === "right" ? "left" : "right");
  const leadSide = raw.leadSide ?? "left";
  const leadHip = hipOf(leadSide);
  const rearHip = hipOf(leadSide === "right" ? "left" : "right");
  const leadIsNear = (leadSide === "right") === rightHipNear;
  // An arm in front of the body is the near one; straight on, both arms sit behind it, in one tone.
  // The weapon arm can also cross in front of the body from the far shoulder (`weaponOver`): then it is drawn over
  // the torso, and the other arm keeps to its own side.
  const weaponShoulderNear = (hand === "right") === rightIsNear;
  const weaponBehind = straight || (raw.weaponLayer ? raw.weaponLayer === "behind" : !weaponShoulderNear && !raw.weaponOver);
  const freeBehind = straight || (raw.freeLayer ? raw.freeLayer === "behind" : weaponShoulderNear);
  // Then the limbs from them, and how far the figure drops so its feet stay where the pose put them.
  // The waxed's hips are set apart in the 3/4 front body: each leg keeps the direction its pose gave it, now from its own hip.
  const fromHip = (l: Skeleton["leadLeg"], hip: Pt): Skeleton["leadLeg"] => ({ knee: [l.knee[0] + hip[0] - base.hip[0], l.knee[1] + hip[1] - base.hip[1]], foot: [l.foot[0] + hip[0] - base.hip[0], l.foot[1] + hip[1] - base.hip[1]] });
  const legsBase = waxed && modelled ? { ...base, leadLeg: fromHip(base.leadLeg, leadHip), rearLeg: fromHip(base.rearLeg, rearHip) } : base;
  const fit = fitLimbs(legsBase, { weaponShoulder, freeShoulder, leadHip, rearHip, across: straight ? 1 : ACROSS_34, weaponLength: WEAPON_REACH[weapon] });
  // A hammer-carrying waxed, outside its attacks, holds it out ahead like a cane: its hand raised and forward.
  const stick = weapon === "heavy" && !WAXED_ATTACK_POSES.has(pose) && pose !== "w-fallen";
  const cane = stick && CANE_POSES.has(pose);
  const s = cane
    ? { ...fit.skeleton, freeArm: reachArm(freeShoulder, [freeShoulder[0] + 15, freeShoulder[1] + 18], RIG.upperArm, RIG.forearm, fit.skeleton.freeArm.elbow) }
    : fit.skeleton;
  // Debugging: the right arm and the right leg are coloured (set DEBUG_LIMB_COLORS). Blue: the far one. Red: the near
  // arm, or the leading leg. Purple: a leg that is both far and leading. (Not for the waxed.)
  const debug = (far: boolean, lead: boolean) => (!DEBUG_LIMB_COLORS || waxed ? "" : far && lead ? " dbg-both" : lead ? " dbg-lead" : far ? " dbg-far" : "");
  const rightArmDebug = debug(!rightIsNear, rightIsNear);
  const rightLeadDebug = leadSide === "right";
  // (The Model viewer's Debug status: the right arm and the right leg are drawn red.)
  const redArm = debugLimbs && hand === "right" ? " dbg-red" : "";
  const redFree = debugLimbs && hand === "left" ? " dbg-red" : "";
  const redLeg = debugLimbs ? " dbg-red" : "";
  // The weapon arm's upper arm (shoulder to elbow) can be drawn behind everything while its forearm stays in front
  // (`upperArmBehind`, for an arm crossing the body): the upper arm in the far tone, drawn first.
  const upperBehind = !!raw.upperArmBehind && !weaponBehind;
  // A weapon held across the chest (`foreBehind`): the upper arm is in front of the torso, the forearm and the blade behind it.
  const foreBehind = !!raw.foreBehind && yawed && !weaponBehind;
  const weaponDebug = (hand === "right" ? rightArmDebug : "") + redArm;
  const weaponUpperArm = upperBehind && (
    <LimbPoly pts={[weaponShoulder, s.weaponArm.elbow]} className={`fig-limb fig-far${weaponDebug}`} item={armorItem} tag="wu" />
  );
  const weaponArm = (
    <LimbPoly pts={upperBehind ? [s.weaponArm.elbow, s.weaponArm.hand] : [weaponShoulder, s.weaponArm.elbow, s.weaponArm.hand]} className={`fig-limb ${weaponBehind && !straight ? "fig-far" : ""}${weaponDebug}`} item={armorItem} tag="w" />
  );
  const freeArm = (
    <LimbPoly pts={[freeShoulder, s.freeArm.elbow, s.freeArm.hand]} className={`fig-limb ${freeBehind && !straight ? "fig-far" : ""}${hand === "left" ? rightArmDebug : ""}${redFree}`} item={armorItem} tag="f" />
  );
  // The weapon's edge side (its +y: the axe's head, the sickle's hollow edge) is kept away from the body, so it never faces the wielder: flipped over
  // its own line when, at this angle, it would.
  const edgeAway = (() => {
    const a = (s.weapon.angle * Math.PI) / 180, reach = WEAPON_REACH[weapon] / 2;
    const mid: Pt = [s.weapon.at[0] + Math.cos(a) * reach, s.weapon.at[1] + Math.sin(a) * reach];
    const body: Pt = [(s.neck[0] + s.hip[0]) / 2 - mid[0], (s.neck[1] + s.hip[1]) / 2 - mid[1]];
    return -Math.sin(a) * body[0] + Math.cos(a) * body[1] > 0 ? " scale(1 -1)" : "";
  })();
  const weaponEl = waxed ? null : (
    <g transform={`translate(${s.weapon.at[0]} ${s.weapon.at[1]}) rotate(${s.weapon.angle})${edgeAway}`}>
      <HeldWeapon tier={weapon} flash={eternalFlash} item={weaponItem} />
    </g>
  );
  // An armed waxed: the weapon in its free hand, along the forearm, resting on the floor where it would go through it.
  // (Toppled, the hammer lies on the floor by its hand instead.)
  const grip = stick ? walkingStick(s.freeArm.hand, cane ? -108 : -90) : waxedGrip(s.freeArm.elbow, s.freeArm.hand, WEAPON_REACH[weapon]);
  const freeWeaponEl = waxed && weapon !== "baseline" && (
    <g transform={`translate(${grip.at[0]} ${grip.at[1]}) rotate(${grip.angle})`}>
      <HeldWeapon tier={weapon} flash={eternalFlash} item={weaponItem} />
    </g>
  );

  const eyes = front && !waxed && !hooded ? (
          // Only enemies show a face, turned toward the player (or the camera, straight on). The player is
          // always seen from behind.
          <g className="fig-eyes">
            {straight ? (
              <>
                <circle cx={hx - 2.8} cy={hy + (raw.gaze ?? 0)} r={1.3} />
                <circle cx={hx + 2.8} cy={hy + (raw.gaze ?? 0)} r={1.3} />
              </>
            ) : (
              <>
                <circle cx={hx + 2} cy={hy + (raw.gaze ?? 0)} r={1.3} />
                <circle cx={hx + 5.4} cy={hy + (raw.gaze ?? 0)} r={1.2} />
              </>
            )}
          </g>
        ) : null;
  // A piece of armor on its own: just what is worn on the torso, not mirrored (the inventory turns the player round, so this is how it shows on you).
  if (gearOnly) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view}${armorItem ? ` armor-${armorItem}` : ""}`} aria-hidden="true">
        <g transform={fit.drop ? `translate(0 ${fit.drop})` : undefined}>
          <Armor tier={armor} s={s} near={nearShoulder} item={armorItem} turn={faceCam ? 0.5 : 0} frontShown />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 120" className={`figure figure-${view}${armorItem ? ` armor-${armorItem}` : ""}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {!noShade && <ellipse cx={50} cy={115} rx={26} ry={3} className="fig-shadow" />}
      {/* Enemies face left: mirror the whole drawing. */}
      <g transform={front && !straight ? "translate(100 0) scale(-1 1)" : undefined}>
       <g transform={fit.drop ? `translate(0 ${fit.drop})` : undefined}>
        {(trail !== undefined || pose === "strike" || pose === "sw-chop" || pose === "swing-right" || pose === "swing-left") && weapon !== "baseline" && <StrikeTrail s={trail !== undefined ? { ...s, sweep: trail, flat: 0.28 } : s} tier={weapon} />}
        {weaponUpperArm}
        {weaponBehind && weaponEl}
        {weaponBehind && weaponArm}
        {foreBehind && weaponEl}
        {foreBehind && <LimbPoly pts={[s.weaponArm.elbow, s.weaponArm.hand]} className={`fig-limb ${weaponDebug}`} item={armorItem} tag="wf" />}
        {freeBehind && freeWeaponEl}
        {freeBehind && freeArm}
        <LimbPoly pts={leadIsNear ? [rearHip, s.rearLeg.knee, s.rearLeg.foot] : [leadHip, s.leadLeg.knee, s.leadLeg.foot]} className={`fig-limb ${straight ? "" : "fig-far"}${rightHipNear ? "" : debug(true, rightLeadDebug)}${!rightHipNear ? redLeg : ""}`} item={armorItem} leg tag="l1" />
        {waxed && <WaxBinding s={s} />}
        <polyline points={limb(farShoulder, nearShoulder)} className="fig-limb" />
        {frail ? <Ribcage s={s} nearSide={straight ? 0 : Math.sign(nearShoulder[0] - nx)} behind={yaw ? !yawFront : !front || !!raw.ribsBehind} /> : <polyline points={s.waist ? limb(s.neck, s.waist, s.hip) : limb(s.neck, s.hip)} className="fig-limb" />}
        {!waxed && <polyline points={limb(farHip, nearHip)} className="fig-limb" />}
        <Armor tier={armor} s={s} near={nearShoulder} item={armorItem} turn={faceCam ? 0.5 : yawed ? onBody(1, 0, raw.yaw!.hips)[0] / Math.SQRT1_2 * 0.7 : 0} frontShown={faceCam || (yawed ? Math.sin(rad(raw.yaw!.hips)) > Math.cos(rad(raw.yaw!.hips)) : !!front && !yawed)} />
        {headItem === "hood" && front && <HoodInside x={hx} y={hy} />}
        <circle cx={hx} cy={hy} r={7.5} className="fig-head" />
        {armor === "heavy" && !hooded && !armorItem && !headItem && <Helmet s={s} />}
        {headItem && headItem !== "helm" && headItem !== "wardenhood" && eyes}
        {headItem && <HeadGear item={headItem} x={hx} y={hy} front={front} />}
        {hooded && <PatrolHood x={hx} y={hy} front={front} />}
        {!headItem && eyes}
        {/* The waxed's shins are under the binding, behind the body: only the thigh shows in front. */}
        {waxed ? <polyline points={limb(leadHip, s.leadLeg.knee)} className={`fig-limb${rightHipNear ? debug(false, rightLeadDebug) : ""}`} /> : <LimbPoly pts={leadIsNear ? [leadHip, s.leadLeg.knee, s.leadLeg.foot] : [rearHip, s.rearLeg.knee, s.rearLeg.foot]} className={`fig-limb${rightHipNear ? debug(false, rightLeadDebug) : ""}${rightHipNear ? redLeg : ""}`} item={armorItem} leg tag="l2" />}
        {waxed && <WaxHead s={s} />}
        {!freeBehind && freeWeaponEl}
        {!freeBehind && freeArm}
        {!weaponBehind && !foreBehind && weaponEl}
        {!weaponBehind && !foreBehind && weaponArm}
        {foreBehind && <LimbPoly pts={[weaponShoulder, s.weaponArm.elbow]} className={`fig-limb ${weaponDebug}`} item={armorItem} tag="wu2" />}
        {waxCaked && <WaxCaked s={s} near={nearShoulder} />}
        {encased && <WaxShell s={s} near={nearShoulder} far={farShoulder} />}
        {/* (What it holds, a flame or a lump of wax, over the wax coat, not under it.) */}
        {s.prop && <Prop prop={s.prop} />}
        {sides && <SideTags s={s} hand={hand} flip={front && !straight} />}
       </g>
      </g>
    </svg>
  );
});
