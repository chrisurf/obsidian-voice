import {
  formatSpeed,
  speedChoices,
  SPEED_PRESETS,
} from "../src/utils/speedChoices";

describe("Speed menu Unit", () => {
  it("offers the presets when the current speed is one of them", () => {
    expect(speedChoices(1)).toEqual(SPEED_PRESETS);
    expect(speedChoices(1.1)).toEqual(SPEED_PRESETS);
  });

  it("lists a speed set elsewhere in its place", () => {
    const choices = speedChoices(1.6);
    expect(choices).toContain(1.6);
    expect(choices.indexOf(1.6)).toBe(choices.indexOf(1.5) + 1);
  });

  it("ignores out-of-range values", () => {
    expect(speedChoices(3)).toEqual(SPEED_PRESETS);
  });

  it("formats with one decimal", () => {
    expect(formatSpeed(1)).toBe("1.0×");
    expect(formatSpeed(1.25)).toBe("1.3×");
  });
});
