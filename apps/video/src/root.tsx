import "./index.css";
import { Composition } from "remotion";
import { FPS } from "./design/motion";
import { OPEN_FRAMES, Open } from "./scenes/open";

export function Root() {
  return (
    <>
      <Composition id="open" component={Open} durationInFrames={OPEN_FRAMES} fps={FPS} width={1920} height={1080} />
    </>
  );
}
