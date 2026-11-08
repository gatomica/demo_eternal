/**
 * GearViewer.tsx — the Model viewer's gear: the weapons modelled in 3D (render/gear3d.ts), one at a time, to turn round and look at from every
 * side: drag it, or pick a view, or let it spin. (The 2D figures still draw the flat sprites; these are for the 3D rig.)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { WEAPONS } from "../core/rules";
import { boundsOf, drawGear, GEAR_WEAPONS, type GearId, type V3 } from "../render/gear3d";
import { GearShape } from "../render/GearShape";
import { useKeys } from "../ui/input";

/** The views the buttons snap to: how far round (yaw) and how far up or down (pitch), in degrees. */
const VIEWS: { id: string; label: string; yaw: number; pitch: number }[] = [
  { id: "three-quarter", label: "3/4", yaw: -30, pitch: -18 },
  { id: "side", label: "Side (broad face)", yaw: 0, pitch: 0 },
  { id: "edge", label: "Edge-on", yaw: 90, pitch: 0 },
  { id: "top", label: "From above", yaw: 0, pitch: -90 },
  { id: "end", label: "Far end", yaw: -90, pitch: 0 },
];

/** The page the weapon is drawn on: 240 across, 150 high. */
const W = 240, H = 150;

export function GearViewer({ id, onChange, onBack }: { id: GearId; onChange: (id: GearId) => void; onBack: () => void }) {
  const model = GEAR_WEAPONS.find(m => m.id === id) ?? GEAR_WEAPONS[0];
  const [yaw, setYaw] = useState(VIEWS[0].yaw), [pitch, setPitch] = useState(VIEWS[0].pitch);
  const [spin, setSpin] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useKeys(key => { if (key === "back" || key === "pause") onBack(); });

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

  // The model's middle and length, to centre it and fit it on the page.
  const frame = useMemo(() => {
    const { lo, hi } = boundsOf(model.prims);
    const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    return { mid, size: Math.max(hi[0] - lo[0], (hi[1] - lo[1]) * 1.6, 12) };
  }, [model]);

  const drawn = useMemo(() => {
    const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const pxPerUnit = Math.min(8, (W * 0.78) / frame.size), dist = frame.size * 4;
    // Model space (x along, y up, z out of the broad face) to view space (x right, y down, z away), turned by yaw round the vertical, then pitch.
    const view = (p: V3): V3 => {
      const x = p[0] - frame.mid[0], y = -(p[1] - frame.mid[1]), z = -(p[2] - frame.mid[2]);
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      return [x1, y * cb - z1 * sb, y * sb + z1 * cb];
    };
    const scale = (v: V3) => (dist / (dist + v[2])) * pxPerUnit;
    const project = (v: V3): readonly [number, number] => {
      const s = scale(v);
      return [+(W / 2 + v[0] * s).toFixed(2), +(H / 2 + v[1] * s).toFixed(2)];
    };
    return drawGear(model.prims, { view, project, scale });
  }, [model, yaw, pitch, frame]);

  const tier = WEAPONS[model.tier];
  return (
    <main className="gear-viewer">
      <aside className="viewer-panel gear-panel" aria-label="Gear viewer">
        <div className="viewer-head">
          <h2 className="viewer-title">{model.name}</h2>
          <button className="hud-button viewer-change" onClick={onBack}>Change gear</button>
        </div>
        <p className="hint">{model.note}</p>
        <div className="viewer-section">
          <span className="picker-label">Weapon</span>
          <div className="picker-options">
            {GEAR_WEAPONS.map(m => (
              <button key={m.id} className="chip" aria-pressed={m.id === model.id} onClick={() => onChange(m.id)}>{m.name}</button>
            ))}
          </div>
        </div>
        <div className="viewer-section">
          <span className="picker-label">View</span>
          <div className="picker-options">
            {VIEWS.map(v => (
              <button key={v.id} className="chip" aria-pressed={Math.round(yaw) === v.yaw && Math.round(pitch) === v.pitch} onClick={() => { setSpin(false); setYaw(v.yaw); setPitch(v.pitch); }}>{v.label}</button>
            ))}
            <button className="chip viewer-toggle" aria-pressed={spin} onClick={() => setSpin(s => !s)}>{spin ? "Spin: on" : "Spin: off"}</button>
          </div>
        </div>
        <p className="hint">Drag the weapon to turn it. {model.tier === "baseline" ? "" : `${tier.label} weight, reaches ${model.reach} from the grip.`}</p>
      </aside>
      <svg
        className="gear-stage"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={model.name}
        onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; setSpin(false); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => {
          const from = drag.current;
          if (!from) return;
          // (How far it moved is worked out here, not in the updates below: React runs those later, when the drag may be over.)
          const dx = (e.clientX - from.x) * 0.5, dy = (e.clientY - from.y) * 0.5;
          drag.current = { x: e.clientX, y: e.clientY };
          setYaw(y => (y + dx) % 360);
          setPitch(p => Math.max(-90, Math.min(90, p + dy)));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <ellipse cx={W / 2} cy={H - 14} rx={W * 0.3} ry={4} className="fig-shadow" />
        {drawn.map((d, i) => <GearShape key={i} d={d} />)}
      </svg>
    </main>
  );
}
