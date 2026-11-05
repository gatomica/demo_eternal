/**
 * SetupScreen.tsx — picking a loadout (and, for Test combat, an encounter).
 */
import { useState } from "react";
import type { Loadout } from "../combat/fight";
import { ENCOUNTERS } from "../core/encounters";
import { ARMOR, WEAPONS } from "../core/rules";
import type { ArmorTier, WeaponTier } from "../core/types";
import { StickFigure } from "../render/StickFigure";
import { cycle, useKeys } from "./input";
import { Picker } from "./Picker";

/** Weapons to pick from. "None" (baseline) fights bare-handed: weak, fast attacks and a Block with no bonus. */
const TIER_KEYS = Object.keys(WEAPONS) as WeaponTier[];

/** Each weight by the weapon it is in this demo. */
const TIER_LABELS: Record<string, string> = { ...Object.fromEntries(TIER_KEYS.map(k => [k, WEAPONS[k].name])), baseline: "None" };

const ETERNAL_LABELS: Record<string, string> = { no: "Ordinary", yes: "Eternal" };

const ARMOR_KEYS = Object.keys(ARMOR) as ArmorTier[];

/**
 * W/S pick a row, A/D change the value in it, E starts, Q goes back to the menu. The encounter
 * row only shows when there's an encounter to pick (exploration has none).
 */
export function SetupScreen<S extends Loadout & { encounterId?: string }>({ setup, onChange, onStart, onExit, title = "Test combat", startLabel = "Fight" }: {
  setup: S;
  onChange: (s: S) => void;
  onStart: () => void;
  onExit: () => void;
  title?: string;
  startLabel?: string;
}) {
  // Each row: its choices, which one is picked, and how picking one changes the setup.
  type Row = { label: string; key: string; options: readonly string[]; labels?: Record<string, string>; value: string; set: (v: string) => S };
  const allRows: Row[] = [
    { label: "Weapon", key: "weapon", options: TIER_KEYS, labels: TIER_LABELS, value: setup.weapon, set: v => ({ ...setup, weapon: v as WeaponTier }) },
    // An eternal weapon carries its eternal effect, paid with Eternity (bare hands are never eternal).
    { label: "Kind", key: "eternal", options: ["no", "yes"], labels: ETERNAL_LABELS, value: setup.eternal ? "yes" : "no", set: v => ({ ...setup, eternal: v === "yes" }) },
    { label: "Armor", key: "armor", options: ARMOR_KEYS, value: setup.armor, set: v => ({ ...setup, armor: v as ArmorTier }) },
    {
      label: "Encounter",
      key: "encounterId",
      options: ENCOUNTERS.map(e => e.id),
      labels: Object.fromEntries(ENCOUNTERS.map(e => [e.id, e.label])),
      value: setup.encounterId ?? "",
      set: v => ({ ...setup, encounterId: v }),
    },
  ];
  const rows = setup.encounterId === undefined ? allRows.slice(0, 3) : allRows;
  const [row, setRow] = useState(0);

  useKeys(key => {
    if (key === "up") setRow(r => Math.max(0, r - 1));
    else if (key === "down") setRow(r => Math.min(rows.length - 1, r + 1));
    else if (key === "left" || key === "right") {
      const r = rows[row];
      onChange(r.set(cycle(r.options, r.value, key === "right" ? 1 : -1)));
    } else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });

  return (
    <main className="setup">
      <h2 className="setup-title">{title}</h2>
      {rows.map((r, i) => (
        <Picker
          key={r.key}
          label={r.label}
          focused={i === row}
          value={r.value}
          options={[...r.options]}
          labels={r.labels}
          onChange={v => { setRow(i); onChange(r.set(v)); }}
        />
      ))}
      <div className="setup-figure">
        <StickFigure view="back" pose="idle" weapon={setup.weapon} armor={setup.armor} title="Your loadout" />
      </div>
      <p className="hint">
        <kbd>W</kbd><kbd>S</kbd> choose · <kbd>A</kbd><kbd>D</kbd> change · <kbd>E</kbd> {startLabel.toLowerCase()} · <kbd>Q</kbd> menu
      </p>
      <div className="setup-buttons">
        <button className="hud-button" onClick={onExit}>Menu</button>
        <button className="commit" onClick={onStart}>{startLabel}</button>
      </div>
    </main>
  );
}
