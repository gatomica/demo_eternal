/**
 * WearViewer.tsx — the Model viewer's Wearing: you, alone in the middle, wearing the piece picked (and whatever else you put on), drawn on the 3D
 * body the fights draw you with (`Sleepwalker3D`'s `gear`). Drag to turn round you and over or under you, or pick a view, or let it spin. No fight,
 * no scene: only you and the shade under your feet.
 *
 * The camera orbits you: it looks at your chest from a little way off, turned round you (`yaw`, which turns you instead, the camera staying put) and
 * raised or lowered (`pitch`: its eye height and tilt, `Cam.eye` and `Cam.pitch`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { WEAPONS } from "../core/rules";
import type { ArmorItem, ArmorTier, HeadItem, WeaponItem, WeaponTier } from "../core/types";
import { ITEMS } from "../explore/items";
import { type Cam, HORIZON, METERS_PER_UNIT as U, projectPoint } from "../render/camera";
import { player3dPose, type PoseName } from "../render/poses";
import { Sleepwalker3D } from "../render/Sleepwalker3D";
import { useKeys } from "../ui/input";
import { PLAYER_POSES, type Wear, WEARABLES } from "./viewerModel";

/** The views the buttons snap to: how far round you are seen from (yaw, degrees: 0 your front, 90 your right) and how far above (pitch, degrees). */
const VIEWS: { id: string; label: string; yaw: number; pitch: number }[] = [
  { id: "front34", label: "3/4 front", yaw: -35, pitch: 12 },
  { id: "front", label: "Front", yaw: 0, pitch: 0 },
  { id: "side", label: "Side", yaw: 90, pitch: 0 },
  { id: "back34", label: "3/4 back", yaw: 145, pitch: 12 },
  { id: "back", label: "Back", yaw: 180, pitch: 0 },
  { id: "above", label: "Above", yaw: -20, pitch: 70 },
];

/** The screen it is drawn on (any units: the drawing scales to the page), as tall as a figure's box is to its width. */
const W = 500, H = 600;
/** How far the camera stands from what it looks at (meters), and the height it looks at: your chest. */
const DIST = 3.2, LOOK = 0.95;
/** How big you are drawn in the frame, against filling it from in front. */
const FILL = 0.84;
/** How far it can go over you and under you (degrees). */
const PITCH_MAX = 85, PITCH_MIN = -60;

/** What you hold: a starting class's weapon, a weapon of a tier, or nothing. */
type Held = WeaponItem | WeaponTier;
const CLASS_WEAPONS = (Object.keys(ITEMS) as (keyof typeof ITEMS)[]).filter(id => ITEMS[id].slot === "weapon") as WeaponItem[];
const HELD: Held[] = [...CLASS_WEAPONS, ...(Object.keys(WEAPONS) as WeaponTier[])];
const heldName = (o: Held) => (o in ITEMS ? ITEMS[o as WeaponItem].name : o === "baseline" ? "None" : WEAPONS[o as WeaponTier].name);

/** The poses to hold: the T-pose (to check proportions), then yours, as the fights draw them in 3D (lying down is left out). */
const POSES: (PoseName | "model")[] = ["model", ...PLAYER_POSES.filter(p => p !== "fallen")];

export function WearViewer({ wearing, onBack }: { wearing: Wear; onBack: () => void }) {
  const [armorItem, setArmorItem] = useState<ArmorItem | "none">(wearing.armor ?? "none");
  const [headItem, setHeadItem] = useState<HeadItem | "none">(wearing.head ?? "none");
  const [held, setHeld] = useState<Held>("baseline");
  const [pose, setPose] = useState<PoseName | "model">("model");
  const [yaw, setYaw] = useState(VIEWS[0].yaw), [pitch, setPitch] = useState(VIEWS[0].pitch);
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useKeys(key => {
    if (key === "back" || key === "pause") onBack();
    else if (key === "left" || key === "right") { setSpin(false); setYaw(y => y + (key === "right" ? 15 : -15)); }
    else if (key === "up" || key === "down") setPitch(p => clampPitch(p + (key === "up" ? 10 : -10)));
  });

  // Spinning: round and round, a little each frame.
  useEffect(() => {
    if (!spin) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      setYaw(y => (y + ((now - last) / 1000) * 45) % 360);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  const scene = useMemo(() => orbitScene(yaw, pitch), [yaw, pitch]);

  const weaponItem = held in ITEMS ? (held as WeaponItem) : undefined;
  const weapon: WeaponTier = weaponItem ? (ITEMS[weaponItem].tier as WeaponTier) : (held as WeaponTier);
  const armor: ArmorTier = armorItem === "none" ? "none" : (ITEMS[armorItem].tier as ArmorTier);
  const shown: PoseName = pose === "model" ? "t-pose" : player3dPose(pose);
  const name = [armorItem, headItem].filter(x => x !== "none").map(x => ITEMS[x as ArmorItem | HeadItem].name).join(" · ") || "Bare";

  const chips = <T extends string>(label: string, options: T[], value: T, labelOf: (o: T) => string, pick: (o: T) => void) => (
    <div className="viewer-section">
      <span className="picker-label">{label}</span>
      <div className="picker-options">
        {options.map(o => (
          <button key={o} className="chip" aria-pressed={o === value} onClick={() => pick(o)}>{labelOf(o)}</button>
        ))}
      </div>
    </div>
  );

  return (
    <main className="gear-viewer wear-viewer">
      <aside className="viewer-panel gear-panel" aria-label="Wearing viewer">
        <div className="viewer-head">
          <h2 className="viewer-title">{name}</h2>
          <button className="hud-button viewer-change" onClick={onBack}>Change</button>
        </div>
        {chips("Body", ["none" as const, ...WEARABLES.filter(id => ITEMS[id].slot === "armor") as ArmorItem[]], armorItem, o => (o === "none" ? "Plain" : ITEMS[o].name), setArmorItem)}
        {chips("Head", ["none" as const, ...WEARABLES.filter(id => ITEMS[id].slot === "head") as HeadItem[]], headItem, o => (o === "none" ? "Bare" : ITEMS[o].name), setHeadItem)}
        {chips("Holding", HELD, held, heldName, setHeld)}
        {chips("Pose", POSES, pose, o => (o === "model" ? "T-pose" : o), setPose)}
        <div className="viewer-section">
          <span className="picker-label">View</span>
          <div className="picker-options">
            {VIEWS.map(v => (
              <button key={v.id} className="chip" aria-pressed={Math.round(yaw) === v.yaw && Math.round(pitch) === v.pitch} onClick={() => { setSpin(false); setYaw(v.yaw); setPitch(v.pitch); }}>{v.label}</button>
            ))}
            <button className="chip viewer-toggle" aria-pressed={spin} onClick={() => setSpin(s => !s)}>{spin ? "Spin: on" : "Spin: off"}</button>
          </div>
        </div>
        <p className="hint">Drag to turn round you, and over or under you. <kbd>A</kbd><kbd>D</kbd> turn · <kbd>W</kbd><kbd>S</kbd> up and down</p>
      </aside>
      <div
        className="wear-stage"
        onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; setSpin(false); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => {
          const from = drag.current;
          if (!from) return;
          // (How far it moved is worked out here, not in the updates below: React runs those later, when the drag may be over.)
          const dx = (e.clientX - from.x) * 0.5, dy = (e.clientY - from.y) * 0.5;
          drag.current = { x: e.clientX, y: e.clientY };
          setYaw(y => (y + dx) % 360);
          setPitch(p => clampPitch(p + dy));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div className="wear-figure" style={{ transform: `scale(${scene.zoom})` }}>
        <svg className="wear-floor" viewBox="0 0 100 120" aria-hidden="true"><polygon points={scene.shade} className="fig-shadow" /></svg>
        <Sleepwalker3D
          pose={shown}
          weapon={weapon}
          gear={{ weaponItem, armor, armorItem: armorItem === "none" ? undefined : armorItem, headItem: headItem === "none" ? undefined : headItem }}
          title="You"
          cam={scene.cam}
          at={scene.at}
          yaw={scene.facing}
          w={W}
          h={H}
          box={scene.box}
        />
        </div>
      </div>
    </main>
  );
}

/**
 * The scene for a view: the camera, where you stand and the way you face, the figure's box on the screen and the shade under you (in the box's units).
 * `yaw`: how far round you are seen from (degrees, 0 your front); `pitch`: how far over you (degrees, under you if negative).
 */
export function orbitScene(yaw: number, pitch: number) {
  // The camera: on the floor's -z side of you, looking along +z, raised and tilted down by the pitch, so it looks at your chest from DIST away.
  // You stand at the middle of the floor and turn (the camera seeing you from `yaw` round: you face it at 0).
  const p = (pitch * Math.PI) / 180;
  const cam: Cam = { x: 0, z: -DIST * Math.cos(p), yaw: 0, eye: LOOK + DIST * Math.sin(p), pitch: p };
  const at = { x: 0, z: 0 };
  const facing = Math.PI - (yaw * Math.PI) / 180;
  // The figure's box: a figure unit as big as one at your feet, and your chest (where the camera looks, the horizon's middle) in its middle.
  const feet = projectPoint(cam, at, 0, W, H), unit = feet.ppm * U;
  const box = { x: W / 2 - 50 * unit, y: HORIZON * H - 60 * unit, w: 100 * unit, h: 120 * unit };
  // The shade under you: a disc on the floor, in the box's units.
  const shade = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2, s = projectPoint(cam, { x: 0.32 * Math.cos(a), z: 0.32 * Math.sin(a) }, 0, W, H);
    return `${((s.sx - box.x) / unit).toFixed(2)},${((s.sy - box.y) / unit).toFixed(2)}`;
  }).join(" ");
  // How much the drawing is shrunk or grown, so you look the same size from every side: as big at your chest as you are seen from in front, with
  // a margin round you. (The box goes by your feet, since the figure's thicknesses do; from above, the feet are farther than the chest, and you would
  // look bigger.)
  const chest = projectPoint(cam, at, LOOK, W, H), zoom = FILL * (feet.ppm / chest.ppm);
  return { cam, at, facing, box, shade, zoom };
}

const clampPitch = (p: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
