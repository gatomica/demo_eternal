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

const TIER_LABELS: Record<string, string> = { baseline: "None" };

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
  const allRows = [
    { label: "Weapon", field: "weapon", options: TIER_KEYS, labels: TIER_LABELS },
    { label: "Armor", field: "armor", options: ARMOR_KEYS, labels: undefined },
    {
      label: "Encounter",
      field: "encounterId",
      options: ENCOUNTERS.map(e => e.id),
      labels: Object.fromEntries(ENCOUNTERS.map(e => [e.id, e.label])),
    },
  ] as const;
  const rows = setup.encounterId === undefined ? allRows.slice(0, 2) : allRows;
  const [row, setRow] = useState(0);

  useKeys(key => {
    if (key === "up") setRow(r => Math.max(0, r - 1));
    else if (key === "down") setRow(r => Math.min(rows.length - 1, r + 1));
    else if (key === "left" || key === "right") {
      const { field, options } = rows[row];
      onChange({ ...setup, [field]: cycle(options as readonly string[], setup[field]!, key === "right" ? 1 : -1) });
    } else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });

  return (
    <main className="setup">
      <h2 className="setup-title">{title}</h2>
      {rows.map((r, i) => (
        <Picker
          key={r.field}
          label={r.label}
          focused={i === row}
          value={setup[r.field]!}
          options={[...r.options]}
          labels={r.labels}
          onChange={v => { setRow(i); onChange({ ...setup, [r.field]: v }); }}
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
