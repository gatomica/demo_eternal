/**
 * SetupScreen.tsx — picking the gear to wear (and, for Test combat, the enemies to face): the starting classes' own weapons, armors and head gear (all
 * eternal), or nothing in a slot; then either enemies counted out (every non-boss enemy, as many of each as you like) or a ready-made encounter (the
 * Warden's, the guide's).
 */
import { useRef, useState } from "react";
import { SPECIAL_ENCOUNTERS, TEST_FOE_MAX, TEST_FOES } from "../core/encounters";
import type { ArmorItem, HeadItem, WeaponItem } from "../core/types";
import { ITEMS, loadoutOfItems, type Picks } from "../explore/items";
import { StickFigure } from "../render/StickFigure";
import { cycle, useKeys, menuSound } from "./input";
import { Picker } from "./Picker";
import { Kbd } from "./Kbd";
import { useScrollFocus } from "./scrollFocus";

const WEAPON_KEYS = ["none", "shortsword", "axe", "sickle"] as const;
const ARMOR_KEYS = ["none", "bronze-chestplate", "garb", "robe"] as const;
const HEAD_KEYS = ["none", "helm", "hood", "mask", "wardenhood"] as const;

/** What each choice is called. */
const LABELS: Record<string, string> = { none: "None", ...Object.fromEntries(Object.entries(ITEMS).map(([id, i]) => [id, i.name])) };

/** The encounter that is the enemies counted out below it (`Setup.counts`), not a ready-made one. */
export const CUSTOM = "custom";

/** What Test combat's setup holds besides the gear: the encounter (`CUSTOM`, or a ready-made one's id), and how many of each enemy (`TEST_FOES` id). */
export type FoeSetup = { encounterId?: string; counts?: Record<string, number> };

/**
 * W/S pick a row, A/D change the value in it (an enemy's count down or up), E starts, Q goes back to the menu. The encounter rows only show when
 * there's an encounter to pick; the enemy counts only for a counted-out fight.
 */
export function SetupScreen<S extends Picks & FoeSetup>({ setup, onChange, onStart, onExit, title = "Test combat", startLabel = "Fight" }: {
  setup: S;
  onChange: (s: S) => void;
  onStart: () => void;
  onExit: () => void;
  title?: string;
  startLabel?: string;
}) {
  // Each row: its choices, which one is picked, and how picking one changes the setup. A count row has no choices: A and D lower and raise it.
  type Row = { label: string; key: string; options: readonly string[]; labels?: Record<string, string>; value: string; set: (v: string) => S; count?: { id: string; n: number } };
  const orNone = <T,>(v: string): T | undefined => (v === "none" ? undefined : (v as T));
  const counts = setup.counts ?? {};
  const setCount = (id: string, n: number) => ({ ...setup, counts: { ...counts, [id]: Math.max(0, Math.min(TEST_FOE_MAX, n)) } });
  const gearRows: Row[] = [
    { label: "Right hand", key: "weapon", options: WEAPON_KEYS, labels: LABELS, value: setup.weaponItem ?? "none", set: v => ({ ...setup, weaponItem: orNone<WeaponItem>(v) }) },
    { label: "Left hand", key: "offhand", options: WEAPON_KEYS, labels: LABELS, value: setup.offItem ?? "none", set: v => ({ ...setup, offItem: orNone<WeaponItem>(v) }) },
    { label: "Armor", key: "armor", options: ARMOR_KEYS, labels: LABELS, value: setup.armorItem ?? "none", set: v => ({ ...setup, armorItem: orNone<ArmorItem>(v) }) },
    { label: "Head", key: "head", options: HEAD_KEYS, labels: LABELS, value: setup.headItem ?? "none", set: v => ({ ...setup, headItem: orNone<HeadItem>(v) }) },
  ];
  const encounterRow: Row = {
    label: "Encounter",
    key: "encounterId",
    options: [CUSTOM, ...SPECIAL_ENCOUNTERS.map(e => e.id)],
    labels: { [CUSTOM]: "Enemies below", ...Object.fromEntries(SPECIAL_ENCOUNTERS.map(e => [e.id, e.label])) },
    value: setup.encounterId ?? "",
    set: v => ({ ...setup, encounterId: v }),
  };
  const countRows: Row[] = TEST_FOES.map(f => {
    const n = counts[f.id] ?? 0;
    return { label: f.label, key: `count:${f.id}`, options: [], value: String(n), set: v => setCount(f.id, Number(v)), count: { id: f.id, n } };
  });
  const picking = setup.encounterId !== undefined, custom = setup.encounterId === CUSTOM;
  const rows = [...gearRows, ...(picking ? [encounterRow] : []), ...(custom ? countRows : [])];
  const [row, setRow] = useState(0);
  const foesBox = useRef<HTMLDivElement>(null);
  useScrollFocus(foesBox, row);
  const total = TEST_FOES.reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);

  useKeys(key => {
    menuSound(key);
    if (key === "up") setRow(r => Math.max(0, r - 1));
    else if (key === "down") setRow(r => Math.min(rows.length - 1, r + 1));
    else if (key === "left" || key === "right") {
      const r = rows[row], by = key === "right" ? 1 : -1;
      onChange(r.count ? setCount(r.count.id, r.count.n + by) : r.set(cycle(r.options, r.value, by)));
    } else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });

  const look = loadoutOfItems(setup);
  const picker = (r: Row) => {
    const i = rows.indexOf(r);
    return <Picker key={r.key} label={r.label} focused={i === row} value={r.value} options={[...r.options]} labels={r.labels} onChange={v => { setRow(i); onChange(r.set(v)); }} />;
  };
  return (
    <main className="setup">
      <h2 className="setup-title">{title}</h2>
      <div className={`setup-columns ${custom ? "has-foes" : ""}`}>
        <div className="setup-gear">
          {gearRows.map(picker)}
          {picking && picker(encounterRow)}
          <div className="setup-figure">
            <StickFigure view="back" pose="idle" weapon={look.weapon} armor={look.armor} weaponItem={look.weaponItem} armorItem={look.armorItem} headItem={look.headItem} title="Your loadout" />
          </div>
        </div>
        {custom && (
          <div className="setup-foes" role="group" aria-label="Enemies">
            <span className="picker-label">Enemies ({total})</span>
            <div className="setup-foes-list" ref={foesBox}>
              {countRows.map(r => {
                const i = rows.indexOf(r), { id, n } = r.count!;
                return (
                  <div key={r.key} className={`foe-count ${i === row ? "is-focused" : ""} ${n > 0 ? "is-picked" : ""}`} onMouseEnter={() => setRow(i)}>
                    <span className="foe-count-name">{r.label}</span>
                    <button className="chip" aria-label={`Fewer: ${r.label}`} disabled={n <= 0} onClick={() => { setRow(i); onChange(setCount(id, n - 1)); }}>−</button>
                    <span className="foe-count-n">{n}</span>
                    <button className="chip" aria-label={`More: ${r.label}`} disabled={n >= TEST_FOE_MAX} onClick={() => { setRow(i); onChange(setCount(id, n + 1)); }}>+</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <p className="hint">
        <Kbd k="up" /><Kbd k="down" /> choose · <Kbd k="left" /><Kbd k="right" /> change · <Kbd k="yes" /> {startLabel.toLowerCase()} · <Kbd k="no" /> menu
      </p>
      <div className="setup-buttons">
        <button className="hud-button" onClick={onExit}>Menu</button>
        <button className="commit" disabled={custom && total === 0} onClick={onStart}>{startLabel}</button>
      </div>
    </main>
  );
}
