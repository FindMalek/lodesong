import { Placeholder } from "./placeholder";
import { shotOf } from "./timelines";

export function SessionShot() {
  return <Placeholder shot={shotOf("session")} />;
}
