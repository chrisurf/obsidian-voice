import { AwsPollyService } from "../src/service/AwsPollyService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SKIP_SECONDS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
} from "../src/settings/VoiceSettings";

function makeProvider(): AwsPollyService {
  return new AwsPollyService(
    { credentials: { accessKeyId: "", secretAccessKey: "" }, region: "" },
    "Stephen",
    1.0,
  );
}

// Give the mocked audio element a seekable timeline.
function seekable(
  provider: AwsPollyService,
  currentTime: number,
  duration = 100,
) {
  const audio = provider.getAudio() as unknown as {
    currentTime: number;
    duration: number;
  };
  audio.duration = duration;
  audio.currentTime = currentTime;
  return audio;
}

describe("Unit Tests - Configurable Skip Interval", () => {
  describe("Defaults", () => {
    test("rewind and forward default to 3 seconds", () => {
      const provider = makeProvider();
      expect(provider.getRewindSeconds()).toBe(DEFAULT_SKIP_SECONDS);
      expect(provider.getForwardSeconds()).toBe(DEFAULT_SKIP_SECONDS);
    });
  });

  describe("Rewind / fast-forward use configured values", () => {
    test("rewind jumps back by the configured seconds", () => {
      const provider = makeProvider();
      provider.setRewindSeconds(10);
      const audio = seekable(provider, 50);
      provider.rewindAudio();
      expect(audio.currentTime).toBe(40);
    });

    test("fast-forward jumps ahead by the configured seconds", () => {
      const provider = makeProvider();
      provider.setForwardSeconds(15);
      const audio = seekable(provider, 50);
      provider.fastForwardAudio();
      expect(audio.currentTime).toBe(65);
    });

    test("rewind never goes below 0", () => {
      const provider = makeProvider();
      provider.setRewindSeconds(10);
      const audio = seekable(provider, 2);
      provider.rewindAudio();
      expect(audio.currentTime).toBe(0);
    });

    test("fast-forward never exceeds the duration", () => {
      const provider = makeProvider();
      provider.setForwardSeconds(10);
      const audio = seekable(provider, 95, 100);
      provider.fastForwardAudio();
      expect(audio.currentTime).toBe(100);
    });
  });

  describe("Clamping", () => {
    test("values below the minimum clamp up", () => {
      const provider = makeProvider();
      provider.setRewindSeconds(0);
      expect(provider.getRewindSeconds()).toBe(MIN_SKIP_SECONDS);
    });

    test("values above the maximum clamp down", () => {
      const provider = makeProvider();
      provider.setForwardSeconds(1000);
      expect(provider.getForwardSeconds()).toBe(MAX_SKIP_SECONDS);
    });

    test("non-finite values fall back to the default", () => {
      const provider = makeProvider();
      provider.setRewindSeconds(Number.NaN);
      expect(provider.getRewindSeconds()).toBe(DEFAULT_SKIP_SECONDS);
    });

    test("fractional values are rounded", () => {
      const provider = makeProvider();
      provider.setForwardSeconds(7.6);
      expect(provider.getForwardSeconds()).toBe(8);
    });
  });

  describe("Factory applies settings", () => {
    test("provider is created with the configured skip intervals", () => {
      const provider = createSpeechProvider({
        ...DEFAULT_SETTINGS,
        rewindSeconds: 7,
        forwardSeconds: 9,
      });
      expect(provider.getRewindSeconds()).toBe(7);
      expect(provider.getForwardSeconds()).toBe(9);
    });

    test("out-of-range settings are clamped by the factory", () => {
      const provider = createSpeechProvider({
        ...DEFAULT_SETTINGS,
        rewindSeconds: 0,
        forwardSeconds: 999,
      });
      expect(provider.getRewindSeconds()).toBe(MIN_SKIP_SECONDS);
      expect(provider.getForwardSeconds()).toBe(MAX_SKIP_SECONDS);
    });
  });
});
