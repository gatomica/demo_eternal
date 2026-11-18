/**
 * ActionWheel.tsx — the action wheel, which is also the mark over the selected target: one
 * see-through white ring. While you plan it is small and sits at the center of the selected figure;
 * focusing grows it into the wheel (always the same size, big enough to hold the target inside), and
 * cancelling shrinks it back into the mark. Four white lines cut it into four pieces, one per
 * direction (W above, A to the left, S below, D to the right); the piece being selected turns solid
 * white. The ring has no outline, and its fill fades out away from its center.
 *
 * An action with alternatives (Attack, Block) shows two shorter lines across its piece while it is the one selected. Pressing its direction
 * again opens it up: its parts take the whole wheel, one a quarter, by their own directions (A the left hand's, D the right hand's, S the one with
 * neither: the Kick; W the one with both), the actions' names and pictures fading out as the parts' fade in (`useOpening`). Only No closes it again.
 * An option made with a weapon (or the empty hand, or the Kick) is drawn as its picture instead of its name (`WheelOption.look`: the inventory's
 * sprite, the mitten, a boot), with its weapon's bar along its inner edge, as on the item card: white from its counter-clockwise end as long as
 * the Fatigue an attack with it costs, health's red from the other end as long as the damage it deals, in sixteenths of your health, and nothing
 * between. Closed, an action with alternatives shows the picture of the one it will make with its own name over it ("Attack", "Block"; Attack
 * with its bar); opened up, the kind of action of the part you are on is written in the wheel's middle (`ACTION_NAME`: a part may be of any
 * kind, as skills will be).
 *
 * In the first fights (`hints`, see `explore/hints.ts`) the keys fade in and out where they act: on the mark, a direction's
 * key on each quarter where it moves the mark, and Yes in the middle; on the wheel, each action's key on the inner side
 * of its piece, No (Cancel) in the middle, and Yes beside the action you are on. A key for something never tried flashes faster.
 */
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { pointedLine, polar, R_IN, R_OUT, RingFade, RingLines } from "../render/ring";
import { blowShares, bothHands, dualWielding, type HeldWeapon, heldStats, STAGGERED_FATIGUE, WEAPONS, type WeaponStats } from "../core/rules";
import { BootIcon, GearIcon, GearSprite } from "../explore/GearIcons";
import type { SubSlot, Wheel, WheelLook, WheelOption } from "./selection";
import type { Dir } from "../ui/input";
import { Kbd } from "../ui/Kbd";

/** A key hint: shown, and whether it flashes faster (it leads to something never tried). */
export interface KeyHint { fast: boolean }

/** The key hints on the ring in the first fights: by direction (the mark's moves, or the wheel's actions), by part of an opened-up action, and Yes. */
export interface WheelHints {
  dirs: Partial<Record<Dir, KeyHint>>;
  parts?: Partial<Record<SubSlot, KeyHint>>;
  select?: KeyHint;
}

/** A figure's box on screen, relative to the HUD, plus the HUD's size for keeping the wheel on-screen. */
export interface Anchor {
  x: number; y: number; w: number; h: number; hudW: number; hudH: number;
  /** Where the figure's middle is on screen (y), by how high or low its pose holds it: the small mark sits there, and slides back to the box's middle when the wheel opens. */
  markY?: number;
}

/** How fast the ring chases its place (per second): faster than the camera turns, so it can get there first. */
const CHASE = 16;

/** How big the ring is on screen (the same for every target): a share of the screen's height, and never wider than this share of its width. */
const SIZE_OF_HEIGHT = 0.92;
const SIZE_OF_WIDTH = 0.6;

/** The ring as the mark over a target: its size on screen, in pixels. */
const MARK_SIZE = 40;

/** How long the lines take to slide when an action opens up or closes (as long as the ring takes to grow). */
const OPEN_MS = 220;

/** The middle of each piece's direction, in degrees on screen (up is -90, since the screen's y runs down). */
const CENTER: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };

const DIRS: Dir[] = ["up", "right", "down", "left"];

/** How far out from the small mark its keys sit, and how far in from the wheel's inner edge (px). */
const HINT_OUT = 14;
const HINT_IN = 18;

/** One key hint, centred on a point of the ring's box (px from its middle). */
function HintKey({ k, at, hint, children }: { k: "up" | "left" | "down" | "right" | "yes" | "no"; at: [number, number]; hint: KeyHint; children?: ReactNode }) {
  return (
    <span className={`key-hint ${hint.fast ? "is-fast" : ""}`} style={{ left: `calc(50% + ${at[0]}px)`, top: `calc(50% + ${at[1]}px)` }}>
      <Kbd k={k} />{children}
    </span>
  );
}

/** The kind of an action, as the middle of an opened-up wheel names it. */
const ACTION_NAME: Record<WheelOption["action"]["type"], string> = { attack: "Attack", block: "Block", maneuver: "Dodge", rest: "Rest" };

/** How far below the middle the Cancel key sits while an opened action's kind is written there (px). */
const CANCEL_BELOW = 22;

/** How big an option's picture is on the ring (ring units; a piece is R_OUT - R_IN deep). */
const PICTURE = 30;
/** The bar along an opened part's inner edge: how far out from the inner edge it runs, how thick, and how far in from the part's two edges (degrees). */
const BAR_R = R_IN + 4, BAR_W = 4, BAR_GAP = 3;

/** One hand's picture: its weapon's sprite, slanted to fill the place (`turned`: seen from its other side, pointing the other way), or (empty) its mitten. */
function HandPicture({ held, side, turned }: { held: HeldWeapon; side: "left" | "right"; turned?: boolean }) {
  return held.tier === "baseline" ? <GearIcon slot="weapon" mirrored={side === "left"} faded={false} /> : <GearSprite slot="weapon" tier={held.tier} item={held.item} tilted turned={turned} />;
}

/**
 * An option's picture, centred on `at` (ring units): its weapon's sprite (an empty hand, the mitten), the Kick's boot, or both hands': the two weapons
 * crossed (the left hand's seen from its other side, pointing the other way: the same solid, not a mirror image), or the one weapon held in both (bare hands: the mitten) over a shadow of itself, below and to the
 * side.
 */
function Picture({ look, at, style }: { look: WheelLook; at: [number, number]; style?: CSSProperties }) {
  const both = look.kind === "both" ? look : null;
  const dual = both && dualWielding(both.right, both.left);
  /** Held in both hands: the weapon (the right hand's, unless only the left holds one), and the side whose picture it is. */
  const single = both && !dual ? (both.right.tier === "baseline" && both.left.tier !== "baseline" ? { held: both.left, side: "left" as const } : { held: both.right, side: "right" as const }) : null;
  return (
    <foreignObject x={at[0] - PICTURE / 2} y={at[1] - PICTURE / 2} width={PICTURE} height={PICTURE} className="wheel-picture" style={style}>
      <div className={`wheel-picture-box ${both ? "is-both" : ""}`}>
        {look.kind === "kick" ? <BootIcon />
          : look.kind === "weapon" ? <HandPicture held={look} side={look.side} />
          : dual ? <>
            <span className="wheel-both-piece is-cross-right"><HandPicture held={look.right} side="right" /></span>
            <span className="wheel-both-piece is-cross-left"><HandPicture held={look.left} side="right" turned /></span>
          </>
          : single && <>
            <span className="wheel-both-piece is-shadow"><HandPicture held={single.held} side={single.side} /></span>
            <span className="wheel-both-piece is-held"><HandPicture held={single.held} side={single.side} /></span>
          </>}
      </div>
    </foreignObject>
  );
}

/** The weapon stats an option's bar is drawn from: its weapon's, bare hands' for the Kick, both hands' together for a two-handed one. */
const statsOf = (look: WheelLook): WeaponStats =>
  look.kind === "kick" ? WEAPONS.baseline : look.kind === "both" ? bothHands(look.right, look.left) : heldStats(look);

/** An arc of the bar's circle, clockwise from one angle to another. */
function barArc(from: number, to: number): string {
  const [x0, y0] = polar(BAR_R, from), [x1, y1] = polar(BAR_R, to);
  return `M${x0} ${y0} A${BAR_R} ${BAR_R} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * A part's bar along its inner edge (from `a0` to `a1`), as long as your max health. An Attack's, as on the item card: its weapon's cost in white
 * from the counter-clockwise end; from the other end, the Death it puts on its target in black, its damage in missing health's dark red, and the
 * Fatigue it puts on its target in white just before that (the Kick's: bare hands'). A Block's (`block`): its weapon's Defense, as on the item card: missing health's dark red from the counter-clockwise end for the share of
 * a blow that comes through, empty for the share it stops.
 */
function MeasureArc({ look, a0, a1, opacity, block, blow, staggered }: {
  look: WheelLook; a0: number; a1: number; opacity: number; block?: boolean; /** A skill's own numbers, in place of its weapon's. */ blow?: ReturnType<typeof blowShares>;
  /** At a staggered enemy (see `WheelOption.staggered`): its Fatigue turns to half as much damage. */
  staggered?: { resistance: number };
}) {
  const raw = blow ?? blowShares(statsOf(look), look.kind === "both");
  // At a staggered enemy, the Fatigue the blow would put on it (the share its armor turns into Fatigue, and the Poise) is half as much damage, its own
  // part of the bar (`burst`), between the damage and the Death; no white Fatigue is left.
  const resisted = staggered ? raw.damage * Math.min(1, staggered.resistance) : 0;
  const burst = staggered ? (resisted + raw.poise) * STAGGERED_FATIGUE : 0;
  const b = staggered ? { ...raw, damage: raw.damage - resisted, poise: 0 } : raw;
  const s0 = a0 + BAR_GAP, s1 = a1 - BAR_GAP, span = s1 - s0;
  if (span <= 0) return null;
  const share = (n: number) => Math.max(0, Math.min(1, n)) * span;
  const through = block ? 1 - statsOf(look).defense : 0;
  return (
    <g className="wheel-measure" style={{ opacity }} aria-hidden="true">
      {block
        ? through > 0 && <GlowArc kind="missing" d={barArc(s0, s0 + through * span)} width={BAR_W} />
        : <>
          <path d={barArc(s0, s0 + share(b.cost))} className="wheel-measure-cost" style={{ strokeWidth: BAR_W }} />
          {b.deadly > 0 && <GlowArc kind="death" d={barArc(s1 - share(b.deadly), s1)} width={BAR_W} />}
          {burst > 0 && <path d={barArc(s1 - share(b.deadly + burst), s1 - share(b.deadly))} className="wheel-measure-burst" style={{ strokeWidth: BAR_W }} />}
          {b.damage > 0 && <GlowArc kind="missing" d={barArc(s1 - share(b.deadly + burst + b.damage), s1 - share(b.deadly + burst))} width={BAR_W} />}
          {b.poise > 0 && <path d={barArc(s1 - share(b.deadly + b.damage + b.poise), s1 - share(b.deadly + b.damage))} className="wheel-measure-cost" style={{ strokeWidth: BAR_W }} />}
        </>}
      <path d={bandOutline(BAR_R, BAR_W, s0, s1)} className="wheel-measure-edge" />
    </g>
  );
}

/**
 * Death or missing health on a bar of the wheel, drawn as on the health bars (`.bar-death`, `.bar-missing`): its colour (black, missing health's dark red),
 * and over it the same arc again through `InsetGlow`, which keeps only a thin ring just inside its edge and a soft glow reaching in from it, breathing
 * (`.wheel-measure-glow`): crimson round Death, black round missing health.
 */
function GlowArc({ kind, d, width }: { kind: "death" | "missing"; d: string; width: number }) {
  return (
    <>
      <path d={d} className={kind === "death" ? "wheel-measure-death" : "wheel-measure-damage"} style={{ strokeWidth: width }} />
      <path d={d} className="wheel-measure-glow" style={{ strokeWidth: width }} filter={`url(#${GLOW_ID[kind]})`} />
    </>
  );
}

const GLOW_ID = { death: "wheel-death-glow", missing: "wheel-missing-glow" } as const;
/** The ring's thickness and the glow's reach, in ring units (a ring unit is some 3.4 px on screen, the wheel's size: the health bar's 1 px ring and 6 px glow). */
const DEATH_RING = 0.3, DEATH_REACH = 0.9;

/**
 * The health bar's inset shadow, for a shape on the wheel: what is left is a ring just inside the shape's edge (`DEATH_RING`), and the colour blurred
 * in from all round it (`DEATH_REACH`), clipped to the shape: nothing of the shape itself. Crimson for Death, black for missing health. Over the whole
 * wheel (user space), since a thin arc's box may have no height.
 */
function InsetGlow({ kind }: { kind: "death" | "missing" }) {
  return (
    <filter id={GLOW_ID[kind]} filterUnits="userSpaceOnUse" x={-R_OUT - 10} y={-R_OUT - 10} width={2 * R_OUT + 20} height={2 * R_OUT + 20}>
      <feFlood className={`wheel-${kind}-flood`} result="crimson" />
      {/* (crimson everywhere outside the shape, blurred in over its edge, and kept only inside it: the glow) */}
      <feComposite in="crimson" in2="SourceAlpha" operator="out" result="outside" />
      <feGaussianBlur in="outside" stdDeviation={DEATH_REACH} result="blurred" />
      <feComposite in="blurred" in2="SourceAlpha" operator="in" result="glow" />
      {/* (the shape less the shape shrunk by the ring's thickness: the ring) */}
      <feMorphology in="SourceAlpha" operator="erode" radius={DEATH_RING} result="core" />
      <feComposite in="SourceAlpha" in2="core" operator="out" result="edge" />
      <feComposite in="crimson" in2="edge" operator="in" result="ring" />
      <feMerge><feMergeNode in="glow" /><feMergeNode in="ring" /></feMerge>
    </filter>
  );
}

/**
 * A bar's edge on the wheel: the outline of the band `w` wide round radius `r`, between two angles, drawn over what fills it. Inside, where nothing
 * fills it, the bar is empty: the wheel shows through (its white fade, on a piece), as the card shows through an item card's bar.
 */
function bandOutline(r: number, w: number, from: number, to: number): string {
  const ro = r + w / 2, ri = r - w / 2, big = to - from > 180 ? 1 : 0;
  const [ox0, oy0] = polar(ro, from), [ox1, oy1] = polar(ro, to), [ix1, iy1] = polar(ri, to), [ix0, iy0] = polar(ri, from);
  return `M${ox0} ${oy0} A${ro} ${ro} 0 ${big} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${ri} ${ri} 0 ${big} 0 ${ix0} ${iy0} Z`;
}

/** A skill's Eternity bar: just outside the attack's, thinner, as long as your max Eternity. */
const ETERNITY_R = BAR_R + BAR_W + 3, ETERNITY_W = 2.6;

/**
 * A skill's Eternity bar (see `WheelOption.skill`), as on the item card: the Eternity it spends in Eternity's pale blue from the
 * counter-clockwise end, the part of it your Eternity can't pay (Death on you) black after it.
 */
function EternityArc({ eternity, death, a0, a1, opacity }: { eternity: number; death: number; a0: number; a1: number; opacity: number }) {
  const s0 = a0 + BAR_GAP, s1 = a1 - BAR_GAP, span = s1 - s0;
  if (span <= 0) return null;
  const share = (n: number) => Math.max(0, Math.min(1, n)) * span;
  const paid = Math.max(0, eternity - death);
  const arc = (from: number, to: number) => {
    const [x0, y0] = polar(ETERNITY_R, from), [x1, y1] = polar(ETERNITY_R, to);
    return `M${x0} ${y0} A${ETERNITY_R} ${ETERNITY_R} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  return (
    <g className="wheel-measure" style={{ opacity }} aria-hidden="true">
      {paid > 0 && <path d={arc(s0, s0 + share(paid))} className="wheel-measure-eternity" style={{ strokeWidth: ETERNITY_W }} />}
      {death > 0 && <GlowArc kind="death" d={arc(s0 + share(paid), s0 + share(paid + death))} width={ETERNITY_W} />}
      <path d={bandOutline(ETERNITY_R, ETERNITY_W, s0, s1)} className="wheel-measure-edge" />
    </g>
  );
}

/** One piece of the ring: the sector between two angles, between the two radii. */
function piece(a0: number, a1: number): string {
  const big = a1 - a0 > 180 ? 1 : 0;
  const [ox0, oy0] = polar(R_OUT, a0), [ox1, oy1] = polar(R_OUT, a1), [ix1, iy1] = polar(R_IN, a1), [ix0, iy0] = polar(R_IN, a0);
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${big} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${big} 0 ${ix0} ${iy0} Z`;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * How far an action has opened up (0 to 1), sliding there when it opens or closes. `dir` stays the last opened
 * action's while it closes again. Without motion (reduced motion) it jumps.
 */
function useOpening(opened: Dir | null): { dir: Dir | null; k: number } {
  const [state, setState] = useState<{ dir: Dir | null; k: number }>({ dir: opened, k: opened ? 1 : 0 });
  const goal = opened ? 1 : 0;
  const now = useRef(state);
  now.current = state;
  useEffect(() => {
    const dir = opened ?? now.current.dir;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setState({ dir, k: goal }); return; }
    const from = now.current.k, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const u = Math.min(1, (t - t0) / OPEN_MS), eased = 1 - (1 - u) * (1 - u);
      setState({ dir, k: lerp(from, goal, eased) });
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [opened, goal]);
  return state;
}

/**
 * The options as the pieces of a ring around whoever you selected. WASD highlights, E commits, Q
 * closes. With a mouse, clicking a piece commits it straight away.
 */
export function ActionWheel({ wheel, open, highlight, opened, sub, center, anchor, hints, aimLabel, onHighlight, onSub, onCommit }: {
  wheel: Wheel;
  /** Focused: the ring has grown into the wheel. Otherwise it is the small mark over the target. */
  open: boolean;
  highlight: Dir | null;
  /** The action opened up into its alternatives (its direction), if any, and which part of it is highlighted. */
  opened?: Dir | null;
  sub?: SubSlot;
  /** Whose wheel it is, for readers of the screen. */
  center: string;
  anchor: Anchor | null;
  /** (Kept for callers: the ring looks the same around you as around an enemy.) */
  aroundPlayer?: boolean;
  /** The keys to show on it, in the first fights. */
  hints?: WheelHints;
  /** Aiming a skill: the mark (the rest of the wheel hidden) moves only among the enemies it can be aimed at, with the skill's name under it. */
  aimLabel?: string;
  onHighlight: (d: Dir) => void;
  /** The pointer over a part of the opened-up action. */
  onSub?: (s: SubSlot) => void;
  onCommit: (o: WheelOption) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef<{ x: number; y: number } | null>(null);
  const opening = useOpening(opened ?? null);
  // The wheel's center comes first: the big ring is centered on the target, nudged just enough to keep every option on-screen.
  // The small mark sits on that very same center (at the figure's own height while it is only a mark), so the two grow into and shrink out of each other.
  const big = anchor ? Math.min(anchor.hudH * SIZE_OF_HEIGHT, anchor.hudW * SIZE_OF_WIDTH) : 0;
  // (Only the wheel is kept on-screen by its size: the small mark may sit anywhere, at the figure's own height.)
  const reach = (open ? big : MARK_SIZE) / 2;
  const clamp = (v: number, max: number) => Math.max(reach, Math.min(max - reach, v));
  target.current = anchor && {
    x: clamp(anchor.x + anchor.w / 2, anchor.hudW),
    y: clamp(open ? anchor.y + anchor.h * 0.5 : anchor.markY ?? anchor.y + anchor.h * 0.5, anchor.hudH),
  };
  if (!anchor) shown.current = null;
  const place = () => { const el = ref.current, at = shown.current; if (el && at) { el.style.left = `${at.x}px`; el.style.top = `${at.y}px`; } };
  // It appears on its target, then keeps moving toward wherever the target is, every frame (the camera may still be turning).
  useLayoutEffect(() => { if (target.current && !shown.current) { shown.current = { ...target.current }; place(); } });
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000), to = target.current;
      last = now;
      if (to && shown.current) {
        const k = 1 - Math.exp(-dt * CHASE);
        shown.current.x += (to.x - shown.current.x) * k;
        shown.current.y += (to.y - shown.current.y) * k;
        place();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!anchor) return null;
  const size = open ? big : MARK_SIZE;

  // The action opened up into its parts (or closing again) is `od`, and `k` how far (0 closed, 1 open). Opened, its parts take the wheel's four
  // quarters by their own directions, and the actions' names and pictures fade out as the parts' fade in.
  const od = opening.dir, k = od ? opening.k : 0;
  const parts = od && k > 0 ? wheel[od]?.alternatives : undefined;
  /** The pieces are the parts' (which is lit, which is empty), past halfway. */
  const asParts = !!parts && k >= 0.5;
  const fadeOut = parts ? Math.max(0, 1 - 2 * k) : 1, fadeIn = parts ? Math.max(0, 2 * k - 1) : 0;
  // The four white lines, between the quarters.
  const lineAngles = DIRS.map(dir => CENTER[dir] + 45);
  // The two short lines across the action selected, if it has alternatives (it opens up); they fade as it opens.
  const subOwner: Dir | null = open && highlight && wheel[highlight]?.alternatives ? highlight : null;
  const subLines: { deg: number; from: number; to: number }[] = [];
  if (subOwner) {
    const c = CENTER[subOwner], inset = (R_OUT - R_IN) * 0.22;
    for (const sg of [-1, 1]) subLines.push({ deg: c + sg * 15, from: R_IN + inset, to: R_OUT - inset });
  }
  const mid = (R_IN + R_OUT) / 2;

  // The key hints (px from the box's middle). The ring's units to px: its view box is 2 * (R_OUT + 2) across.
  const unit = size / (2 * R_OUT + 4);
  const keyHints: ReactNode[] = [];
  if (hints) {
    if (!open) {
      // The mark: each direction that moves it, on its quarter, just outside; Yes in the middle.
      for (const dir of DIRS) {
        const h = hints.dirs[dir];
        if (h) keyHints.push(<HintKey key={dir} k={dir} at={polar(size / 2 + HINT_OUT, CENTER[dir])} hint={h} />);
      }
      if (hints.select) keyHints.push(<HintKey key="yes" k="yes" at={[0, 0]} hint={hints.select} />);
    } else {
      // The wheel: No (Cancel) in the middle (below the kind of action written there, while one is opened up).
      keyHints.push(<HintKey key="no" k="no" at={[0, parts ? CANCEL_BELOW : 0]} hint={{ fast: false }}><span className="key-hint-note">(Cancel)</span></HintKey>);
      const rIn = R_IN * unit - HINT_IN;
      for (const dir of DIRS) {
        // (Opened up, each part's key, on its own quarter; else each action's.)
        const h = parts ? hints.parts?.[dir] : hints.dirs[dir];
        if (!h || !(parts ? parts[dir] : wheel[dir])) continue;
        keyHints.push(<HintKey key={parts ? `part-${dir}` : dir} k={dir} at={polar(rIn, CENTER[dir])} hint={h} />);
      }
      // Yes beside the name (or picture) of what you are on.
      const where: Dir | null = parts ? sub ?? null : highlight;
      const shown = parts ? (where ? parts[where] : null) : highlight ? wheel[highlight] : null;
      if (hints.select && where && shown) {
        const deg = CENTER[where];
        // Away from the wheel's middle: past the name's (or picture's) outer edge, along the line from the middle through it
        // (left of Dodge, above Attack, right of Block, below Rest).
        const [lx, ly] = polar(mid, deg);
        // (The name's half width and half height, roughly, from its letters: the label is 9.5 units tall. A picture's: half its size.)
        const pictured = !!shown.look;
        const halfW = pictured ? Math.max(PICTURE / 2, shown.alternatives ? shown.label.length * 9.5 * 0.3 : 0) * unit : shown.label.length * 9.5 * 0.3 * unit;
        const halfH = pictured ? (PICTURE / 2) * unit : 9.5 * 0.5 * unit;
        const cos = Math.cos((deg * Math.PI) / 180), sin = Math.sin((deg * Math.PI) / 180);
        const out = Math.min(Math.abs(cos) > 1e-3 ? halfW / Math.abs(cos) : Infinity, Math.abs(sin) > 1e-3 ? halfH / Math.abs(sin) : Infinity) + 16;
        keyHints.push(<HintKey key="select" k="yes" at={[lx * unit + cos * out, ly * unit + sin * out]} hint={hints.select} />);
      }
    }
  }

  /**
   * What an option shows on its quarter: its picture (a weapon's, with its bar: an Attack's cost and damage, a Block's Defense; closed, an action
   * with alternatives has its own name written over it, and its part's bar), or its name. `opacity`: as it fades out or in while an action opens
   * up (else the wheel's own fade).
   */
  const face = (o: WheelOption, dir: Dir, opacity?: number) => {
    const a0 = CENTER[dir] - 45, a1 = CENTER[dir] + 45, at = polar(mid, CENTER[dir]);
    const style = opacity === undefined ? undefined : { opacity };
    return (
      <>
        {o.look && <MeasureArc look={o.look} a0={a0} a1={a1} opacity={opacity ?? 1} block={o.action.type === "block"} blow={o.skill?.blow} staggered={o.action.type === "attack" ? o.staggered : undefined} />}
        {o.skill && <EternityArc eternity={o.skill.eternity} death={o.skill.death} a0={a0} a1={a1} opacity={opacity ?? 1} />}
        {o.look && <Picture look={o.look} at={at} style={style} />}
        {(!o.look || o.alternatives) && <text x={at[0]} y={at[1]} className="wheel-piece-label" style={style}>{o.label}</text>}
      </>
    );
  };

  return (
    <div ref={ref} className={`wheel-overlay ${open ? "is-open" : ""}`} style={{ width: size, height: size }} role={open ? "menu" : undefined} aria-label={`Actions for ${center}`}>
      <svg className="wheel-ring" viewBox={`${-R_OUT - 2} ${-R_OUT - 2} ${2 * R_OUT + 4} ${2 * R_OUT + 4}`}>
        {/* The ring fades to nothing quickly; the piece you are on fades slowly, and is see-through all the way (so the white of Fatigue on its bar stands out). */}
        <RingFade id="wheel-fade" stops={[[0, 0.6], [0.4, 0.2], [0.85, 0], [1, 0]]} />
        <defs><InsetGlow kind="death" /><InsetGlow kind="missing" /></defs>
        <RingFade id="wheel-fade-lit" stops={[[0, 0.5], [0.6, 0.38], [1, 0.12]]} />
        {DIRS.map(dir => {
          const o = wheel[dir], part = parts?.[dir] ?? null;
          // (what this quarter is now: the opened action's part, past halfway; else the action)
          const here = asParts ? part : o;
          const lit = open && !!here && (asParts ? sub === dir : highlight === dir);
          // (a part that can't be chosen now is drawn faded, and does nothing)
          const off = !here || !!here.disabled;
          return (
            <g
              key={dir}
              role="menuitem"
              aria-disabled={off}
              aria-label={here?.label}
              className={`wheel-piece ${lit ? "is-highlighted" : ""} ${off ? "is-disabled" : ""} ${here?.disabled ? "is-unavailable" : ""}`}
              onMouseEnter={() => { if (!open || !here) return; if (asParts) onSub?.(dir); else onHighlight(dir); }}
              onClick={() => open && here && !here.disabled && onCommit(here)}
            >
              <path d={piece(CENTER[dir] - 45, CENTER[dir] + 45)} className="wheel-piece-shape" />
              {o && fadeOut > 0 && face(o, dir, parts ? fadeOut : undefined)}
              {part && fadeIn > 0 && face(part, dir, fadeIn)}
            </g>
          );
        })}
        {/* Opened up: the kind of action of the part you are on, in the middle. */}
        {parts && od && (() => {
          const on = (sub && parts[sub]) || wheel[od]!;
          return <text x={0} y={0} className="wheel-center-name" style={{ opacity: fadeIn }}>{ACTION_NAME[on.action.type]}</text>;
        })()}
        {/* The four white lines that split it: pointed at both ends. */}
        <RingLines angles={lineAngles} />
        {/* The two short lines across the selected action, when it has alternatives. */}
        {subLines.map((l, i) => (
          <path key={i} d={pointedLine(l.deg, 1.1, l.from, l.to)} className="wheel-line wheel-line-sub" style={{ opacity: fadeOut }} />
        ))}
      </svg>
      {!open && aimLabel && <span className="wheel-aim-label">{aimLabel}</span>}
      {keyHints}
    </div>
  );
}
