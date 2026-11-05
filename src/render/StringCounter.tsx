/**
 * StringCounter.tsx — String, the resource you gain from the enemies you defeat: the counter at the top right (on the
 * health bar's row, with a ball of yarn to its right), the yarn ball itself, and the faint string that winds round an
 * enemy holding some of what you lost.
 */

/** A small ball of yarn: cream, wound round and round (`eternal`: light blue, like eternal gear). */
export function YarnBall({ className, eternal }: { className?: string; eternal?: boolean }) {
  const id = eternal ? "yarn-clip-eternal" : "yarn-clip";
  const [fill, wound] = eternal ? ["#eef8ff", "#9fc3dc"] : ["#f2efe4", "#c4bca2"];
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
export function StringCounter({ amount, pops = [], eternal = 0, spend }: { amount: number; pops?: StringPop[]; eternal?: number; spend?: { normal: number; eternal: number } }) {
  return (
    <div className="string-slot" role="status" aria-label={`${amount} String, ${eternal} eternal String`}>
      <span className="string-group is-eternal">
        <span className="string-count">{eternal}</span>
        <YarnBall className="string-ball" eternal />
        {spend && spend.eternal > 0 && <span className="string-spend">-{spend.eternal}</span>}
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

/** The two strands of the aura, as points of a double helix up a figure's 100 x 120 box. */
const STRANDS = [0, Math.PI].map(phase => {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const t = i / 47;
    return `${(50 + 30 * Math.sin(t * Math.PI * 5 + phase)).toFixed(1)} ${(114 - t * 104).toFixed(1)}`;
  });
  return `M${pts.join(" L")}`;
});

/** A thin string spiralling round a figure that holds the String you lost: faint, slowly flowing. */
export function StringAura() {
  return (
    <svg className="string-aura" viewBox="0 0 100 120" aria-hidden="true">
      {STRANDS.map((d, i) => <path key={i} d={d} style={{ animationDelay: `${-i * 1.2}s` }} />)}
    </svg>
  );
}
