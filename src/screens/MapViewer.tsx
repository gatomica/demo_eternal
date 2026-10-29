/**
 * MapViewer.tsx — the exploration map as a labelled grid, to read it and to ask for changes. One
 * level at a time, with the walls, floors and stairs of its plan, and everything placed on it:
 * keepers, gear lying about, enemies, the wax seals. Click a tile to see what is there and copy
 * its address ("level 2, x 7, y 3") to paste into a change request.
 *
 * Coordinates are the ones the code uses: the world grid, which is the plan's column/row + 1 (the
 * map has a one-tile margin). A tile's address is its whole numbers; a spot inside it ("7.5, 2.6")
 * is where something's feet are.
 */
import { useMemo, useState } from "react";
import { gearName } from "../explore/gear";
import { MAP_FOES } from "../explore/foes";
import { KEEPERS } from "../explore/keepers";
import { LEVEL_PLANS } from "../explore/plans";
import { PICKUPS } from "../explore/pickups";
import { SEALS } from "../explore/seals";
import { useKeys } from "../ui/input";

/** Pixels per tile, and the space left for the rulers. */
const C = 16, GUTTER = 30;

type MarkKind = "keeper" | "pickup" | "foe" | "seal";

/** Something placed on the map: where its feet are (world grid tiles, fractions included). */
interface Mark { kind: MarkKind; id: string; glyph: string; detail: string; x: number; y: number; z: number }

const MARKS: Mark[] = [
  ...KEEPERS.map((k): Mark => ({ kind: "keeper", id: k.id, glyph: "K", detail: `Keeper "${k.id}" (a place to rest)`, ...k.at })),
  ...PICKUPS.map((p): Mark => ({ kind: "pickup", id: p.id, glyph: "G", detail: `Pickup "${p.id}": ${gearName(p.gear)}${p.gear.eternal ? " (eternal)" : ""}`, ...p.at })),
  ...MAP_FOES.map((f): Mark => ({
    kind: "foe", id: f.id, glyph: f.kind === "warden" ? "W" : f.kind === "waxed" ? "x" : "S",
    detail: `Enemy "${f.id}" (${f.kind}${f.still ? ", still" : ""}): fight of ${f.fight.map(e => e.kind + (e.line ? ` (${e.line})` : "")).join(", ")}`,
    ...f.home,
  })),
  ...SEALS.map((s, i): Mark => ({ kind: "seal", id: `seal-${i + 1}`, glyph: "~", detail: `Wax seal ${i + 1} (closes the corridor until the tutorial is done)`, x: s.x + 0.5, y: s.y + 0.5, z: s.z })),
];

const GLYPHS: Record<string, string> = { "^": "▲", v: "▼", "<": "◀", ">": "▶", H: "H", "@": "★" };

const LEVEL_NOTES = ["below ground", "below ground", "ground floor", "above", "above", "above", "above"];

/** What the plan says about a tile, in words. */
function describeTile(c: string): string {
  if (c === ".") return "floor";
  if (c === "@") return "floor: where you start";
  if (c === "#") return "wall or pillar";
  if (c === "H") return "ladder (climbs north)";
  if (c in GLYPHS) return `stairs (uphill ${({ "^": "north", v: "south", "<": "west", ">": "east" } as Record<string, string>)[c]})`;
  return "nothing";
}

export function MapViewer({ onExit }: { onExit: () => void }) {
  const [z, setZ] = useState(2);
  const [below, setBelow] = useState(false);
  const [picked, setPicked] = useState<{ col: number; row: number } | null>(null);
  const [copied, setCopied] = useState(false);
  useKeys(key => {
    if (key === "back" || key === "pause") onExit();
    else if (key === "up") setZ(v => Math.min(LEVEL_PLANS.length - 1, v + 1));
    else if (key === "down") setZ(v => Math.max(0, v - 1));
  });

  const cols = useMemo(() => Math.max(...LEVEL_PLANS.flat().map(r => r.length)), []);
  const rows = Math.max(...LEVEL_PLANS.map(p => p.length));
  const at = (lv: number, col: number, row: number) => LEVEL_PLANS[lv]?.[row]?.[col] ?? " ";
  const marks = MARKS.filter(m => m.z === z);

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - GUTTER) / C), row = Math.floor((e.clientY - r.top - GUTTER) / C);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    setPicked({ col, row });
    setCopied(false);
  };

  // Everything standing on the picked tile, and the address to copy.
  const here = picked ? marks.filter(m => Math.floor(m.x) === picked.col + 1 && Math.floor(m.y) === picked.row + 1) : [];
  const address = picked ? `level ${z}, x ${picked.col + 1}, y ${picked.row + 1}` : "";
  const summary = picked
    ? `${address}: ${describeTile(at(z, picked.col, picked.row))}${here.map(m => `; ${m.detail} at ${m.x}, ${m.y}`).join("")}`
    : "";
  const copy = () => {
    try {
      void navigator.clipboard.writeText(summary).then(() => setCopied(true), () => {});
    } catch {
      // No clipboard here: the line above is there to copy by hand.
    }
  };

  return (
    <main className="mapviewer">
      <header className="mapviewer-head">
        <h2 className="viewer-title">Map viewer</h2>
        <div className="picker-options">
          {LEVEL_PLANS.map((_, i) => (
            <button key={i} className="chip" aria-pressed={i === z} onClick={() => { setZ(i); setPicked(null); }}>
              {i}
            </button>
          ))}
        </div>
        <span className="hint">Level {z}, {LEVEL_NOTES[z] ?? ""}</span>
        <label className="hint"><input type="checkbox" checked={below} onChange={e => setBelow(e.target.checked)} /> show level below</label>
        <button className="hud-button" onClick={onExit}>Menu</button>
      </header>

      <p className="mapviewer-info" aria-live="polite">
        {picked ? (
          <>
            {summary}{" "}
            <button className="hud-button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </>
        ) : (
          "Click a tile to see what is there. W/S change level, Q goes back."
        )}
      </p>

      <div className="mapviewer-scroll">
        <svg width={GUTTER + cols * C + 8} height={GUTTER + rows * C + 8} onClick={pick} role="img" aria-label={`Map, level ${z}`}>
          {/* Rulers, in world coordinates (plan column/row + 1), every 5. */}
          {Array.from({ length: Math.ceil(cols / 5) }, (_, i) => i * 5).map(col => (
            <text key={`x${col}`} x={GUTTER + col * C + C / 2} y={GUTTER - 8} className="mapviewer-ruler" textAnchor="middle">{col + 1}</text>
          ))}
          {Array.from({ length: Math.ceil(rows / 5) }, (_, i) => i * 5).map(row => (
            <text key={`y${row}`} x={GUTTER - 6} y={GUTTER + row * C + C / 2 + 3} className="mapviewer-ruler" textAnchor="end">{row + 1}</text>
          ))}

          {Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
            const c = at(z, col, row);
            const x = GUTTER + col * C, y = GUTTER + row * C;
            if (c === " ") {
              // Empty here: show what lies below it, if asked.
              const lower = below && z > 0 && at(z - 1, col, row) !== " " && at(z - 1, col, row) !== "#";
              return lower ? <rect key={`${col},${row}`} x={x} y={y} width={C} height={C} className="mapviewer-below" /> : null;
            }
            const kind = c === "#" ? "wall" : c === "." || c === "@" ? "floor" : "ramp";
            return (
              <g key={`${col},${row}`}>
                <rect x={x} y={y} width={C} height={C} className={`mapviewer-${kind}`} />
                {GLYPHS[c] && <text x={x + C / 2} y={y + C / 2 + 4} textAnchor="middle" className="mapviewer-glyph">{GLYPHS[c]}</text>}
              </g>
            );
          }))}

          {marks.map(m => (
            <g key={`${m.kind}-${m.id}`} className={`mapviewer-mark is-${m.kind}`}>
              <circle cx={GUTTER + (m.x - 1) * C} cy={GUTTER + (m.y - 1) * C} r={C * 0.42} />
              <text x={GUTTER + (m.x - 1) * C} y={GUTTER + (m.y - 1) * C + 4} textAnchor="middle">{m.glyph}</text>
            </g>
          ))}

          {picked && <rect x={GUTTER + picked.col * C} y={GUTTER + picked.row * C} width={C} height={C} className="mapviewer-picked" />}
        </svg>
      </div>

      <p className="hint mapviewer-legend">
        ★ start · ▲▼◀▶ stairs (uphill) · H ladder · K keeper · G gear · S sleepwalker · x waxed · W warden · ~ wax seal
      </p>
    </main>
  );
}
