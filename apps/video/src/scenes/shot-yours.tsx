import { Placeholder } from "./placeholder";
import { shotOf } from "./timelines";

export function YoursShot() {
  return <Placeholder shot={shotOf("yours")} />;
}
