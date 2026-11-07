/**
 * StringCounter.tsx — String, the resource you gain from the enemies you defeat: the counter at the top right (on the
 * health bar's row, with a ball of yarn to its right), the yarn ball itself, and the single faint string that
 * coils round an enemy holding some of what you lost.
 */

/** A small ball of yarn: white, wound round and round (`eternal`: light blue, like eternal gear; `red`: the revive knot). */
export function YarnBall({ className, eternal, red }: { className?: string; eternal?: boolean; red?: boolean }) {
  const id = red ? "yarn-clip-red" : eternal ? "yarn-clip-eternal" : "yarn-clip";
  const [fill, wound] = red ? ["#f7c3bb", "#c2392f"] : eternal ? ["#c9e4ff", "#6a9fcf"] : ["#ffffff", "#d2d2d8"];
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs><clipPath id={id}><circle cx="11" cy="12" r="8.6" /></clipPath></defs>
      <circle cx="11" cy="12" r="8.6" fill={fill} />
      <g clipPath={`url(#${id})`} fill="none" stroke={wound} strokeWidth="0.9" strokeLinecap="round">
        {[-5, -1.5, 2, 5.5].map(k => <ellipse key={`h${k}`} cx="11" cy={12 + k} rx="8.6" ry="4.6" />)}
        {[-4, 4].map(k => <ellipse key={`v${k}`} cx={11 + k} cy="12" rx="4.4" ry="8.6" />)}
      </g>
    </svg>
  );
}

/** A "+X" that pops up under a counter when String lands. */
export interface StringPop { id: number; amount: number }

/**
 * How much String you have, fixed at the top right on the health bar's row, with "+X" pops floating below it as more lands: your String
 * (lost on death) on the right, and to its left the eternal String (light blue: death never takes it).
 */
export function StringCounter({ amount, pops = [], eternal = 0, eternalPops = [], spend }: { amount: number; pops?: StringPop[]; eternal?: number; eternalPops?: StringPop[]; spend?: { normal: number; eternal: number } }) {
  return (
    <div className="string-slot" role="status" aria-label={`${amount} String, ${eternal} eternal String`}>
      <span className="string-group is-eternal">
        <span className="string-count">{eternal}</span>
        <YarnBall className="string-ball" eternal />
        {spend && spend.eternal > 0 && <span className="string-spend">-{spend.eternal}</span>}
        {eternalPops.map(p => <span key={p.id} className="string-pop">+{p.amount}</span>)}
      </span>
      <span className="string-group">
        <span className="string-count">{amount}</span>
        <YarnBall className="string-ball" />
        {spend && spend.normal > 0 && <span className="string-spend">-{spend.normal}</span>}
        {pops.map(p => <span key={p.id} className="string-pop">+{p.amount}</span>)}
      </span>
    </div>
  );
}

/** The aura's string, as points up a figure's 100 x 120 box: one strand wound round it in a few turns, `phase` turned from the first. */
const strand = (phase: number) => {
  const pts = Array.from({ length: 56 }, (_, i) => {
    const t = i / 55, a = t * Math.PI * 4 + phase;
    return `${(50 + 30 * Math.sin(a)).toFixed(1)} ${(112 - t * 100 + 4 * Math.cos(a)).toFixed(1)}`;
  });
  return `M${pts.join(" L")}`;
};
/** The turns it passes through while it coils (the string slides slowly round the figure). */
const COIL_FRAMES = Array.from({ length: 9 }, (_, i) => strand((i / 8) * Math.PI * 2));
const COIL_STILL = strand(0);

/** A single thin string winding round a figure that holds the String you lost: faint, coiling gently and slowly round it. */
export function StringAura() {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <svg className="string-aura" viewBox="0 0 100 120" aria-hidden="true">
      <path d={COIL_STILL}>
        {!still && <animate attributeName="d" values={COIL_FRAMES.join(";")} dur="16s" repeatCount="indefinite" />}
      </path>
    </svg>
  );
}
