/**
 * Picker.tsx — a row of choices, one of them picked (weapon, armor, encounter, enemy).
 */

/** A row of choices, one of them picked. */
export function Picker<T extends string>({ label, value, options, labels, focused, onChange }: {
  label: string;
  value: T;
  options: T[];
  labels?: Record<string, string>;
  focused?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={`picker ${focused ? "is-focused" : ""}`} role="group" aria-label={label}>
      <span className="picker-label">{label}</span>
      <div className="picker-options">
        {options.map(o => (
          <button key={o} className="chip" aria-pressed={o === value} onClick={() => onChange(o)}>
            {labels?.[o] ?? o[0].toUpperCase() + o.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
