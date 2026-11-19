import { expect, test } from "bun:test";
import type { DeviceServerMessage } from "@lodesong/shared/devices";
import { DeviceHub, type DevicePeer } from "./devices";

function device(id: string): DevicePeer & { got: DeviceServerMessage[] } {
  const got: DeviceServerMessage[] = [];
  return { id, name: id, session: `s-${id}`, got, send: (message) => got.push(JSON.parse(message)), close: () => undefined };
}

const playing = (position: number, isPlaying = true) =>
  JSON.stringify({ t: "state", state: { songs: [{ id: "s1", title: "Angel" }], position, playing: isPlaying } });

test("starting to play takes the session: the old device stops, the others follow", () => {
  const hub = new DeviceHub(() => 1000);
  const [mac, tab, phone] = [device("mac"), device("tab"), device("phone")];
  for (const peer of [mac, tab, phone]) hub.join("default:malek", peer);

  hub.handle("default:malek", tab, playing(3, false));
  expect(mac.got.some((message) => message.t === "state")).toBe(false);

  hub.handle("default:malek", mac, playing(3));
  expect(tab.got.at(-1)).toMatchObject({ t: "state", state: { position: 3 } });
  hub.handle("default:malek", tab, playing(0));
  expect(mac.got.some((message) => message.t === "yield")).toBe(true);
  expect(phone.got.findLast((message) => message.t === "devices")).toMatchObject({
    devices: [
      { id: "mac", active: false },
      { id: "tab", active: true },
      { id: "phone", active: false },
    ],
  });
});

test("commands reach only the playing device; a transfer hands it the playhead", () => {
  let clock = 1000;
  const hub = new DeviceHub(() => clock);
  const [mac, phone] = [device("mac"), device("phone")];
  hub.join("default:malek", mac);
  hub.join("default:malek", phone);
  hub.handle("default:malek", mac, playing(10));

  hub.handle("default:malek", phone, JSON.stringify({ t: "command", command: { action: "next" } }));
  expect(mac.got.at(-1)).toEqual({ t: "command", command: { action: "next" } });

  clock = 6000;
  hub.handle("default:malek", mac, JSON.stringify({ t: "transfer", to: "phone" }));
  expect(phone.got.at(-1)).toMatchObject({ t: "take", state: { position: 15, playing: true } });
  expect(mac.got.some((message) => message.t === "yield")).toBe(true);

  // A second transfer straight after doesn't count the same five seconds again.
  hub.handle("default:malek", phone, JSON.stringify({ t: "transfer", to: "mac" }));
  expect(mac.got.at(-1)).toMatchObject({ t: "take", state: { position: 15 } });
});

test("the playing device closing keeps where it stopped for the next one", () => {
  let clock = 1000;
  const hub = new DeviceHub(() => clock);
  const [mac, phone] = [device("mac"), device("phone")];
  hub.join("default:malek", mac);
  hub.join("default:malek", phone);
  hub.handle("default:malek", mac, playing(10));
  clock = 3000;
  hub.leave("default:malek", mac);
  expect(phone.got.at(-1)).toEqual({ t: "devices", devices: [{ id: "phone", name: "phone", active: false }] });
  hub.handle("default:malek", phone, JSON.stringify({ t: "transfer", to: "phone" }));
  expect(phone.got.at(-1)).toMatchObject({ t: "take", state: { position: 12, playing: false } });
});

test("a volume command reaches only the playing device, and a bad volume is dropped", () => {
  const hub = new DeviceHub(() => 1000);
  const [mac, phone, tab] = [device("mac"), device("phone"), device("tab")];
  hub.join("default:malek", mac);
  hub.join("default:malek", phone);
  hub.join("default:malek", tab);
  hub.handle(
    "default:malek",
    mac,
    JSON.stringify({
      t: "state",
      state: { songs: [{ id: "s1", title: "Angel" }], position: 1, playing: true, volume: 0.4, muted: false, extra: 1 },
    }),
  );
  expect(phone.got.at(-1)).toMatchObject({ t: "state", state: { volume: 0.4, muted: false } });
  expect(Object.keys((phone.got.at(-1) as { state: object }).state).sort()).toEqual(["muted", "playing", "position", "songs", "volume"]);

  const volume = (value: unknown, muted?: unknown) =>
    JSON.stringify({ t: "command", command: { action: "volume", volume: value, ...(muted === undefined ? {} : { muted }) } });
  hub.handle("default:malek", phone, volume(0.25, true));
  expect(mac.got.at(-1)).toEqual({ t: "command", command: { action: "volume", volume: 0.25, muted: true } });
  expect(tab.got.some((message) => message.t === "command")).toBe(false);
  hub.handle("default:malek", phone, JSON.stringify({ t: "command", command: { action: "volume", volume: 0.5, extra: "x", songs: [1] } }));
  expect(mac.got.at(-1)).toEqual({ t: "command", command: { action: "volume", volume: 0.5 } });

  const before = mac.got.length;
  for (const bad of [1.5, -0.1, "0.5", null, Number.NaN]) hub.handle("default:malek", phone, volume(bad));
  hub.handle("default:malek", phone, volume(0.5, "yes"));
  // The playing device can't command itself, and its own state can't carry an out-of-range volume.
  hub.handle("default:malek", mac, volume(0.9));
  hub.handle(
    "default:malek",
    mac,
    JSON.stringify({ t: "state", state: { songs: [{ id: "s1", title: "Angel" }], position: 1, playing: true, volume: 7 } }),
  );
  expect(mac.got.length).toBe(before);
  expect(phone.got.at(-1)).toMatchObject({ state: { volume: 0.4 } });
});
