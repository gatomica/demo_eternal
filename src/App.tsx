import { useEffect, useState } from "react";
import { playMusic } from "./audio/music";
import { toggleDev } from "./ui/dev";
import { ClassSelect } from "./screens/ClassSelect";
import type { ClassId } from "./explore/items";
import { Journeying } from "./screens/Journeying";
import { MainMenu, type Screen } from "./screens/MainMenu";
import { MapViewer } from "./screens/MapViewer";
import { MusicViewer } from "./screens/MusicViewer";
import { ModelViewer } from "./screens/ModelViewer";
import { TestCombat } from "./screens/TestCombat";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  // The class you chose for a new game.
  const [classId, setClassId] = useState<ClassId>("soldier");
  // (The developer tools: F4, secretly.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "F4") { e.preventDefault(); toggleDev(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // The menu (and choosing a class) have the church's music; the tutorial that follows goes on with it, uncut.
  useEffect(() => { if (screen === "menu" || screen === "class") playMusic("church"); }, [screen]);
  return (
    <div className="game">
      {screen === "menu" && <MainMenu onStart={setScreen} />}
      {screen === "test" && <TestCombat onExit={() => setScreen("menu")} />}
      {screen === "explore" && <Journeying onExit={() => setScreen("menu")} />}
      {screen === "class" && <ClassSelect onPick={id => { setClassId(id); setScreen("explore-new"); }} onBack={() => setScreen("menu")} />}
      {screen === "explore-new" && <Journeying fresh classId={classId} onExit={() => setScreen("menu")} />}
      {screen === "viewer" && <ModelViewer onExit={() => setScreen("menu")} />}
      {screen === "map" && <MapViewer onExit={() => setScreen("menu")} />}
      {screen === "music" && <MusicViewer onExit={() => setScreen("menu")} />}
    </div>
  );
}
