import { Placeholder } from "./placeholder";
import { shotOf } from "./timelines";

export function LandShot() {
  return <Placeholder shot={shotOf("land")} />;
}
