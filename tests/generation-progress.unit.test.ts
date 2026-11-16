import {
  ESTIMATE_CAP,
  estimatedChunkShare,
  interpolatedProgress,
} from "../src/utils/generationProgress";

describe("Generation progress Unit", () => {
  it("follows the expected pace, then slows down short of the cap", () => {
    expect(estimatedChunkShare(0, 10000)).toBe(0);
    expect(estimatedChunkShare(5000, 10000)).toBeCloseTo(0.5, 5);
    const due = estimatedChunkShare(10000, 10000);
    const late = estimatedChunkShare(30000, 10000);
    expect(due).toBeGreaterThan(0.75);
    expect(late).toBeGreaterThan(due);
    expect(late).toBeLessThan(ESTIMATE_CAP);
  });

  it("keeps moving without a known pace, never reaching the cap", () => {
    const early = estimatedChunkShare(2000);
    const later = estimatedChunkShare(20000);
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early);
    expect(estimatedChunkShare(10 ** 7)).toBeLessThanOrEqual(ESTIMATE_CAP);
  });

  it("never moves backwards as time passes", () => {
    let last = 0;
    for (let ms = 0; ms <= 60000; ms += 250) {
      const share = estimatedChunkShare(ms, 8000);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });

  it("places the estimate between the chunk's start and end mark", () => {
    const value = interpolatedProgress({
      from: 0.2,
      to: 0.6,
      elapsedMs: 4000,
      msPerChar: 10,
      chunkChars: 800, // expected 8 s → half done
    });
    expect(value).toBeCloseTo(0.4, 5);
    expect(
      interpolatedProgress({
        from: 0.2,
        to: 0.6,
        elapsedMs: 10 ** 6,
        msPerChar: 10,
        chunkChars: 800,
      }),
    ).toBeLessThan(0.6);
  });
});
