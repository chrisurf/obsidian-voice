import { shouldShowWhatsNew, WHATS_NEW } from "../src/utils/whatsNew";

describe("Unit Tests - What's New", () => {
  describe("shouldShowWhatsNew", () => {
    test("shows on a fresh install (no version seen yet)", () => {
      expect(shouldShowWhatsNew("1.13.0", "")).toBe(true);
    });

    test("shows after an update to a different version", () => {
      expect(shouldShowWhatsNew("1.14.0", "1.13.0")).toBe(true);
    });

    test("does not show again for the same version", () => {
      expect(shouldShowWhatsNew("1.13.0", "1.13.0")).toBe(false);
    });

    test("does not show when the current version is unknown", () => {
      expect(shouldShowWhatsNew("", "")).toBe(false);
    });
  });

  describe("WHATS_NEW content", () => {
    test("highlights the Voice player", () => {
      expect(WHATS_NEW).toMatch(/Voice player/i);
    });

    test("mentions the available engines", () => {
      expect(WHATS_NEW).toMatch(/ElevenLabs/);
      expect(WHATS_NEW).toMatch(/Google Cloud/);
      expect(WHATS_NEW).toMatch(/Azure/);
      expect(WHATS_NEW).toMatch(/OpenAI/);
    });
  });
});
