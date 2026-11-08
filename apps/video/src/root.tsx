import "./index.css";
import { Composition } from "remotion";
import { FPS } from "./design/beat";
import { Open } from "./scenes/open";
import { FRAMES } from "./scenes/open-timeline";

export function Root() {
  return (
    <Composition
      id="scene-open"
      component={Open}
      durationInFrames={FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ probe: false }}
    />
  );
}
