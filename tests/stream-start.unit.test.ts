import {
  DEFAULT_START_PERCENT,
  mergeRate,
  rampedChunkLimit,
  shouldStartPlayback,
  startFractionForRate,
  startPercentForRate,
  streamRateKey,
} from "../src/utils/streamStart";

describe("Play while generating Unit", () => {
  it("starts right after the first chunk when generation outpaces playback", () => {
    expect(startFractionForRate(1.7)).toBe(0);
    expect(startFractionForRate(1)).toBe(0);
  });

  it("waits for 1 - rate of the note, plus head room, when generation is slower", () => {
    // 0.8× real time: playback would catch up unless 20 % (+10 %) is ready.
    expect(startPercentForRate(0.8)).toBe(30);
    expect(startPercentForRate(0.5)).toBe(60);
    expect(startFractionForRate(0.05)).toBe(1);
  });

  it("accounts for the playback speed", () => {
    // 1.7× generation can't keep up with 2× playback.
    expect(startPercentForRate(1.7, 2)).toBe(25);
    expect(startPercentForRate(0.8, 0.5)).toBe(0);
  });

  it("falls back to the default without a valid rate", () => {
    expect(startPercentForRate(0)).toBe(DEFAULT_START_PERCENT);
    expect(startPercentForRate(NaN)).toBe(DEFAULT_START_PERCENT);
  });

  it("averages measurements and keeps the slower one after a stall", () => {
    expect(mergeRate(undefined, 1.2, false)).toBe(1.2);
    expect(mergeRate(1.0, 2.0, false)).toBe(1.5);
    expect(mergeRate(2.0, 1.0, true)).toBe(1.0);
  });

  it("starts once the share is ready, never before the first chunk", () => {
    const state = { chunksReady: 1, charsReady: 300, totalChars: 1000 };
    expect(shouldStartPlayback({ ...state, fraction: 0 })).toBe(true);
    expect(shouldStartPlayback({ ...state, fraction: 0.3 })).toBe(true);
    expect(shouldStartPlayback({ ...state, fraction: 0.31 })).toBe(false);
    expect(
      shouldStartPlayback({
        ...state,
        chunksReady: 0,
        charsReady: 0,
        fraction: 0,
      }),
    ).toBe(false);
    expect(
      shouldStartPlayback({ ...state, charsReady: 1000, fraction: 1 }),
    ).toBe(true);
  });

  it("grows chunks from small to the provider's limit", () => {
    const limits = [0, 1, 2, 3, 4].map((i) => rampedChunkLimit(i, 300, 2000));
    expect(limits).toEqual([300, 600, 1200, 2000, 2000]);
  });

  it("measures each OpenAI-compatible server on its own", () => {
    expect(streamRateKey("polly", "http://ignored")).toBe("polly");
    expect(
      streamRateKey("openai-compatible", "http://127.0.0.1:8880/v1/"),
    ).toBe("openai-compatible:http://127.0.0.1:8880/v1");
    expect(streamRateKey("openai-compatible", "")).toBe("openai-compatible");
  });
});
