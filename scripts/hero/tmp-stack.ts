import { MAIN_PORTS, startFilmStack } from "./film/stack";

const stop = await startFilmStack(MAIN_PORTS, 900);
console.log("stack up");
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
await Bun.sleep(1_800_000);
stop();
