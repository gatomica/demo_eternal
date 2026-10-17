import { useState } from "react";
import { Journeying } from "./screens/Journeying";
import { MainMenu, type Screen } from "./screens/MainMenu";
import { ModelViewer } from "./screens/ModelViewer";
import { TestCombat } from "./screens/TestCombat";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  return (
    <div className="game">
      {screen === "menu" && <MainMenu onStart={setScreen} />}
      {screen === "test" && <TestCombat onExit={() => setScreen("menu")} />}
      {screen === "explore" && <Journeying onExit={() => setScreen("menu")} />}
      {screen === "viewer" && <ModelViewer onExit={() => setScreen("menu")} />}
    </div>
  );
}
