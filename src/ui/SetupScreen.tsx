/**
 * SetupScreen.tsx — picking the gear to wear (and, for Test combat, an encounter): the starting classes' own weapons, armors and head gear (all
 * eternal), or nothing in a slot.
 */
import { useState } from "react";
import { ENCOUNTERS } from "../core/encounters";
import type { ArmorItem, HeadItem, WeaponItem } from "../core/types";
import { ITEMS, loadoutOfItems, type Picks } from "../explore/items";
import { StickFigure } from "../render/StickFigure";
import { cycle, useKeys, menuSound } from "./input";
import { Picker } from "./Picker";
import { Kbd } from "./Kbd";

const WEAPON_KEYS = ["none", "shortsword", "axe", "sickle"] as const;
const ARMOR_KEYS = ["none", "bronze-chestplate", "garb", "robe"] as const;
const HEAD_KEYS = ["none", "helm", "hood", "mask", "wardenhood"] as const;

/** What each choice is called. */
const LABELS: Record<string, string> = { none: "None", ...Object.fromEntries(Object.entries(ITEMS).map(([id, i]) => [id, i.name])) };

/**
 * W/S pick a row, A/D change the value in it, E starts, Q goes back to the menu. The encounter
 * row only shows when there's an encounter to pick.
 */
export function SetupScreen<S extends Picks & { encounterId?: string }>({ setup, onChange, onStart, onExit, title = "Test combat", startLabel = "Fight" }: {
  setup: S;
  onChange: (s: S) => void;
  onStart: () => void;
  onExit: () => void;
  title?: string;
  startLabel?: string;
}) {
  // Each row: its choices, which one is picked, and how picking one changes the setup.
  type Row = { label: string; key: string; options: readonly string[]; labels?: Record<string, string>; value: string; set: (v: string) => S };
  const orNone = <T,>(v: string): T | undefined => (v === "none" ? undefined : (v as T));
  const allRows: Row[] = [
    { label: "Weapon", key: "weapon", options: WEAPON_KEYS, labels: LABELS, value: setup.weaponItem ?? "none", set: v => ({ ...setup, weaponItem: orNone<WeaponItem>(v) }) },
    { label: "Armor", key: "armor", options: ARMOR_KEYS, labels: LABELS, value: setup.armorItem ?? "none", set: v => ({ ...setup, armorItem: orNone<ArmorItem>(v) }) },
    { label: "Head", key: "head", options: HEAD_KEYS, labels: LABELS, value: setup.headItem ?? "none", set: v => ({ ...setup, headItem: orNone<HeadItem>(v) }) },
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
    menuSound(key);
    if (key === "up") setRow(r => Math.max(0, r - 1));
    else if (key === "down") setRow(r => Math.min(rows.length - 1, r + 1));
    else if (key === "left" || key === "right") {
      const r = rows[row];
      onChange(r.set(cycle(r.options, r.value, key === "right" ? 1 : -1)));
    } else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });

  const look = loadoutOfItems(setup);
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
        <StickFigure view="back" pose="idle" weapon={look.weapon} armor={look.armor} weaponItem={look.weaponItem} armorItem={look.armorItem} headItem={look.headItem} title="Your loadout" />
      </div>
      <p className="hint">
        <Kbd k="up" /><Kbd k="down" /> choose · <Kbd k="left" /><Kbd k="right" /> change · <Kbd k="yes" /> {startLabel.toLowerCase()} · <Kbd k="no" /> menu
      </p>
      <div className="setup-buttons">
        <button className="hud-button" onClick={onExit}>Menu</button>
        <button className="commit" onClick={onStart}>{startLabel}</button>
      </div>
    </main>
  );
}
