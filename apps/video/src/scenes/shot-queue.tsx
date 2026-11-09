import { Placeholder } from "./placeholder";
import { shotOf } from "./timelines";

export function QueueShot() {
  return <Placeholder shot={shotOf("queue")} />;
}
