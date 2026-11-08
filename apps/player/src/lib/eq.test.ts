import { describe, expect, test } from "bun:test";
import { BANDS, clampGains, FLAT, fromDb, headroom, PRESETS, presetOf, replayGainFactor } from "./eq";

describe("replay gain", () => {
  test("tags give the track or album gain, held under the peak", () => {
    expect(replayGainFactor({ trackGain: -6, albumGain: -3 }, false)).toBeCloseTo(0.501, 3);
    expect(replayGainFactor({ trackGain: -6, albumGain: -3 }, true)).toBeCloseTo(0.708, 3);
    expect(replayGainFactor({ trackGain: 6, trackPeak: 1 }, false)).toBe(1);
    expect(replayGainFactor({ trackGain: Number.NaN, albumGain: -6 }, false)).toBeCloseTo(0.501, 3);
  });
  test("a tag that is no number or no sane value never silences a song or blasts it", () => {
    const bad = [
      { trackGain: "abc" },
      { trackGain: null },
      { trackGain: Number.NaN },
      { trackGain: Number.POSITIVE_INFINITY },
      {},
    ] as never[];
    expect(bad.map((tags) => replayGainFactor(tags, false))).toEqual([1, 1, 1, 1, 1]);
    expect(replayGainFactor({ trackGain: 200 }, false)).toBeCloseTo(fromDb(24), 6);
    expect(replayGainFactor({ trackGain: -200 }, false)).toBeCloseTo(fromDb(-24), 6);
    expect(replayGainFactor({ trackGain: 0, trackPeak: 1e9 }, false)).toBeGreaterThanOrEqual(0.125);
    expect(replayGainFactor({ trackGain: -6, trackPeak: -1 }, false)).toBeGreaterThan(0);
  });
});

describe("equalizer maths", () => {
  test("every preset has one value per band, within ±12", () => {
    for (const gains of Object.values(PRESETS)) {
      expect(gains).toHaveLength(BANDS.length);
      for (const gain of gains) expect(Math.abs(gain)).toBeLessThanOrEqual(12);
    }
  });
  test("clampGains pads, clamps and cleans junk", () => {
    expect(clampGains(undefined)).toEqual(FLAT);
    expect(clampGains([20, -20, "x", null, 3])).toEqual([12, -12, 0, 0, 3, 0, 0, 0, 0, 0]);
  });
  test("presetOf finds a preset by its gains", () => {
    expect(presetOf([...FLAT])).toBe("flat");
    expect(presetOf([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  test("headroom takes the loudest boost off, and nothing for cuts", () => {
    expect(headroom(FLAT)).toBe(1);
    expect(headroom([-6, -3, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(headroom([6, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(0.501, 3);
  });
  test("fromDb", () => {
    expect(fromDb(0)).toBe(1);
    expect(fromDb(-6)).toBeCloseTo(0.501, 3);
  });
});
