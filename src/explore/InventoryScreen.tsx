/**
 * InventoryScreen.tsx — the inventory, opened on the map with E and closed with Q: the fight's
 * letterbox, your bars where they sit in a fight, your figure seen 3/4 from the front (wearing what
 * you wield, so a change shows at once), and beside it a column of slots.
 *
 * Each slot (weapon, head, armor; passive items would be more rows) is a row of places, picked with W/S
 * and A/D: the eternal place on the left (only once a piece is set there at a safe spot), the ordinary
 * place (empty, it shows only if nothing else is in the row), and, while gear of that slot lies within reach, the place "on the ground". A place shows only the
 * gear's sprite; the one under the cursor is shown large in the middle, with its name, type, lore and effects. The place you
 * wield from is highlighted. E on a place: wields it, or unequips it if you already wield it; on the
 * ground place, takes what lies there (a swap with your ordinary piece, if you have one: that one is
 * left on the ground). The map screen does what E does (`onUse`).
 */
import { useState } from "react";
import type { Player } from "../core/types";
import { PlayerBars } from "../render/HealthBar";
import { orbitBox, orbitCamera } from "../render/camera";
import { Sleepwalker3D } from "../render/Sleepwalker3D";
import { useKeys, menuSound } from "../ui/input";
import { equippedSide, type GearSpec, gearName, type Inventory as Bag, loadoutOf, pieceAt, type Slot, SLOTS } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { cardOfGear, ItemCard } from "./ItemCard";
import type { Knot } from "./tutorial";

/** You, drawn on the 3D body as in a fight: seen from the front and a little above, turned to a three-quarter view facing right (turned in 3D, never mirrored, so you keep your right hand). */
const PORTRAIT_W = 800, PORTRAIT_H = 600, PORTRAIT_AT = { x: 0, z: 6 };
const PORTRAIT_CAM = orbitCamera(PORTRAIT_AT, 6, 0.9, 6);
const PORTRAIT_BOX = orbitBox(PORTRAIT_CAM, PORTRAIT_AT, PORTRAIT_W, PORTRAIT_H);
const PORTRAIT_YAW = Math.PI / 2 + 0.9;

/** The places of a row, left to right. */
export type Place = "eternal" | "normal" | "ground";

export interface InvFocus {
  row: number;
  place: Place;
}

const SLOT_LABEL: Record<Slot, string> = { weapon: "Weapon", armor: "Armor", head: "Head" };

export function InventoryScreen({ inv, player, string, eternalString, knot, ground, start, onUse, onClose }: {
  inv: Bag;
  /** You as your bars show you: full health between fights, your revives and your Eternity. */
  player: Player;
  /** Your String, and your eternal String. */
  string?: number;
  eternalString?: number;
  /** The revive knot, once the guide has given it: it is no item here (its symbol and revives show beside your bars), but your bars need to know you have it. */
  knot?: Knot;
  /** What lies within reach on the ground, for each slot (the nearest). */
  ground: Partial<Record<Slot, GearSpec>>;
  /** Where the cursor starts (on the ground place, when you opened it to pick something up). */
  start?: InvFocus;
  onUse: (slot: Slot, place: Place) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState<InvFocus>(start ?? { row: 0, place: equippedSide(inv, "weapon") ?? "normal" });
  // (The eternal place only shows once something is set there at a safe spot; the ground place while something lies within reach.)
  // (An empty ordinary place shows only when the slot has nothing else: no eternal piece set, nothing on the ground.)
  const rows = SLOTS.length;
  const placesOf = (slot: Slot): Place[] => {
    const eternal = !!pieceAt(inv, slot, "eternal"), lying = !!ground[slot];
    return [
      ...(eternal ? ["eternal" as const] : []),
      ...(pieceAt(inv, slot, "normal") || (!eternal && !lying) ? ["normal" as const] : []),
      ...(lying ? ["ground" as const] : []),
    ];
  };
  // (The ground place goes when what lay there is taken: the cursor steps back onto the first place left.)
  const row = Math.min(focus.row, rows - 1);
  const placesAt = (r: number): Place[] => placesOf(SLOTS[r]);
  const place = placesAt(row).includes(focus.place) ? focus.place : placesAt(row)[0];

  useKeys(key => {
    menuSound(key);
    if (key === "back" || key === "pause") onClose();
    else if (key === "up" || key === "down") {
      const next = Math.max(0, Math.min(rows - 1, row + (key === "up" ? -1 : 1)));
      const places = placesAt(next);
      setFocus({ row: next, place: places.includes(place) ? place : places[0] });
    } else if (key === "left" || key === "right") {
      const places = placesAt(row);
      const i = Math.max(0, Math.min(places.length - 1, places.indexOf(place) + (key === "left" ? -1 : 1)));
      setFocus({ row, place: places[i] });
    } else if (key === "select") onUse(SLOTS[row], place);
  });

  const look = loadoutOf(inv);
  const shown = place === "ground" ? ground[SLOTS[row]] : pieceAt(inv, SLOTS[row], place);
  return (
    <div className="inv-screen is-cinematic" role="dialog" aria-label="Inventory">
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* You, large, at the side: the bottom strip comes up to your knees (as in a visual novel). */}
      <div className="inv-figure">
        <Sleepwalker3D
          pose="p3-idle" weapon={look.weapon} title="You" swayId="inventory"
          gear={{ weaponItem: look.weaponItem, armor: look.armor, armorItem: look.armorItem, headItem: look.headItem }}
          cam={PORTRAIT_CAM} at={PORTRAIT_AT} yaw={PORTRAIT_YAW} w={PORTRAIT_W} h={PORTRAIT_H} box={PORTRAIT_BOX}
        />
      </div>
      <PlayerBars player={player} string={string} eternalString={eternalString} knot={!!knot} />
      {/* The piece under the cursor, between you and the slots. */}
      <div className="class-middle">
        <ItemCard key={`${row}-${place}`} slot={SLOTS[row]} info={shown ? cardOfGear(shown) : undefined} empty="Empty" />
      </div>
      <div className="inv-stage">
        <div className="inv-column">
          {SLOTS.map((slot, r) => {
            const wielded = equippedSide(inv, slot);
            return (
              <div key={slot} className="inv-row" role="group" aria-label={SLOT_LABEL[slot]}>
                {placesOf(slot).map(p => {
                  const piece = p === "ground" ? ground[slot] : pieceAt(inv, slot, p);
                  const focused = r === row && p === place;
                  // (Bare-handed, or with no armor, no place is highlighted.)
                  const worn = !!piece && p !== "ground" && wielded === p && "id" in piece && inv[slot] === piece.id;
                  return (
                    <button
                      key={p}
                      className={`inv-place is-${p} ${worn ? "is-equipped" : ""} ${focused ? "is-focused" : ""}`}
                      onMouseEnter={() => setFocus({ row: r, place: p })}
                      onClick={() => onUse(slot, p)}
                      aria-label={`${SLOT_LABEL[slot]}, ${p === "ground" ? "on the ground" : p}: ${piece ? gearName(piece) : "empty"}${worn ? " (wielded)" : ""}`}
                    >
                      <span className="inv-place-icon">
                        {piece ? <GearSprite slot={slot} tier={piece.tier} item={piece.item} tilted /> : <GearIcon slot={slot} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="inv-keys">
        <kbd>W</kbd><kbd>S</kbd> slot · <kbd>A</kbd><kbd>D</kbd> place · <kbd>E</kbd> {place === "ground" ? "take" : "wield / unequip"} · <kbd>Q</kbd> close
      </div>
    </div>
  );
}
