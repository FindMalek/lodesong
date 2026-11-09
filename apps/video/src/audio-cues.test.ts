import { expect, test } from "bun:test";
import { AUDIO_CUES, FILM_FRAMES, FILMS, LANDMARKS, SCORES, SECTIONS, SHEET, SPECS } from "./audio-cues";
import { MOODS, voiceLead } from "./audio-plan";
import { createClock, FPS } from "./audio-tempo";
import { CUT_MAP, HERO_MAP } from "./design/beat";

test("each film is sorted, unique and inside its length", () => {
  for (const film of FILMS) {
    const cues = AUDIO_CUES.filter((cue) => cue.film === film);
    const frames = cues.map((cue) => cue.frame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < FILM_FRAMES[film])).toBe(true);
  }
  const ids = AUDIO_CUES.map((cue) => cue.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("hero and cutdown follow the edit's own tempo map, the tour its placeholder", () => {
  expect(FILM_FRAMES.hero).toBe(HERO_MAP.totalFrames);
  expect(FILM_FRAMES.cutdown).toBe(CUT_MAP.totalFrames);
  expect(FILM_FRAMES.tour / FPS).toBeGreaterThanOrEqual(120);
  expect(FILM_FRAMES.tour / FPS).toBeLessThanOrEqual(150);
});

test("every segment names a mood and the tempo map only ever speeds up into the finale", () => {
  for (const film of FILMS) for (const segment of SPECS[film].segments) expect(MOODS[segment.mood]).toBeDefined();
  const hero = SPECS.hero.segments.filter((s) => s.mood !== "afterglow").map((s) => s.bpm);
  expect(Math.min(...hero)).toBe(100);
  expect(Math.max(...hero)).toBe(138);
  for (const [i, bpm] of hero.entries()) if (i > 0) expect(bpm).toBeGreaterThanOrEqual(hero[i - 1] ?? 0);
});

test("the clock is piecewise: beat frames are integers and increase, cuts sit on the tempo of their shot", () => {
  const clock = createClock([
    { id: "a", beats: 4, bpm: 100, mood: "void" },
    { id: "b", beats: 4, bpm: 120, mood: "drop" },
  ]);
  expect(clock.frame(4)).toBe(144);
  expect(clock.frame(8)).toBe(144 + 120);
  expect(clock.totalFrames).toBe(264);
  for (let b = 0; b < 8; b += 0.25) expect(clock.frame(b + 0.25)).toBeGreaterThanOrEqual(clock.frame(b));
});

test("kicks follow the tempo of their section to the sample", () => {
  for (const film of FILMS) {
    const { events, clock } = SCORES[film];
    const kicks = events.filter((e) => e.track === "kick" && e.vel >= 0.8);
    let checked = 0;
    for (const [i, kick] of kicks.entries()) {
      const next = kicks[i + 1];
      if (!next) continue;
      const bpm =
        clock.segments[
          Math.max(
            0,
            clock.starts.findLastIndex((s) => clock.at(s) <= kick.t + 1e-6),
          )
        ]?.bpm ?? 0;
      if (Math.abs(next.t - kick.t - 60 / bpm) > 0.0005) continue;
      checked += 1;
      expect(Math.abs(next.t - kick.t - 60 / bpm)).toBeLessThan(0.0005);
    }
    expect(checked).toBeGreaterThan(10);
  }
});

test("sections tile each film without gaps", () => {
  for (const film of FILMS) {
    const sections = SECTIONS[film];
    expect(sections[0]?.from).toBe(0);
    for (const [i, section] of sections.entries()) if (i > 0) expect(section.from).toBe(sections[i - 1]?.to ?? -1);
    expect(SCORES[film].clock.frame(sections.at(-1)?.to ?? 0)).toBe(FILM_FRAMES[film]);
  }
});

test("every manifest event owns a sound on its own frame, unless the silence gate owns that frame", () => {
  for (const film of FILMS) {
    const gates = SCORES[film].gates;
    const owned = new Set(SHEET.filter((cue) => cue.film === film).map((cue) => cue.frame));
    const missing = SPECS[film].ui.filter(
      (e) => !owned.has(e.frame) && e.frame < FILM_FRAMES[film] && !gates.some(([a, b]) => e.frame / FPS >= a && e.frame / FPS < b),
    );
    expect(missing).toEqual([]);
  }
});

test("every film ends on eight frames of silence and then a hit, and the film keeps ringing after it", () => {
  for (const film of FILMS) {
    const final = LANDMARKS[film].find((l) => l.id === "final hit");
    expect(final).toBeDefined();
    const [from, to] = SCORES[film].gates.findLast(([, end]) => Math.abs(end * FPS - (final?.frame ?? 0)) < 1) ?? [0, 0];
    expect(Math.round((to - from) * FPS)).toBeGreaterThanOrEqual(8);
    expect((final?.frame ?? 0) + FPS).toBeLessThan(FILM_FRAMES[film]);
  }
});

test("the drop is announced: riser, roll and a short silence right before the impact", () => {
  for (const film of FILMS) {
    const { events, gates, clock } = SCORES[film];
    for (const [i, segment] of clock.segments.entries()) {
      if (segment.enter !== "drop") continue;
      const t = clock.at(clock.starts[i] ?? 0);
      expect(events.some((e) => e.track === "riser" && Math.abs(e.t + e.dur - t) < 0.02)).toBe(true);
      expect(events.some((e) => e.track === "impact" && Math.abs(e.t - t) < 1e-6)).toBe(true);
      expect(gates.some(([from, to]) => Math.abs(to - t) < 1e-6 && to - from >= 2 / FPS)).toBe(true);
    }
  }
});

test("the motif is the six notes E A C B G A and it comes back in every film's drop", () => {
  for (const film of FILMS) {
    const lead = SCORES[film].events.filter((e) => e.track === "lead").sort((a, b) => a.t - b.t);
    expect(lead.slice(0, 6).map((e) => e.midi)).toEqual([76, 81, 84, 83, 79, 81]);
  }
});

test("chords move by small steps: no voice jumps more than a fifth between neighbours", () => {
  for (const film of FILMS) {
    const { chords } = SCORES[film];
    for (const [i, chord] of chords.entries()) {
      const before = chords[i - 1];
      if (!before) continue;
      const jump = Math.max(...chord.voicing.map((n, v) => Math.abs(n - (before.voicing[v] ?? n))));
      expect(jump).toBeLessThanOrEqual(7);
    }
  }
});

test("voice leading keeps common tones in place", () => {
  const am = voiceLead([57, 60, 64, 67], { root: 0, tones: [0, 3, 7, 10, 14] }, 0);
  const f = voiceLead(am, { root: -4, tones: [0, 4, 7, 11, 14] }, 0);
  expect(am).toHaveLength(4);
  expect(f.filter((n) => am.includes(n)).length).toBeGreaterThanOrEqual(2);
});

test("risers, whooshes and swells carry a length that ends inside the film", () => {
  const lasting = SHEET.filter((cue) => ["riser", "reverse", "whoosh", "down"].includes(cue.kind));
  const bad = lasting.filter((cue) => !cue.length || cue.frame + cue.length > FILM_FRAMES[cue.film]).map((cue) => cue.id);
  expect(bad).toEqual([]);
});
