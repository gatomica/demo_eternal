/**
 * arena.tsx — the Warden's arena: sleepwalkers sealed into the floor and into wax walls around it, each
 * with a candle stub on its head. Unlit at first; once the Warden's flame breaks free (phase
 * two) they burn for the rest of the fight. Drawn like figures: in a 100 × 120 box, feet (the
 * base) on y = 114.
 */
import type { Vec } from "../render/camera";
import type { Pt } from "../render/geom";


interface ArenaProp {
  id: string;
  kind: "floor" | "wall";
  pos: Vec;
  /** Mirror it, for variety. */
  flip?: boolean;
}

/** Where the arena is centered (the fight starts with you at the origin, facing +z). */
const CENTER: Vec = { x: 3, z: 3 };

const around = (r: number, deg: number): Vec => ({
  x: CENTER.x + Math.sin((deg * Math.PI) / 180) * r,
  z: CENTER.z + Math.cos((deg * Math.PI) / 180) * r,
});

export const ARENA_PROPS: ArenaProp[] = [
  // Wax walls in a ring around the arena.
  ...[-150, -110, -70, -35, 0, 35, 70, 110, 150, 180].map((deg, i) => ({ id: `wall${i}`, kind: "wall" as const, pos: around(15, deg), flip: i % 2 === 1 })),
  // Sleepwalkers half sunk into the floor, scattered between.
  ...[
    [7.5, -125], [6.5, -80], [8, -40], [7, 20], [8.5, 55], [6.8, 95], [7.8, 135], [8.2, 165], [9.5, -15], [9.2, 75],
  ].map(([r, deg], i) => ({ id: `floor${i}`, kind: "floor" as const, pos: around(r, deg), flip: i % 2 === 0 })),
];

/** How big each kind is drawn, relative to a normal figure. */
export const PROP_SCALE: Record<ArenaProp["kind"], number> = { floor: 1, wall: 1.9 };

/** Where each kind's candle burns, in its 100 × 120 box. */
export const PROP_FLAME: Record<ArenaProp["kind"], Pt> = { floor: [52, 70], wall: [50, 34] };

/** A sealed sleepwalker, sunk into the floor or set into a wax wall; its head alight or not. */
export function SealedSleeper({ kind, lit, flip }: { kind: ArenaProp["kind"]; lit: boolean; flip?: boolean }) {
  const [fx, fy] = PROP_FLAME[kind];
  return (
    <svg viewBox="0 0 100 120" className="figure arena-prop" aria-hidden="true">
      <g transform={flip ? "translate(100 0) scale(-1 1)" : undefined}>
        {kind === "wall" ? (
          <>
            {/* A slab of old wax, drips down its face, a figure pressed into it. */}
            <path d="M14 114 L18 30 Q20 16 34 14 L66 14 Q80 16 82 30 L86 114 Z" className="arena-wall" />
            <path d="M24 40 q2 10 0 18 M76 46 q-2 12 1 20 M30 88 q-1 8 1 14" className="arena-drip" />
            <circle cx={50} cy={42} r={8} className="arena-relief" />
            <path d="M50 50 L50 82 M50 58 L34 50 L28 38 M50 58 L66 50 L72 38 M50 82 L42 104 M50 82 L58 104" className="arena-relief-limb" />
          </>
        ) : (
          <>
            {/* A mound of wax, a head and shoulders and one hand breaking out of it. */}
            <path d="M18 114 Q24 92 40 88 Q52 84 64 88 Q80 92 84 114 Z" className="arena-mound" />
            <path d="M36 98 Q40 86 52 84 Q62 86 66 96" className="arena-relief-limb" />
            <circle cx={52} cy={78} r={7.5} className="arena-head" />
            <path d="M66 96 L72 84 L70 72" className="arena-relief-limb" />
          </>
        )}
        {/* Its head burns once the arena is lit: just a flame. */}
        {lit && (
          <g className="fig-flame">
            <circle cx={fx} cy={fy - 4} r={7} className="fig-glow" />
            <path d={`M${fx} ${fy - 10} C${fx + 3.6} ${fy - 4.5} ${fx + 3.4} ${fy} ${fx} ${fy} C${fx - 3.4} ${fy} ${fx - 3.6} ${fy - 4.5} ${fx} ${fy - 10} Z`} />
            <path d={`M${fx} ${fy - 5} C${fx + 1.6} ${fy - 2} ${fx + 1.6} ${fy} ${fx} ${fy} C${fx - 1.6} ${fy} ${fx - 1.6} ${fy - 2} ${fx} ${fy - 5} Z`} className="fig-flame-core" />
          </g>
        )}
      </g>
    </svg>
  );
}
