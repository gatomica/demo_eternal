/**
 * Remains.tsx — what lies where a unit fell. A body in pieces on the floor (a few stumps, a split
 * ribcage, a head sunk half into the ground, a small pool of blood, the weapon dropped beside it),
 * or the Warden's cloak draped over a thick pool of wax. Drawn in the same 100 × 120 box as a
 * figure, so it sits where the figure stood. (The waxed lie sealed in wax instead: a figure, see
 * CombatScreen's `deathLook`.)
 */
import type { ArmorTier, WeaponTier } from "../core/types";
import { Weapon } from "./StickFigure";

type P = readonly [number, number];

/**
 * A limb broken off: a short stump. Its ends are clean unless torn: `torn` is the angle (degrees)
 * of the red edge at its far end, `tornNear` the same at its near end.
 */
function Piece({ from, to, torn, tornNear }: { from: P; to: P; torn?: number; tornNear?: number }) {
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="fig-limb" />
      {torn !== undefined && <ellipse cx={to[0]} cy={to[1]} rx={1.1} ry={2.6} transform={`rotate(${torn} ${to[0]} ${to[1]})`} className="fig-gore-cut" />}
      {tornNear !== undefined && <ellipse cx={from[0]} cy={from[1]} rx={1.1} ry={2.6} transform={`rotate(${tornNear} ${from[0]} ${from[1]})`} className="fig-gore-cut" />}
    </g>
  );
}

export function Remains({ weapon, armor }: { weapon: WeaponTier; armor: ArmorTier }) {
  return (
    <svg viewBox="0 0 100 120" className="figure figure-front" aria-hidden="true">
      <defs>
        {/* The head is half in the ground: only what lies above the ground line shows. */}
        <clipPath id="remains-head"><rect x={50} y={90} width={40} height={18} /></clipPath>
      </defs>
      <ellipse cx={50} cy={113} rx={22} ry={3.8} className="fig-gore-pool" />
      {/* What is left of the legs and arms, broken short. */}
      <Piece from={[64, 112]} to={[71, 110.5]} torn={25} />
      <Piece from={[80, 114]} to={[85, 114.5]} />
      <Piece from={[17, 112.5]} to={[23, 113.5]} torn={-40} tornNear={70} />
      <Piece from={[44, 115.5]} to={[49, 114.5]} />
      <Piece from={[10, 109]} to={[14, 107.5]} />
      {/* The torso: a ribcage split open, a few ribs showing. */}
      <g>
        <polyline points="34,108 42,105.5 48,107.5" className="fig-limb" />
        <line x1={37} y1={106.5} x2={37.5} y2={111} className="fig-rib-bone" />
        <line x1={41} y1={105} x2={41.5} y2={110} className="fig-rib-bone" />
        <line x1={45} y1={105.5} x2={45.5} y2={109.5} className="fig-rib-bone" />
        <ellipse cx={48} cy={107.5} rx={1.1} ry={2.8} transform="rotate(-15 48 107.5)" className="fig-gore-cut" />
      </g>
      {/* The head, half sunk into the ground, its face down: no eyes show. */}
      <g clipPath="url(#remains-head)">
        <circle cx={67} cy={108} r={7.5} className="fig-head" />
      </g>
      <ellipse cx={67} cy={108} rx={8.8} ry={1.7} className="fig-gore-pool" />
      {/* Its weapon, dropped. */}
      {weapon !== "baseline" && (
        <g transform="translate(6 118) rotate(-5)">
          <Weapon tier={weapon} />
        </g>
      )}
      {/* A torn-off plate of its armor. */}
      {armor !== "none" && <rect x={52} y={111} width={9} height={4.2} rx={1} className="fig-metal-fill" transform="rotate(-14 56 113)" />}
    </svg>
  );
}

/**
 * The Warden's remains (the wax burnt black, if he died in his second form): his cloak lying where he fell, a low pyramid of cloth over a thick pool of
 * wax (more of it dripping off the pool's edge), and his head laid still on its side at the center,
 * the hood's point trailing along the floor and the beak resting on the wax.
 */
export function CloakRemains({ charred }: { charred?: boolean }) {
  return (
    <svg viewBox="0 0 100 120" className={`figure figure-front ${charred ? "is-charred" : ""}`} aria-hidden="true">
      {/* The pool: thick, with a dark underside and a glossy top. */}
      <ellipse cx={50} cy={112.5} rx={46} ry={7.5} className="fig-wax-edge" />
      <ellipse cx={50} cy={109} rx={46} ry={7.5} className="fig-wax-head" />
      <path d="M8 111 q-1.5 4 0 7 M24 116 q-1 3 0 5 M76 116 q1 3 0 5 M91 111 q1.5 4 0 7" className="fig-wax-drip" />
      <ellipse cx={27} cy={107} rx={9} ry={1.6} className="fig-head-shine" />
      {/* The cloak: a low pyramid, its two faces seen at an angle, the hems sagging a little. */}
      <path d="M17 108 Q33 113 51 115 L50 95 Z" className="fig-cloak" />
      <path d="M51 115 Q69 113 84 108 L50 95 Z" className="fig-cloak fig-cloak-shade" />
      <path d="M50 95 L33 109 M50 95 L66 108.5" className="fig-cloak-fold" />
      <path d="M17 108 Q33 113 51 115 Q69 113 84 108" className="fig-cloak-wax" />
      {/* His head, on its side at the center: hood, its point behind, the dark of the mask, the beak along the floor. */}
      <g>
        <path d="M43 101 L31 105 L42 109 Z" className="fig-cloak" />
        <circle cx={51} cy={104} r={9.5} className="fig-cloak" />
        <ellipse cx={55} cy={105} rx={5.4} ry={3.6} className="fig-hood-dark" />
        <path d="M58 101.5 Q68 103 73 108 Q65 108.6 58 107.5 Z" className="fig-beak" />
      </g>
    </svg>
  );
}

/** The guide's remains: the navy cloak slumped in a heap, the orb dim beside it, a bare foot showing. */
export function GuideRemains() {
  return (
    <svg viewBox="0 0 100 120" className="figure figure-front" aria-hidden="true">
      <ellipse cx={50} cy={113} rx={30} ry={4.5} className="fig-shadow" />
      <ellipse cx={45} cy={114} rx={3.4} ry={2} className="guide-foot" />
      <path d="M22 112 Q26 96 40 94 Q47 88 56 93 Q70 94 76 112 Q50 118 22 112 Z" className="guide-cloak" />
      <path d="M56 93 Q70 84 84 96 Q76 90 62 95 Z" className="guide-cloak" />
      <path d="M36 110 Q42 100 47 96 M52 112 Q58 102 60 96" className="guide-fold" />
      <circle cx={82} cy={108} r={7} className="guide-glow" style={{ opacity: 0.25 }} />
      <circle cx={82} cy={108} r={5.5} className="guide-orb" style={{ opacity: 0.55 }} />
      <path d="M72 100 Q77 104 82 108" className="guide-string" />
    </svg>
  );
}
