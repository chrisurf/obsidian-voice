import { resolvePlayTap, type PlayTapState } from "../src/utils/playTap";

/** A note is open, nothing is loaded or running, Cache is on. */
const idle: PlayTapState = {
  synthesizing: false,
  playing: false,
  pausedMidTrack: false,
  loadedAudioIsStale: false,
  hasLoadedAudio: false,
  hasActiveNote: true,
  cacheOn: true,
};

describe("Play button tap Unit", () => {
  it("cancels a running synthesis, whatever the Cache says", () => {
    expect(resolvePlayTap({ ...idle, synthesizing: true })).toBe("cancel");
    expect(
      resolvePlayTap({ ...idle, synthesizing: true, cacheOn: false }),
    ).toBe("cancel");
  });

  it("pauses while playing, also with Cache off", () => {
    expect(resolvePlayTap({ ...idle, playing: true })).toBe("pause");
    expect(resolvePlayTap({ ...idle, playing: true, cacheOn: false })).toBe(
      "pause",
    );
  });

  it("resumes a paused track instead of rendering again", () => {
    const paused = { ...idle, hasLoadedAudio: true, pausedMidTrack: true };
    expect(resolvePlayTap(paused)).toBe("resume");
    expect(resolvePlayTap({ ...paused, cacheOn: false })).toBe("resume");
  });

  it("with Cache on, a fresh start plays the note's existing audio", () => {
    expect(resolvePlayTap(idle)).toBe("play-cached");
    // Audio that ended (not mid-track) also restarts from the cache.
    expect(resolvePlayTap({ ...idle, hasLoadedAudio: true })).toBe(
      "play-cached",
    );
  });

  it("with Cache off, a fresh start renders the note again", () => {
    expect(resolvePlayTap({ ...idle, cacheOn: false })).toBe("regenerate");
    expect(
      resolvePlayTap({ ...idle, cacheOn: false, hasLoadedAudio: true }),
    ).toBe("regenerate");
  });

  it("follows the open note when the paused audio belongs to another", () => {
    const stale = {
      ...idle,
      hasLoadedAudio: true,
      pausedMidTrack: true,
      loadedAudioIsStale: true,
    };
    expect(resolvePlayTap(stale)).toBe("play-cached");
    expect(resolvePlayTap({ ...stale, cacheOn: false })).toBe("regenerate");
  });

  it("without an open note, replays what is loaded", () => {
    const noNote = { ...idle, hasActiveNote: false, cacheOn: false };
    expect(resolvePlayTap({ ...noNote, hasLoadedAudio: true })).toBe("resume");
    expect(resolvePlayTap(noNote)).toBe("play-cached");
  });
});
