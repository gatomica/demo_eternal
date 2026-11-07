/**
 * Waxed3D.tsx — the Waxed drawn from a skeleton in 3D space (rig3d.ts): its joints are placed on the
 * combat scene's floor, facing a way, and projected through the scene's camera; this connects them with
 * segments, drawn far to near by their real distance from the camera (so what is in front is drawn over
 * what is behind, from whichever way it is seen), and sizes every segment by the pixels a meter is where it is
 * (perspective).
 *
 * It draws into the same 100 × 120 box a flat figure does (the scene's `figureBox`), so the scene's click target,
 * haze and animations work as they always did; limbs may reach outside it.
 */
import { type ReactNode, useContext, useMemo } from "react";
import type { Side, WeaponTier } from "../core/types";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { type Joint, liftPose, type P3, placeRig, ribcageOf, type Seen } from "./rig3d";
import { ALL_POSES, type PoseName } from "./poses";
import { HeldWeapon, Prop } from "./StickFigure";

/** The Waxed's bodily thickness, in figure units (a pose's drawing is 100 × 120 units), before perspective. */
const LIMB = 5, BIND = 10, SHELL = 13;
/** The sealed head: the lump of wax. */
const HEAD_RX = 9.5, HEAD_RY = 10;

export interface Waxed3DProps {
  pose: PoseName;
  hand?: Side;
  weapon: WeaponTier;
  /** Wax sealing the whole body. */
  encased?: boolean;
  eternalFlash?: string;
  title?: string;
  cam: Cam;
  /** Where it stands on the floor, and the yaw it faces (rig3d.ts `facingYaw`). */
  at: Vec;
  yaw: number;
  /** Size relative to a normal figure. */
  scale?: number;
  /** The screen, and the figure's box on it (`figureBox`). */
  w: number;
  h: number;
  box: { x: number; y: number; w: number; h: number };
}

export function Waxed3D({ pose, hand = "right", weapon, encased, eternalFlash, title, cam, at, yaw, scale = 1, w, h, box }: Waxed3DProps) {
  const debug = useContext(DebugLimbsContext);
  const rig = useMemo(() => liftPose(ALL_POSES[pose], hand), [pose, hand]);
  const { seen, see, prop, origin } = placeRig(rig, at, yaw, cam, w, h, scale);

  // Screen pixels to the box's own units (its drawing is 100 × 120), and a size to what it is at the figure's feet.
  const ux = box.w / 100, uy = box.h / 120;
  const X = (p: Seen) => (p.sx - box.x) / ux, Y = (p: Seen) => (p.sy - box.y) / uy;
  const scaleAt = (...ps: Seen[]) => ps.reduce((n, p) => n + p.ppm, 0) / ps.length / origin.ppm;
  const depthOf = (...ps: Seen[]) => ps.reduce((n, p) => n + p.depth, 0) / ps.length;
  // Anything farther than the middle of the body is in its shade.
  const mid = seen.pelvis.depth;

  const parts: { key: string; depth: number; node: ReactNode }[] = [];
  /** A run of bones through these joints, `width` units thick at the figure's own distance. */
  const bones = (key: string, js: Joint[], cls: string, width = LIMB, extra = 0) => {
    const ps = js.map(j => seen[j]);
    const depth = depthOf(...ps);
    parts.push({
      key, depth: depth - extra,
      node: <polyline key={key} points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className={`${cls}${depth > mid + 0.02 && cls === "fig-limb" ? " fig-far" : ""}`} style={{ strokeWidth: width * scaleAt(...ps) }} />,
    });
  };
  const red = (side: "R" | "L") => (debug && side === "R" ? " dbg-red" : "");

  // The spine is three parts, each drawn on its own: the lower spine here, the ribcage (an ellipsoid standing on the waist-to-neck
  // line, drawn below), and the neck. No one line runs the length of it, so it can't be drawn over the ribcage or the head.
  bones("lumbar", ["pelvis", "waist"], "fig-limb");
  bones("shoulders", ["shoulderR", "shoulderL"], "fig-limb");
  bones("hips", ["hipR", "hipL"], "fig-limb");
  bones("neck", ["neck", "head"], "fig-limb");
  for (const side of ["R", "L"] as const) {
    bones(`arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], `fig-limb${red(side)}`);
    // Only the thighs show: from the knee down the legs are inside the wax that binds them.
    bones(`leg${side}`, [`hip${side}`, `knee${side}`] as Joint[], `fig-limb${red(side)}`);
    bones(`bind${side}`, [`knee${side}`, `foot${side}`] as Joint[], "fig-wax-bind", BIND, 0.002);
    if (encased) {
      bones(`shell-arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], "fig-wax-shell", SHELL, 0.003);
      bones(`shell-leg${side}`, [`hip${side}`, `knee${side}`, `foot${side}`] as Joint[], "fig-wax-shell", SHELL, 0.003);
    }
  }
  // The wax round both shins is one mass: from the knees, wherever they are apart, down to the feet, with no gap between.
  {
    const ps = [seen.kneeR, seen.kneeL, seen.footL, seen.footR];
    parts.push({ key: "bound", depth: depthOf(...ps) - 0.002, node: <polygon key="bound" points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-wax-fill" /> });
  }
  if (encased) {
    bones("shell-lumbar", ["pelvis", "waist"], "fig-wax-shell", SHELL, 0.003);
    bones("shell-ribs", ["waist", "neck"], "fig-wax-shell", SHELL, 0.003);
  }

  // The ribcage, as the sleepwalkers have: a skinny ellipsoid (an oblate spheroid) standing along the spine, with two columns
  // of rib moons lying on its front. It is a real solid in space, so it turns and narrows with the body, it follows a bent
  // spine, and the ribs on the half that faces away disappear.
  {
    const rc = ribcageOf(rig);
    /** A point on its surface: `th` round it (0 = straight ahead of the body), `up` as a share of its half height (-1 to 1). */
    const at3 = (th: number, up: number, deep = 1): Seen => {
      const ring = Math.sqrt(Math.max(0, 1 - up * up));
      const a = rc.halfWidth * ring * Math.sin(th), b = rc.halfDepth * ring * Math.cos(th) * deep, c = rc.halfHeight * up;
      const p: P3 = [0, 1, 2].map(i => rc.centre[i] + rc.side[i] * a + rc.fwd[i] * b + rc.up[i] * c) as unknown as P3;
      return see(p);
    };
    const centre = see(rc.centre as P3);
    // An ellipsoid seen from anywhere has an ellipse for its outline: worked out from where its three axes land on the screen.
    const axisOnScreen = (v: readonly number[], len: number): [number, number] => {
      const e = see([0, 1, 2].map(i => rc.centre[i] + v[i] * len) as unknown as P3);
      return [X(e) - X(centre), Y(e) - Y(centre)];
    };
    const axes = [axisOnScreen(rc.side, rc.halfWidth), axisOnScreen(rc.fwd, rc.halfDepth), axisOnScreen(rc.up, rc.halfHeight)];
    const sxx = axes.reduce((n, v) => n + v[0] * v[0], 0), syy = axes.reduce((n, v) => n + v[1] * v[1], 0), sxy = axes.reduce((n, v) => n + v[0] * v[1], 0);
    const mean = (sxx + syy) / 2, spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const outline = { rx: Math.sqrt(mean + spread), ry: Math.sqrt(Math.max(0, mean - spread)), angle: (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI };
    const crescents: ReactNode[] = [];
    const COLUMNS: [number, number][] = [[0.1, 1.08], [-1.08, -0.1]]; // the radians of each half, either side of the breastbone
    for (const [lo, hi] of COLUMNS) {
      for (const row of [0.55, 0.05, -0.45]) {
        const steps = Array.from({ length: 13 }, (_, i) => lo + ((hi - lo) * i) / 12);
        // Only the part of the rib on the near side of the ribcage shows.
        const shown = steps.map((t, i) => ({ t, i, front: at3(t, row).depth <= centre.depth + 1e-4 })).filter(s => s.front);
        if (shown.length < 2) continue;
        const top = shown.map(s => at3(s.t, row));
        // A flat bowl: the lower edge sags in the middle and meets the upper at the ends.
        const low = shown.map(s => at3(s.t, row - (1.6 * U * Math.sin((Math.PI * s.i) / 12)) / rc.halfHeight, 0.92));
        const pts = [...top, ...low.reverse()].map(p => `${X(p)},${Y(p)}`).join(" ");
        crescents.push(<polygon key={`${row}:${lo}`} points={pts} className="fig-rib" />);
      }
    }
    parts.push({
      key: "ribcage", depth: centre.depth - 0.004,
      node: <g key="ribcage"><ellipse cx={X(centre)} cy={Y(centre)} rx={outline.rx} ry={outline.ry} transform={`rotate(${outline.angle} ${X(centre)} ${Y(centre)})`} className="fig-ribcage" />{crescents}</g>,
    });
  }

  // The head: a lump of wax, a sphere in space.
  const head = seen.head, kh = scaleAt(head);
  parts.push({
    key: "head", depth: head.depth - 0.01,
    node: (
      <g key="head" className="fig-wax">
        <ellipse cx={X(head)} cy={Y(head)} rx={(encased ? HEAD_RX + 1 : HEAD_RX) * kh} ry={(encased ? HEAD_RY + 1 : HEAD_RY) * kh} className="fig-wax-head" />
        <path d={`M${X(head) - 4 * kh} ${Y(head) + 8 * kh} q${kh} ${5 * kh} 0 ${7 * kh} M${X(head) + 3 * kh} ${Y(head) + 9 * kh} q${kh} ${3 * kh} 0 ${4 * kh}`} className="fig-wax-drip" style={{ strokeWidth: 2.5 * kh }} />
      </g>
    ),
  });

  // Debug: a dot on the front of the face, level, straight ahead of the head, to tell where it looks. Hidden when it is on the far side.
  if (debug) {
    const [hx, hy, hz] = rig.joints.head;
    const face = see([hx, hy, hz + HEAD_RX * U]);
    if (face.depth < head.depth) {
      parts.push({
        key: "gaze", depth: face.depth - 0.03,
        node: <circle key="gaze" cx={X(face)} cy={Y(face)} r={1.9 * scaleAt(face)} fill="#22d3ee" stroke="#0e7490" strokeWidth={0.8 * scaleAt(face)} />,
      });
    }
  }

  // What it holds: a wax lump or a flame, in front of its hand.
  if (prop) {
    const kp = scaleAt(prop.at);
    parts.push({
      key: "prop", depth: prop.at.depth - 0.02,
      node: <g key="prop" transform={`translate(${X(prop.at)} ${Y(prop.at)}) scale(${kp})`}><Prop prop={{ kind: prop.kind, at: [0, 0] }} /></g>,
    });
  }

  // An armed Waxed holds the weapon in its free hand, pointing on along the forearm.
  if (weapon !== "baseline") {
    const free = hand === "right" ? "L" : "R";
    const elbow = seen[`elbow${free}` as Joint], grip = seen[`hand${free}` as Joint];
    const angle = (Math.atan2((grip.sy - elbow.sy) / uy, (grip.sx - elbow.sx) / ux) * 180) / Math.PI;
    parts.push({
      key: "weapon", depth: grip.depth - 0.02,
      node: (
        <g key="weapon" transform={`translate(${X(grip)} ${Y(grip)}) rotate(${angle}) scale(${scaleAt(grip)})`}>
          <HeldWeapon tier={weapon} flash={eternalFlash} />
        </g>
      ),
    });
  }

  // Joined to the ribcage and the head, never over them: the bar of the shoulders is drawn under the ribcage, and the neck under it
  // and under the head, whichever way the body is seen.
  const behind = (key: string, ...of: string[]) => {
    const p = parts.find(x => x.key === key);
    if (p) p.depth = Math.max(p.depth, ...of.map(k => parts.find(x => x.key === k)?.depth ?? 0)) + 0.001;
  };
  behind("shoulders", "ribcage");
  behind("neck", "ribcage", "head");

  parts.sort((a, b) => b.depth - a.depth); // far first

  return (
    <svg viewBox="0 0 100 120" className="figure figure-front" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <ellipse cx={50} cy={115} rx={26} ry={3} className="fig-shadow" />
      {parts.map(p => p.node)}
    </svg>
  );
}

